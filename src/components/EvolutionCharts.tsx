import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { CaveEntity } from '../types/caves';
import mappingImage from '../assets/images/speleo_survey_mapping_1794668122486.jpg';

gsap.registerPlugin(ScrollTrigger);

interface EvolutionChartsProps {
  caves: CaveEntity[];
  selectedYear: number;
  onSelectCave: (cave: CaveEntity) => void;
}

export const EvolutionCharts: React.FC<EvolutionChartsProps> = ({
  caves,
  selectedYear,
  onSelectCave,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const topGrowthCaves = useMemo(() => {
    return caves
      .map((cave) => {
        const sorted = [...cave.records].sort((a, b) => a.year - b.year);
        const first = sorted.find((r) => r.lengthM != null);
        const target =
          sorted.find((r) => r.year === selectedYear && r.lengthM != null) ||
          [...sorted].filter((r) => r.year <= selectedYear && r.lengthM != null).pop();
        if (!first?.lengthM || !target?.lengthM) return null;

        const totalGain = target.lengthM - first.lengthM;
        return {
          cave,
          startYear: first.year,
          startLen: first.lengthM,
          currentLen: target.lengthM,
          totalGain,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.currentLen - a.currentLen)
      .slice(0, 8);
  }, [caves, selectedYear]);

  const regionalStats = useMemo(() => {
    const map = new Map<string, { region: string; count: number; totalLength: number; maxDepth: number }>();
    for (const cave of caves) {
      const rec =
        cave.records.find((r) => r.year === selectedYear) ||
        [...cave.records].filter((r) => r.year <= selectedYear).sort((a, b) => b.year - a.year)[0];
      if (!rec) continue;
      const prev = map.get(cave.karstRegion) || {
        region: cave.karstRegion,
        count: 0,
        totalLength: 0,
        maxDepth: 0,
      };
      prev.count += 1;
      prev.totalLength += rec.lengthM || 0;
      prev.maxDepth = Math.max(prev.maxDepth, rec.depthM || 0);
      map.set(cave.karstRegion, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.totalLength - a.totalLength).slice(0, 7);
  }, [caves, selectedYear]);

  const maxBarLen = Math.max(...topGrowthCaves.map((c) => c.currentLen), 1);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const bars = containerRef.current.querySelectorAll('.gsap-growth-bar');
    gsap.fromTo(
      bars,
      { scaleX: 0, transformOrigin: 'left center' },
      {
        scaleX: 1,
        duration: 0.7,
        stagger: 0.06,
        ease: 'power3.out',
      }
    );
  }, [selectedYear, topGrowthCaves.length]);

  return (
    <section id="vyvoj" ref={containerRef} className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="border-b border-[#e1e4e8] pb-6">
        <p className="text-xs font-medium tracking-wide text-[#c13100]">
          Dlhodobá analytika prieskumu · Stav k roku {selectedYear}
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
          Vývoj dĺžky najvýznamnejších jaskynných systémov
        </h2>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left: Top 8 caves cumulative vs initial survey */}
        <div className="lg:col-span-7 rounded-xl border border-[#e1e4e8] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <h3 className="font-display text-lg font-bold text-[#1a1e23]">
              Historický nárast zameraných metrov
            </h3>
            <div className="flex items-center gap-4 text-xs text-[#5a6370]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#1a1e23]" />
                Základný záznam
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                Prírastok objavov
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {topGrowthCaves.map((item) => {
              const totalPct = (item.currentLen / maxBarLen) * 100;
              const basePct = (item.startLen / item.currentLen) * 100;
              return (
                <button
                  key={item.cave.id}
                  type="button"
                  onClick={() => onSelectCave(item.cave)}
                  className="block w-full text-left group"
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs mb-1.5">
                    <span className="font-semibold text-[#1a1e23] group-hover:text-emerald-700 transition-colors">
                      {item.cave.name}
                    </span>
                    <span className="font-mono-tabular text-[#1a1e23]">
                      {item.currentLen.toLocaleString('sk-SK')} m
                      {item.totalGain > 0 && (
                        <span className="ml-2 font-bold text-emerald-700">
                          (+{item.totalGain.toLocaleString('sk-SK')} m od {item.startYear})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-sm bg-[#f4f5f7]">
                    <div
                      className="gsap-growth-bar flex h-full overflow-hidden rounded-sm"
                      style={{ width: `${Math.max(totalPct, 4)}%` }}
                    >
                      <div
                        className="h-full bg-[#1a1e23]"
                        style={{ width: `${basePct}%` }}
                      />
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.max(100 - basePct, 0)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Regional Karst Breakdown + Archival Editorial Visual */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          <div className="rounded-xl border border-[#e1e4e8] bg-white p-6">
            <h3 className="font-display text-lg font-bold text-[#1a1e23]">
              Sumár podľa krasových oblastí ({selectedYear})
            </h3>
            <div className="mt-4 divide-y divide-[#e1e4e8]">
              {regionalStats.map((reg) => (
                <div key={reg.region} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <p className="font-semibold text-[#1a1e23]">{reg.region}</p>
                    <p className="text-[#5a6370]">
                      {reg.count} evid. lokalít · max hĺbka {reg.maxDepth} m
                    </p>
                  </div>
                  <span className="font-mono-tabular text-sm font-bold text-[#1a1e23]">
                    {reg.totalLength.toLocaleString('sk-SK')} m
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-[#e1e4e8] bg-[#1a1e23] text-white">
            <img
              src={mappingImage}
              alt="Historická speleologická dokumentácia a mapovanie krasových priestorov"
              referrerPolicy="no-referrer"
              className="h-48 w-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1e23] via-[#1a1e23]/70 to-transparent" />
            <div className="relative p-5 -mt-20">
              <p className="text-xs font-medium text-[#fbbc05]">
                Metodika zameriavania SSS
              </p>
              <h4 className="mt-1 font-display text-base font-bold text-white">
                Stabilizovaný polygón a revízne merania
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-[#c8cfd8]">
                Údaje označené hviezdičkou (*) zachytávajú priebežné revízne merania
                (napr. v systéme Mesačný tieň), kým sa uzavrie stabilizovaný meračský polygón.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
