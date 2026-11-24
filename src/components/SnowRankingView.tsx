import React, { useMemo, useState } from 'react';
import { CalendarDays, Mountain, MountainSnow, Snowflake, TrendingUp } from 'lucide-react';
import { SnowRecord } from '../types';
import { getISOWeek } from '../utils/scoring';
import { KpiItem, KpiStrip } from './KpiStrip';
import { RankBadge } from './RankBadge';

interface SnowRankingViewProps {
  snow: SnowRecord[];
  onSelectStationHistory: (stationName: string) => void;
}

type PeriodMode = 'day' | 'week';
type SnowMetric = 'ground' | 'fresh' | 'max_depth';

export const SnowRankingView: React.FC<SnowRankingViewProps> = ({
  snow,
  onSelectStationHistory,
}) => {
  const [mode, setMode] = useState<PeriodMode>('day');
  const [dateInput, setDateInput] = useState('2026-02-15');
  const [isoWeek, setIsoWeek] = useState(7);
  const [metric, setMetric] = useState<SnowMetric>('ground');
  const [focusedStation, setFocusedStation] = useState<string | null>(null);

  const ranked = useMemo(() => {
    if (snow.length === 0) return [];

    const groups = new Map<
      string,
      { sum: number; count: number; maxAlt: number | null; peak: number }
    >();

    if (mode === 'day') {
      const mmdd = dateInput.length >= 10 ? dateInput.slice(5, 10) : '';
      if (!/^\d{2}-\d{2}$/.test(mmdd)) return [];

      for (const r of snow) {
        if (r.day.slice(5, 10) !== mmdd) continue;
        const val = r[metric];
        if (val === null || Number.isNaN(val)) continue;
        const curr = groups.get(r.station) ?? { sum: 0, count: 0, maxAlt: null, peak: 0 };
        curr.sum += val;
        curr.count += 1;
        if (val > curr.peak) curr.peak = val;
        if (r.obs_alt !== null && (curr.maxAlt === null || r.obs_alt > curr.maxAlt)) {
          curr.maxAlt = r.obs_alt;
        }
        groups.set(r.station, curr);
      }
    } else {
      const daily = new Map<string, { station: string; day: string; val: number; obsAlt: number | null }>();
      for (const r of snow) {
        const val = r[metric];
        if (val === null || Number.isNaN(val)) continue;
        const w = getISOWeek(r.day);
        if (w !== isoWeek) continue;
        const key = `${r.station}__${r.day}`;
        if (!daily.has(key)) {
          daily.set(key, { station: r.station, day: r.day, val, obsAlt: r.obs_alt });
        }
      }
      for (const item of daily.values()) {
        const curr = groups.get(item.station) ?? { sum: 0, count: 0, maxAlt: null, peak: 0 };
        curr.sum += item.val;
        curr.count += 1;
        if (item.val > curr.peak) curr.peak = item.val;
        if (item.obsAlt !== null && (curr.maxAlt === null || item.obsAlt > curr.maxAlt)) {
          curr.maxAlt = item.obsAlt;
        }
        groups.set(item.station, curr);
      }
    }

    return Array.from(groups.entries())
      .map(([station, stats]) => ({
        station,
        avg: stats.sum / stats.count,
        peak: stats.peak,
        count: stats.count,
        obsAlt: stats.maxAlt,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 20);
  }, [dateInput, isoWeek, metric, mode, snow]);

  const focusedEntry = useMemo(() => {
    if (!focusedStation) return null;
    const idx = ranked.findIndex((r) => r.station === focusedStation);
    if (idx === -1) return null;
    return { item: ranked[idx], rank: idx + 1 };
  }, [focusedStation, ranked]);

  const kpis: KpiItem[] = useMemo(() => {
    if (ranked.length === 0) {
      return [
        {
          label: 'Record neige',
          value: '—',
          subtext: 'Aucun relevé pour cette période',
          icon: Snowflake,
          iconColor: '#38BDF8',
        },
        {
          label: 'Poste météo max',
          value: '—',
          subtext: 'Altitude d’observation',
          icon: Mountain,
          iconColor: '#64C99A',
        },
        {
          label: 'Moyenne TOP 20',
          value: '—',
          subtext: 'Épaisseur moyenne',
          icon: MountainSnow,
          iconColor: '#35C6D0',
        },
        {
          label: 'Stations classées',
          value: '0',
          subtext: 'Avec données disponibles',
          icon: CalendarDays,
          iconColor: '#A78BFA',
        },
      ];
    }

    if (focusedEntry) {
      const { item, rank } = focusedEntry;
      return [
        {
          label: `Station sélectionnée · Rang ${String(rank).padStart(2, '0')}`,
          value: item.station,
          subtext: `Moyenne ${item.avg.toFixed(1)} cm · ${item.count} relevés`,
          icon: Snowflake,
          iconColor: rank === 1 ? '#FFD700' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#F59E0B' : '#38BDF8',
          actionLabel: 'Revenir au 01',
          onAction: () => setFocusedStation(null),
        },
        {
          label: 'Poste météo',
          value: item.obsAlt !== null ? `${Math.round(item.obsAlt)} m` : '—',
          subtext: 'Altitude de la balise neige',
          icon: Mountain,
          iconColor: '#64C99A',
        },
        {
          label: 'Pic sur la période',
          value: `${item.peak.toFixed(0)} cm`,
          subtext: mode === 'day' ? `Jour ${dateInput.slice(5, 10)}` : `Semaine ISO ${String(isoWeek).padStart(2, '0')}`,
          icon: MountainSnow,
          iconColor: '#35C6D0',
        },
        {
          label: 'Courbe saisonnière',
          value: 'Historique',
          subtext: `Ouvrir la courbe de ${item.station}`,
          icon: TrendingUp,
          iconColor: 'var(--accent)',
          onClick: () => onSelectStationHistory(item.station),
          actionLabel: 'Ouvrir',
          onAction: () => onSelectStationHistory(item.station),
        },
      ];
    }

    const leader = ranked[0];
    const maxAlt = ranked.reduce(
      (acc, r) => (r.obsAlt !== null && r.obsAlt > acc ? r.obsAlt : acc),
      0
    );
    const avgTop20 = ranked.reduce((acc, r) => acc + r.avg, 0) / ranked.length;

    return [
      {
        label: 'Record neige (moyenne)',
        value: `${leader.avg.toFixed(1)} cm`,
        subtext: leader.station,
        icon: Snowflake,
        iconColor: '#38BDF8',
        actionLabel: 'Courbe',
        onAction: () => onSelectStationHistory(leader.station),
      },
      {
        label: 'Poste météo max',
        value: maxAlt > 0 ? `${Math.round(maxAlt)} m` : '—',
        subtext: 'Altitude la plus élevée',
        icon: Mountain,
        iconColor: '#64C99A',
      },
      {
        label: 'Moyenne TOP 20',
        value: `${avgTop20.toFixed(1)} cm`,
        subtext: 'Toutes stations classées',
        icon: MountainSnow,
        iconColor: '#35C6D0',
      },
      {
        label: 'Stations classées',
        value: `${ranked.length}`,
        subtext:
          mode === 'day'
            ? `Relevés du ${dateInput.slice(5, 10)}`
            : `Semaine ISO ${String(isoWeek).padStart(2, '0')}`,
        icon: CalendarDays,
        iconColor: '#A78BFA',
      },
    ];
  }, [dateInput, focusedEntry, isoWeek, mode, onSelectStationHistory, ranked]);

  const maxVal = ranked[0]?.avg || 1;
  const metricLabel =
    metric === 'ground'
      ? 'Neige au sol'
      : metric === 'fresh'
        ? 'Neige fraîche'
        : 'Épaisseur maximale';

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Mode de période
            </span>
            <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1">
              <button
                type="button"
                onClick={() => setMode('day')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  mode === 'day'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Jour (MM-JJ)
              </button>
              <button
                type="button"
                onClick={() => setMode('week')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  mode === 'week'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Semaine ISO
              </button>
            </div>
          </div>

          {mode === 'day' ? (
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Date de référence (MM-JJ multi-saisons)
              </span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-mono-num text-[var(--text-primary)]"
              />
            </label>
          ) : (
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Semaine ISO (1–53)
              </span>
              <input
                type="number"
                min={1}
                max={53}
                value={isoWeek}
                onChange={(e) =>
                  setIsoWeek(Math.min(53, Math.max(1, Number(e.target.value) || 1)))
                }
                className="h-9 w-28 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-mono-num text-[var(--text-primary)]"
              />
            </label>
          )}

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Indicateur mesuré
            </span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as SnowMetric)}
              className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              <option value="ground">Neige au sol</option>
              <option value="fresh">Neige fraîche</option>
              <option value="max_depth">Épaisseur maximale</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            TOP 20 — {metricLabel}
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            Cliquez sur une station pour mettre à jour les cartes ci-dessus
          </span>
        </div>

        {ranked.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            Aucun relevé disponible pour cette date ou semaine ISO. Essayez une date d’hiver (ex. décembre à avril).
          </div>
        ) : (
          <div className="space-y-1.5">
            {ranked.map((item, idx) => {
              const rank = idx + 1;
              const isSelected = focusedStation === item.station;
              const ratio = item.avg / maxVal;
              const barColor =
                ratio > 0.75
                  ? '#38BDF8'
                  : ratio > 0.5
                    ? '#2DD4BF'
                    : ratio > 0.25
                      ? '#64C99A'
                      : '#94A3B8';
              const widthPct = Math.max(4, ratio * 100);

              return (
                <div
                  key={item.station}
                  onClick={() =>
                    setFocusedStation((prev) =>
                      prev === item.station ? null : item.station
                    )
                  }
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
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
                  >
                    {item.station}
                  </span>

                  <div className="flex-1 h-3.5 rounded-[4px] bg-[var(--bg-page)] overflow-hidden">
                    <div
                      className="h-full rounded-[4px] transition-all duration-200"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>

                  <span className="hidden sm:inline-block w-24 shrink-0 text-right text-[11px] font-mono-num tabular-nums text-[var(--text-muted)]">
                    {item.obsAlt !== null ? `${Math.round(item.obsAlt)} m` : '—'} · {item.count} rel.
                  </span>

                  <span
                    className={`inline-flex h-6 min-w-16 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-bold font-mono-num tabular-nums ${
                      rank <= 3 || isSelected
                        ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-page)]'
                        : 'border-[var(--border-hairline)] text-[var(--text-primary)] bg-[var(--bg-page)]'
                    }`}
                  >
                    {item.avg.toFixed(1)} cm
                  </span>

                  <button
                    type="button"
                    aria-label={`Ouvrir l'historique de ${item.station}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStationHistory(item.station);
                    }}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                  >
                    <TrendingUp className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
