import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CaveEntity } from '../types/caves';
import { buildRankedRows } from './exportReports';

const cave: CaveEntity = {
  id: 'historical-cave',
  name: 'Historická jaskyňa',
  karstRegion: 'Nízke Tatry',
  subUnit: '',
  description: '',
  records: [
    { year: 1998, statusDate: '1998', lengthM: 1200, depthM: 150, sourceIssue: '1/1998', sourcePdfUrl: '' },
    { year: 2000, statusDate: '2000', lengthM: 1400, depthM: null, deltaLengthM: 200, sourceIssue: '1/2000', sourcePdfUrl: '' },
  ],
};

test('historical records do not leak into other ranking years', () => {
  assert.deepEqual(buildRankedRows([cave], 1999, 'length'), []);
  assert.deepEqual(buildRankedRows([cave], 2026, 'depth'), []);
});

test('a missing metric is not filled from an older issue', () => {
  assert.deepEqual(buildRankedRows([cave], 2000, 'depth'), []);
  const rows = buildRankedRows([cave], 2000, 'length');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valueM, 1400);
  assert.equal(rows[0].deltaM, 200);
  assert.equal(rows[0].sourceIssue, '1/2000');
});

test('independently imported metrics retain their own source and date', () => {
  const imported = structuredClone(cave);
  imported.records[1].sourceLength = {
    issue: '2/2000', pdfUrl: 'https://sss.sk/source.pdf', pdfPage: 21, statusDate: '31. 3. 2000',
  };
  const [row] = buildRankedRows([imported], 2000, 'length');
  assert.equal(row.sourceIssue, '2/2000');
  assert.equal(row.statusDate, '31. 3. 2000');
});

test('the 2005 and 2006 rankings use their respective printed SSS tables', () => {
  const caves: CaveEntity[] = JSON.parse(readFileSync(new URL('../../data/caves-db.json', import.meta.url), 'utf8'));
  const editions = [
    { year: 2005, issue: 'Spravodaj SSS 2/2005', date: '31. 3. 2005', length: 56, depth: 52, ranks: [30, 48], shadow: [1820, 142] },
    { year: 2006, issue: 'Spravodaj SSS 1/2006', date: '28. 2. 2006', length: 55, depth: 55, ranks: [31, 51], shadow: [9500, 433] },
  ];
  const stefanova = caves.find(cave => cave.id === 'stefanova');
  for (const edition of editions) {
    const record = stefanova?.records.find(record => record.year === edition.year);
    assert.deepEqual(
      [record?.lengthM, record?.depthM, record?.sourceIssue, record?.rankLength, record?.rankDepth],
      [1521, 91, edition.issue, ...edition.ranks],
    );
    for (const [index, metric] of (['length', 'depth'] as const).entries()) {
      const rows = buildRankedRows(caves, edition.year, metric);
      assert.equal(rows.length, edition[metric]);
      assert.ok(rows.every(row => row.sourceIssue === edition.issue && row.statusDate === edition.date));
      assert.equal(rows.find(row => row.cave.id === 'mesacny-tien')?.valueM, edition.shadow[index]);
      assert.equal(rows.find(row => row.cave.id === 'stratenska-jaskyna-psie-diery')?.valueM, index === 0 ? 21987 : 194);
      assert.ok(!rows.some(row => row.cave.id === 'system-stratenskej-jaskyne'));
    }
  }
  const next = stefanova?.records.find(record => record.year === 2007);
  assert.deepEqual([next?.deltaLengthM, next?.deltaDepthM], [1118, 19]);
  const corrected = stefanova?.records.find(record => record.year === 2013);
  assert.deepEqual([corrected?.depthM, corrected?.deltaLengthM, corrected?.validationWarning], [104, 492, undefined]);
});
