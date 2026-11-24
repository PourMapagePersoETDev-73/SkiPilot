import React, { useState } from 'react';
import { ComputedStation, WeightsConfig } from '../types';
import { RankBadge } from './RankBadge';

interface Top20StackedChartProps {
  stations: ComputedStation[];
  weights: WeightsConfig;
  selectedStationName: string | null;
  onSelectStation: (stationName: string) => void;
}

const CRITERIA_COLORS = {
  low: '#38BDF8',     // Alt. basse - bleu ciel
  high: '#2DD4BF',    // Alt. haute - turquoise
  village: '#64C99A', // Village - vert menthe
  size: '#A78BFA',    // Taille - violet
  price: '#F59E0B',   // Prix - ambre
};

export const Top20StackedChart: React.FC<Top20StackedChartProps> = ({
  stations,
  weights,
  selectedStationName,
  onSelectStation,
}) => {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const top20 = stations.slice(0, 20);

  if (top20.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 text-sm text-[var(--text-muted)]">
        Aucune station ne correspond aux filtres actuels.
      </div>
    );
  }

  const maxTotal = Math.max(...top20.map((s) => s.total), 1);

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            TOP 20 — Comparatif des scores en direct
          </h2>
          {top20.length >= 3 && (
            <p className="mt-0.5 text-xs text-[var(--accent)] font-mono-num tabular-nums">
              Podium : 1. {top20[0].name} ({top20[0].total}p) · 2. {top20[1].name} ({top20[1].total}p) · 3. {top20[2].name} ({top20[2].total}p)
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CRITERIA_COLORS.low }} />
            Alt. basse ×{weights.alt}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CRITERIA_COLORS.high }} />
            Alt. haute ×{weights.alt}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CRITERIA_COLORS.village }} />
            Village ×{weights.village}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CRITERIA_COLORS.size }} />
            Taille ×{weights.size}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CRITERIA_COLORS.price }} />
            Prix ×{weights.price}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {top20.map((station, idx) => {
          const rank = idx + 1;
          const cLow = weights.alt * station.pts_low;
          const cHigh = weights.alt * station.pts_high;
          const cVillage = weights.village * station.pts_village;
          const cSize = weights.size * station.pts_size;
          const cPrice = weights.price * station.pts_price;

          // Scale relative to maxTotal so segments stay cleanly separated with gaps
          const segWidth = (val: number) => `${(val / maxTotal) * 92}%`;
          const isHovered = hoveredName === station.name;
          const isSelected = selectedStationName === station.name;

          return (
            <div
              key={station.name}
              className="relative"
              onMouseEnter={() => setHoveredName(station.name)}
              onMouseLeave={() => setHoveredName(null)}
            >
              <button
                type="button"
                onClick={() => onSelectStation(station.name)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--bg-elevated)] ring-1 ring-[var(--accent)]'
                    : 'hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <RankBadge rank={rank} />

                <span
                  className={`w-40 sm:w-48 shrink-0 truncate text-xs ${
                    rank <= 3 || isSelected
                      ? 'font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                  title={station.name}
                >
                  {station.name}
                </span>

                <div className="flex flex-1 items-center gap-1.5 h-3.5 min-w-0">
                  {cLow > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-all duration-150"
                      style={{ width: segWidth(cLow), backgroundColor: CRITERIA_COLORS.low }}
                    />
                  )}
                  {cHigh > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-all duration-150"
                      style={{ width: segWidth(cHigh), backgroundColor: CRITERIA_COLORS.high }}
                    />
                  )}
                  {cVillage > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-all duration-150"
                      style={{ width: segWidth(cVillage), backgroundColor: CRITERIA_COLORS.village }}
                    />
                  )}
                  {cSize > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-all duration-150"
                      style={{ width: segWidth(cSize), backgroundColor: CRITERIA_COLORS.size }}
                    />
                  )}
                  {cPrice > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-all duration-150"
                      style={{ width: segWidth(cPrice), backgroundColor: CRITERIA_COLORS.price }}
                    />
                  )}
                </div>

                <span
                  className={`inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-bold font-mono-num tabular-nums ${
                    rank <= 3 || isSelected
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-page)]'
                      : 'border-[var(--border-hairline)] text-[var(--text-secondary)] bg-[var(--bg-page)]'
                  }`}
                >
                  {station.total}
                </span>
              </button>

              {isHovered && (
                <div className="pointer-events-none absolute right-14 -top-8 z-20 hidden sm:flex items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--text-primary)] shadow-lg font-mono-num tabular-nums">
                  <span className="font-semibold">{station.name}</span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span>Alt. basse: +{cLow}</span>
                  <span>Alt. haute: +{cHigh}</span>
                  <span>Village: +{cVillage}</span>
                  <span>Taille: +{cSize}</span>
                  <span>Prix: +{cPrice}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
