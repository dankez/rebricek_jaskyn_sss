import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CaveEntity } from '../types/caves';

export interface RankedCaveRow {
  rank: number;
  cave: CaveEntity;
  valueM: number;
  deltaM: number | null;
  isBoldChanged: boolean;
  isUnverified: boolean;
  secondaryNote?: string;
  unverifiedNote?: string;
  sourceIssue: string;
  statusDate: string;
}

export function buildRankedRows(
  caves: CaveEntity[],
  year: number,
  metric: 'length' | 'depth'
): RankedCaveRow[] {
  const rows: RankedCaveRow[] = [];

  for (const cave of caves) {
    const rec = cave.records.find((r) => r.year === year);
    if (!rec) continue;

    const val = metric === 'length' ? rec.lengthM : rec.depthM;
    if (val == null || val <= 0) continue;

    const isBold = Boolean(metric === 'length' ? rec.isBoldLength : rec.isBoldDepth);
    const delta = metric === 'length' ? rec.deltaLengthM ?? null : rec.deltaDepthM ?? null;
    const source = metric === 'length' ? rec.sourceLength : rec.sourceDepth;

    rows.push({
      rank: 0,
      cave,
      valueM: val,
      deltaM: delta,
      isBoldChanged: isBold,
      isUnverified: Boolean(rec.isUnverified),
      secondaryNote: rec.secondarySurveyNote,
      unverifiedNote: rec.unverifiedNote,
      sourceIssue: source?.issue ?? rec.sourceIssue,
      statusDate: source?.statusDate ?? rec.statusDate,
    });
  }

  rows.sort((a, b) => b.valueM - a.valueM || a.cave.name.localeCompare(b.cave.name, 'sk'));
  rows.forEach((r, idx) => {
    r.rank = idx + 1;
  });
  return rows;
}

export function exportRankingsCsv(
  rows: RankedCaveRow[],
  year: number,
  metric: 'length' | 'depth'
): void {
  const metricLabel = metric === 'length' ? 'Dĺžka (m)' : 'Hĺbka (m)';
  const headers = [
    'Poradie',
    'Názov jaskyne',
    'Krasová oblasť',
    'Podcelok',
    metricLabel,
    'Medziročná zmena (m)',
    'Zmena (Tučné písmo)',
    'Neoverený údaj (*)',
    'Poznámka k meraniu',
    'Zdrojový Spravodaj',
    'Stav k dátumu',
  ];

  const escapeCsv = (val: string | number | boolean | null | undefined) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCsv).join(';'),
    ...rows.map((r) =>
      [
        r.rank,
        r.cave.name,
        r.cave.karstRegion,
        r.cave.subUnit,
        r.valueM,
        r.deltaM != null && r.deltaM !== 0 ? (r.deltaM > 0 ? `+${r.deltaM}` : r.deltaM) : '0',
        r.isBoldChanged ? 'Áno' : 'Nie',
        r.isUnverified ? 'Áno (*)' : 'Nie',
        r.secondaryNote || '',
        r.sourceIssue,
        r.statusDate,
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  // UTF-8 BOM for clean Slovak diacritics in Excel
  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sss_rebricek_${metric === 'length' ? 'najdlhsie' : 'najhlbsie'}_${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Transliterate Slovak diacritics only if jsPDF standard font needs safe fallback
function toPdfSafe(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function exportRankingsPdf(
  rows: RankedCaveRow[],
  year: number,
  metric: 'length' | 'depth'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title =
    metric === 'length'
      ? `TABULKA NAJDLHSICH JASKYN NA SLOVENSKU (${year})`
      : `TABULKA NAJHLBSICH JASKYN NA SLOVENSKU (${year})`;

  doc.setFillColor(26, 30, 35); // --sss-dark #1a1e23
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(251, 188, 5); // --sss-accent #fbbc05
  doc.rect(0, 28, 210, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SLOVENSKA SPELEOLOGICKA SPOLOCNOST (sss.sk)', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 20);

  const changedCount = rows.filter((r) => r.isBoldChanged).length;
  const unverifiedCount = rows.filter((r) => r.isUnverified).length;
  const topCave = rows[0];

  doc.setTextColor(26, 30, 35);
  doc.setFontSize(9);
  doc.text(
    `Pocet evidovanych lokalit: ${rows.length}   |   Zmeny oproti predch. roku (tucne): ${changedCount}   |   Neoverene (*): ${unverifiedCount}`,
    14,
    37
  );
  if (topCave) {
    doc.text(
      toPdfSafe(
        `Rekord rebricka: ${topCave.cave.name} — ${topCave.valueM.toLocaleString('en-US').replace(/,/g, ' ')} m`
      ),
      14,
      42
    );
  }

  autoTable(doc, {
    startY: 47,
    head: [['Por.', 'Jaskyna', 'Krasova oblast', 'Podcelok', metric === 'length' ? 'Dlzka (m)' : 'Hlbka (m)', 'Zmena']],
    body: rows.map((r) => {
      const valStr = `${r.valueM}${r.secondaryNote ? ` ${r.secondaryNote}` : r.isUnverified ? '*' : ''}`;
      const deltaStr = r.deltaM != null && r.deltaM > 0 ? `+${r.deltaM} m` : '-';
      return [
        String(r.rank),
        toPdfSafe(r.cave.name),
        toPdfSafe(r.cave.karstRegion),
        toPdfSafe(r.cave.subUnit),
        valStr,
        deltaStr,
      ];
    }),
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [26, 30, 35],
    },
    headStyles: {
      fillColor: [26, 30, 35],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    didParseCell(data) {
      if (data.section === 'body') {
        const rowObj = rows[data.row.index];
        if (rowObj?.isBoldChanged) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [254, 249, 231];
        }
        if (data.column.index === 5 && rowObj?.deltaM != null && rowObj.deltaM > 0) {
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 260;
  doc.setFontSize(8);
  doc.setTextColor(90, 99, 112);
  doc.text(
    'Poznamka: Tucne vytlacene su lokality, na ktorych nastali zmeny oproti predchadzajucemu zaznamu. (*) Neovereny / revizny udaj.',
    14,
    Math.min(finalY + 8, 282)
  );
  doc.text('Zdroj: Spravodaj SSS (sss.sk/spravodaj/) & Bibliografia SSS (bibliografia.sss.sk)', 14, Math.min(finalY + 13, 287));

  doc.save(`sss_sprava_${metric}_${year}.pdf`);
}
