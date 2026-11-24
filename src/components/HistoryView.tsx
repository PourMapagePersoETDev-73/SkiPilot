import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CloudSnow, Mountain, Snowflake, Wrench } from 'lucide-react';
import { SnowRecord } from '../types';
import { KpiItem, KpiStrip } from './KpiStrip';

interface HistoryViewProps {
  snow: SnowRecord[];
  initialStation?: string | null;
  onOpenMaintenance?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  snow,
  initialStation,
  onOpenMaintenance,
}) => {
  const stations = useMemo(() => {
    const set = new Set<string>();
    for (const r of snow) {
      set.add(r.station);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [snow]);

  const [selectedStation, setSelectedStation] = useState<string>(
    initialStation && stations.includes(initialStation)
      ? initialStation
      : stations[0] || ''
  );

  useEffect(() => {
    if (initialStation && stations.includes(initialStation)) {
      setSelectedStation(initialStation);
    } else if (!selectedStation && stations.length > 0) {
      setSelectedStation(stations[0]);
    }
  }, [initialStation, stations, selectedStation]);

  const stationDates = useMemo(() => {
    const rows = snow.filter((r) => r.station === selectedStation);
    if (rows.length === 0) return { min: '2025-12-01', max: '2026-04-30' };
    let min = rows[0].day;
    let max = rows[0].day;
    for (const r of rows) {
      if (r.day < min) min = r.day;
      if (r.day > max) max = r.day;
    }
    return { min, max };
  }, [selectedStation, snow]);

  const [startDate, setStartDate] = useState('2025-11-25');
  const [endDate, setEndDate] = useState('2026-04-30');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    return snow
      .filter(
        (r) =>
          r.station === selectedStation &&
          r.day >= startDate &&
          r.day <= endDate
      )
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [endDate, selectedStation, snow, startDate]);

  const obsAlt = useMemo(() => {
    for (const r of snow) {
      if (r.station === selectedStation && r.obs_alt !== null) {
        return r.obs_alt;
      }
    }
    return null;
  }, [selectedStation, snow]);

  const stats = useMemo(() => {
    let maxGround = 0;
    let maxDay = '—';
    let totalFresh = 0;
    let snowDays = 0;
    for (const r of filteredRows) {
      if (r.ground !== null && r.ground > maxGround) {
        maxGround = r.ground;
        maxDay = r.day;
      }
      if (r.fresh !== null && r.fresh > 0) {
        totalFresh += r.fresh;
        snowDays++;
      }
    }
    return { maxGround, maxDay, totalFresh, snowDays, count: filteredRows.length };
  }, [filteredRows]);

  const kpis: KpiItem[] = [
    {
      label: 'Altitude poste météo',
      value: obsAlt !== null ? `${Math.round(obsAlt)} m` : '—',
      subtext: selectedStation || 'Aucune station',
      icon: Mountain,
      iconColor: '#64C99A',
    },
    {
      label: 'Neige au sol maximale',
      value: `${Math.round(stats.maxGround)} cm`,
      subtext: stats.maxDay !== '—' ? `Relevé du ${stats.maxDay}` : 'Aucune donnée',
      icon: Snowflake,
      iconColor: '#38BDF8',
    },
    {
      label: 'Cumul de neige fraîche',
      value: `${Math.round(stats.totalFresh)} cm`,
      subtext: `${stats.snowDays} jours de chutes`,
      icon: CloudSnow,
      iconColor: '#35C6D0',
    },
    {
      label: 'Relevés sur la période',
      value: `${stats.count} j`,
      subtext: `${startDate} → ${endDate}`,
      icon: CalendarDays,
      iconColor: '#A78BFA',
    },
  ];

  // SVG chart dimensions
  const chartW = 860;
  const chartH = 240;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxY = useMemo(() => {
    let m = 20;
    for (const r of filteredRows) {
      if (r.ground !== null && r.ground > m) m = r.ground;
      if (r.fresh !== null && r.fresh > m) m = r.fresh;
    }
    return Math.ceil(m / 20) * 20;
  }, [filteredRows]);

  const areaPath = useMemo(() => {
    if (filteredRows.length === 0) return '';
    const n = filteredRows.length;
    const pts = filteredRows.map((r, i) => {
      const x = padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      const y = padT + plotH - ((r.ground ?? 0) / maxY) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX = padL + (n === 1 ? plotW / 2 : plotW);
    const baseY = padT + plotH;
    return `M ${padL},${baseY} L ${pts.join(' L ')} L ${lastX.toFixed(1)},${baseY} Z`;
  }, [filteredRows, maxY, padL, padT, plotH, plotW]);

  const linePath = useMemo(() => {
    if (filteredRows.length === 0) return '';
    const n = filteredRows.length;
    return filteredRows
      .map((r, i) => {
        const x = padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        const y = padT + plotH - ((r.ground ?? 0) / maxY) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [filteredRows, maxY, padL, padT, plotH, plotW]);

  const hoveredRow = hoverIdx !== null ? filteredRows[hoverIdx] : null;
  const hoveredX =
    hoverIdx !== null && filteredRows.length > 1
      ? padL + (hoverIdx / (filteredRows.length - 1)) * plotW
      : padL;

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Station météo
              </span>
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="h-9 w-60 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
              >
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Début
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-mono-num text-[var(--text-primary)]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Fin
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-mono-num text-[var(--text-primary)]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStartDate('2026-09-01');
                setEndDate('2027-05-15');
              }}
              className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Saison 2026-27
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate('2025-11-25');
                setEndDate('2026-04-30');
              }}
              className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Saison 2025-26
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate('2024-11-25');
                setEndDate('2025-04-30');
              }}
              className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Saison 2024-25
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(stationDates.min);
                setEndDate(stationDates.max);
              }}
              className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Tout l’historique
            </button>
            {onOpenMaintenance && (
              <button
                type="button"
                onClick={onOpenMaintenance}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 cursor-pointer"
              >
                <Wrench className="h-3 w-3" />
                <span>Corriger / Nettoyer</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Courbe d’enneigement au sol & chutes fraîches — {selectedStation}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Survolez le graphique pour inspecter chaque relevé quotidien
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: 'var(--accent)' }} />
              Neige au sol (cm)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-sky-400" />
              Neige fraîche (cm)
            </span>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">
            Aucun relevé trouvé pour cette station sur la période sélectionnée.
          </div>
        ) : (
          <div className="relative">
            {hoveredRow && (
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-mono-num tabular-nums text-[var(--text-primary)]">
                <span className="font-semibold">{hoveredRow.day}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>
                  Neige au sol :{' '}
                  <strong className="text-[var(--accent)]">
                    {hoveredRow.ground !== null ? `${hoveredRow.ground} cm` : '—'}
                  </strong>
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>
                  Fraîche :{' '}
                  <strong className="text-sky-400">
                    {hoveredRow.fresh !== null ? `${hoveredRow.fresh} cm` : '0 cm'}
                  </strong>
                </span>
              </div>
            )}

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-64 overflow-visible select-none"
              onMouseLeave={() => setHoverIdx(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / rect.width) * chartW;
                const clamped = Math.max(padL, Math.min(padL + plotW, relX));
                const ratio = (clamped - padL) / plotW;
                const idx = Math.round(ratio * (filteredRows.length - 1));
                setHoverIdx(Math.max(0, Math.min(filteredRows.length - 1, idx)));
              }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = padT + plotH * (1 - t);
                const val = Math.round(maxY * t);
                return (
                  <g key={t}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={padL + plotW}
                      y2={y}
                      stroke="var(--border-hairline)"
                      strokeDasharray={t === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padL - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {filteredRows.map((r, i) => {
                if (!r.fresh || r.fresh <= 0) return null;
                const x =
                  padL +
                  (filteredRows.length === 1
                    ? plotW / 2
                    : (i / (filteredRows.length - 1)) * plotW);
                const barH = (r.fresh / maxY) * plotH;
                const barW = Math.max(2, Math.min(8, plotW / filteredRows.length));
                return (
                  <rect
                    key={`${r.day}-fresh`}
                    x={x - barW / 2}
                    y={padT + plotH - barH}
                    width={barW}
                    height={barH}
                    fill="#38BDF8"
                    opacity={0.75}
                    rx={1}
                  />
                );
              })}

              <path d={areaPath} fill="var(--accent)" opacity={0.14} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />

              <text
                x={padL}
                y={chartH - 6}
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {filteredRows[0].day}
              </text>
              <text
                x={padL + plotW}
                y={chartH - 6}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {filteredRows[filteredRows.length - 1].day}
              </text>

              {hoverIdx !== null && hoveredRow && (
                <g>
                  <line
                    x1={hoveredX}
                    y1={padT}
                    x2={hoveredX}
                    y2={padT + plotH}
                    stroke="var(--text-muted)"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={hoveredX}
                    cy={
                      padT +
                      plotH -
                      ((hoveredRow.ground ?? 0) / maxY) * plotH
                    }
                    r={4.5}
                    fill="var(--accent)"
                    stroke="var(--bg-panel)"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>
          </div>
        )}
      </div>

      {filteredRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-3 text-xs font-semibold text-[var(--text-primary)]">
            Derniers relevés quotidiens enregistrés (60 plus récents)
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-hairline)]">
                  <th className="py-2.5 pl-5 pr-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Saison</th>
                  <th className="py-2.5 px-3 text-right">Neige au sol</th>
                  <th className="py-2.5 px-3 text-right">Épaisseur max</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Neige fraîche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredRows
                  .slice(-60)
                  .reverse()
                  .map((r) => (
                    <tr key={r.day} className="hover:bg-[var(--bg-subtle)]">
                      <td className="py-2 pl-5 pr-3 font-mono-num tabular-nums text-[var(--text-primary)]">
                        {r.day}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num tabular-nums text-[var(--text-muted)]">
                        {r.season}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num tabular-nums font-semibold text-[var(--text-primary)]">
                        {r.ground !== null ? `${r.ground} cm` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                        {r.max_depth !== null ? `${r.max_depth} cm` : '—'}
                      </td>
                      <td className="py-2 pl-3 pr-5 text-right font-mono-num tabular-nums text-sky-400">
                        {r.fresh !== null && r.fresh > 0 ? `+${r.fresh} cm` : '0 cm'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
