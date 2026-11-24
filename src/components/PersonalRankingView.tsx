import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Download,
  Euro,
  Eye,
  EyeOff,
  Info,
  Mountain,
  MountainSnow,
  RotateCcw,
  Search,
  Trophy,
} from 'lucide-react';
import { ComputedStation, StationRecord, WeightsConfig } from '../types';
import { computeStations, fmtTravel, getAvailablePriceSeasons } from '../utils/scoring';
import { exportRankingToExcel } from '../utils/excelParser';
import { KpiItem, KpiStrip } from './KpiStrip';
import { RankBadge } from './RankBadge';
import { Top20StackedChart } from './Top20StackedChart';

interface PersonalRankingViewProps {
  stations: StationRecord[];
  weights: WeightsConfig;
  priceSeason: string;
  onChangePriceSeason: (season: string) => void;
  onChangeWeights: (weights: WeightsConfig) => void;
  onInspectStation: (stationName: string) => void;
}

type SortKey =
  | 'total'
  | 'alt_pts'
  | 'high_alt'
  | 'village'
  | 'km'
  | 'adult'
  | 'travel_min'
  | 'name';

const WEIGHT_FIELDS: Array<{ key: keyof WeightsConfig; label: string }> = [
  { key: 'alt', label: 'Poids Altitude' },
  { key: 'village', label: 'Poids Village' },
  { key: 'size', label: 'Poids Taille' },
  { key: 'price', label: 'Poids Prix' },
];

export const PersonalRankingView: React.FC<PersonalRankingViewProps> = ({
  stations,
  weights,
  priceSeason,
  onChangePriceSeason,
  onChangeWeights,
  onInspectStation,
}) => {
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [showChart, setShowChart] = useState(true);
  const [focusedStationName, setFocusedStationName] = useState<string | null>(null);

  const availableSeasons = useMemo(() => getAvailablePriceSeasons(stations), [stations]);
  const allComputed = useMemo(
    () => computeStations(stations, weights, priceSeason),
    [priceSeason, stations, weights]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of allComputed) {
      if (s.department && s.department.trim()) {
        set.add(s.department.trim());
      }
    }
    return Array.from(set).sort();
  }, [allComputed]);

  const filteredAndSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = allComputed.filter((s) => {
      if (deptFilter !== 'ALL' && s.department.trim() !== deptFilter) return false;
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !s.domain.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });

    const isDesc = sortOrder === 'desc';
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'total') {
        cmp = a.total - b.total;
        if (cmp === 0) {
          cmp = (b.travel_min ?? 9999) - (a.travel_min ?? 9999);
        }
      } else if (sortBy === 'alt_pts') {
        cmp = a.pts_low + a.pts_high - (b.pts_low + b.pts_high);
        if (cmp === 0) cmp = (a.high_alt ?? 0) - (b.high_alt ?? 0);
      } else if (sortBy === 'high_alt') {
        cmp = (a.high_alt ?? -1) - (b.high_alt ?? -1);
      } else if (sortBy === 'village') {
        cmp = a.pts_village - b.pts_village;
        if (cmp === 0) cmp = a.total - b.total;
      } else if (sortBy === 'km') {
        cmp = (a.km ?? -1) - (b.km ?? -1);
      } else if (sortBy === 'adult') {
        const av = a.adult ?? 9999;
        const bv = b.adult ?? 9999;
        cmp = av - bv;
      } else if (sortBy === 'travel_min') {
        const at = a.travel_min ?? 9999;
        const bt = b.travel_min ?? 9999;
        cmp = at - bt;
      } else if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, 'fr');
      }
      return isDesc ? -cmp : cmp;
    });

    return list;
  }, [allComputed, deptFilter, search, sortBy, sortOrder]);

  const focusedEntry = useMemo(() => {
    if (!focusedStationName) return null;
    const idx = filteredAndSorted.findIndex((s) => s.name === focusedStationName);
    if (idx === -1) return null;
    return { station: filteredAndSorted[idx], rank: idx + 1 };
  }, [filteredAndSorted, focusedStationName]);

  const kpis: KpiItem[] = useMemo(() => {
    const leader = filteredAndSorted[0];

    if (focusedEntry) {
      const { station: s, rank } = focusedEntry;
      return [
        {
          label: `Station sélectionnée · Rang ${String(rank).padStart(2, '0')}`,
          value: s.name,
          subtext: `${s.total} pts · ${fmtTravel(s.travel, s.travel_min)}`,
          icon: Trophy,
          iconColor: rank === 1 ? '#FFD700' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#F59E0B' : 'var(--accent)',
          actionLabel: 'Revenir au 01',
          onAction: () => setFocusedStationName(null),
          onClick: () => onInspectStation(s.name),
        },
        {
          label: 'Altitude station',
          value: s.high_alt !== null ? `${Math.round(s.high_alt)} m` : '—',
          subtext:
            s.low_alt !== null
              ? `Base ${Math.round(s.low_alt)} m · ${s.pts_low + s.pts_high} pts`
              : 'Altitude maximale',
          icon: Mountain,
          iconColor: '#64C99A',
          onClick: () => onInspectStation(s.name),
        },
        {
          label: 'Domaine skiable',
          value: s.km !== null ? `${Math.round(s.km)} km` : '—',
          subtext: s.domain || s.kind || 'Pistes du domaine',
          icon: MountainSnow,
          iconColor: '#35C6D0',
          onClick: () => onInspectStation(s.name),
        },
        {
          label: 'Forfait journée adulte',
          value: s.adult !== null ? `${s.adult} €` : '—',
          subtext: s.sixday !== null ? `6 jours : ${s.sixday} €` : 'Tarif remontées',
          icon: Euro,
          iconColor: '#38BDF8',
          actionLabel: 'Fiche complète',
          onAction: () => onInspectStation(s.name),
        },
      ];
    }

    let maxAlt = 0;
    let maxAltName = '';
    let maxKm = 0;
    let maxKmName = '';
    let priceSum = 0;
    let priceCount = 0;

    for (const s of allComputed) {
      if (s.high_alt !== null && s.high_alt > maxAlt) {
        maxAlt = Math.round(s.high_alt);
        maxAltName = s.name;
      }
      if (s.km !== null && s.km > maxKm) {
        maxKm = Math.round(s.km);
        maxKmName = s.name;
      }
      if (s.adult !== null && s.adult > 0) {
        priceSum += s.adult;
        priceCount++;
      }
    }

    const avgPrice = priceCount > 0 ? (priceSum / priceCount).toFixed(1) : '—';

    return [
      {
        label: 'Leader du classement',
        value: leader ? leader.name : '—',
        subtext: leader
          ? `${leader.total} pts · ${fmtTravel(leader.travel, leader.travel_min)}`
          : 'Aucune station',
        icon: Trophy,
        iconColor: '#FFD700',
        actionLabel: leader ? 'Fiche' : undefined,
        onAction: leader ? () => onInspectStation(leader.name) : undefined,
      },
      {
        label: 'Altitude max',
        value: maxAlt > 0 ? `${maxAlt} m` : '—',
        subtext: maxAltName ? `Sommet : ${maxAltName}` : 'Sommet le plus haut',
        icon: Mountain,
        iconColor: '#64C99A',
      },
      {
        label: 'Domaine max',
        value: maxKm > 0 ? `${maxKm} km` : '—',
        subtext: maxKmName ? `Plus grand : ${maxKmName}` : 'Plus grand domaine',
        icon: MountainSnow,
        iconColor: '#35C6D0',
      },
      {
        label: 'Prix jour moyen',
        value: avgPrice !== '—' ? `${avgPrice} €` : '—',
        subtext: `${priceCount} stations tarifées`,
        icon: Euro,
        iconColor: '#38BDF8',
      },
    ];
  }, [allComputed, filteredAndSorted, focusedEntry, onInspectStation]);

  const handleReset = () => {
    onChangeWeights({ alt: 2, village: 1, size: 1, price: 1 });
    setSortBy('total');
    setSortOrder('desc');
    setSearch('');
    setDeptFilter('ALL');
    setFocusedStationName(null);
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WEIGHT_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-secondary)]">{label}</span>
                <span className="font-mono-num tabular-nums font-semibold text-[var(--accent)]">
                  ×{weights[key]}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1 rounded-lg bg-[var(--bg-page)] p-1 border border-[var(--border-hairline)]">
                {[0, 1, 2, 3, 4, 5].map((val) => {
                  const active = weights[key] === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onChangeWeights({ ...weights, [key]: val })}
                      className={`h-7 rounded-md text-xs font-mono-num tabular-nums font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer une station ou domaine..."
                className="h-9 w-56 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Filtrer par département"
              className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              <option value="ALL">Tous départements</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  Dépt. {d}
                </option>
              ))}
            </select>

            <select
              value={priceSeason}
              onChange={(e) => onChangePriceSeason(e.target.value)}
              aria-label="Saison des tarifs"
              className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-mono-num text-[var(--text-primary)]"
            >
              {availableSeasons.map((s) => (
                <option key={s} value={s}>
                  {s === '2026' ? 'Tarifs : 2026 (Base)' : `Tarifs : ${s}`}
                </option>
              ))}
              {availableSeasons.length > 1 && (
                <option value="latest">Tarifs : Dernier connu</option>
              )}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Trier par critère"
              className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              <option value="total">Trier : Score Total</option>
              <option value="alt_pts">Trier : Altitude (points)</option>
              <option value="high_alt">Trier : Altitude haute (m)</option>
              <option value="village">Trier : Village (note)</option>
              <option value="km">Trier : Taille (km)</option>
              <option value="adult">Trier : Prix adulte (€)</option>
              <option value="travel_min">Trier : Temps de trajet</option>
              <option value="name">Trier : Nom</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap cursor-pointer"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{sortOrder === 'desc' ? 'Décroissant' : 'Croissant'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap cursor-pointer"
            >
              {showChart ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showChart ? 'Masquer graphique' : 'Afficher TOP 20'}</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Rétablir défauts</span>
            </button>

            <button
              type="button"
              onClick={() => exportRankingToExcel(filteredAndSorted)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Exporter .xlsx</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)] font-mono-num tabular-nums">
          Formule en direct : Total = {weights.alt} × (Alt. basse + Alt. haute) + {weights.village} × Village + {weights.size} × Taille + {weights.price} × Prix · Cliquez sur une station pour mettre à jour les cartes ci-dessus
        </p>
      </div>

      {showChart && (
        <Top20StackedChart
          stations={filteredAndSorted}
          weights={weights}
          selectedStationName={focusedStationName}
          onSelectStation={(name) =>
            setFocusedStationName((prev) => (prev === name ? null : name))
          }
        />
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                <th className="py-3 pl-4 pr-2 w-16">Rang</th>
                <th className="py-3 px-3">Station / domaine</th>
                <th className="py-3 px-3 text-right">Trajet</th>
                <th className="py-3 px-3 text-right">Alt. basse</th>
                <th className="py-3 px-3 text-right">Alt. haute</th>
                <th className="py-3 px-3 text-right">Village</th>
                <th className="py-3 px-3 text-right">Taille</th>
                <th className="py-3 px-3 text-right">Prix jour</th>
                <th className="py-3 px-3 text-right">Score Total</th>
                <th className="py-3 pl-2 pr-4 text-right w-12">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filteredAndSorted.map((s: ComputedStation, idx: number) => {
                const rank = idx + 1;
                const isSelected = focusedStationName === s.name;
                return (
                  <tr
                    key={s.name}
                    onClick={() =>
                      setFocusedStationName((prev) => (prev === s.name ? null : s.name))
                    }
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--bg-elevated)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-2">
                      <RankBadge rank={rank} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[var(--text-primary)]">{s.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {s.domain || s.kind || 'Station'}
                        {s.department ? ` · Dépt. ${s.department}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {fmtTravel(s.travel, s.travel_min)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                      <span className="text-[var(--text-primary)]">
                        {s.low_alt !== null ? `${Math.round(s.low_alt)} m` : '—'}
                      </span>
                      <span className="text-[var(--text-muted)]"> · {s.pts_low} pts</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                      <span className="text-[var(--text-primary)]">
                        {s.high_alt !== null ? `${Math.round(s.high_alt)} m` : '—'}
                      </span>
                      <span className="text-[var(--text-muted)]"> · {s.pts_high} pts</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {s.pts_village} / 2
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                      <span className="text-[var(--text-primary)]">
                        {s.km !== null ? `${Math.round(s.km)} km` : '—'}
                      </span>
                      <span className="text-[var(--text-muted)]"> · {s.pts_size} pts</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                      <span className="text-[var(--text-primary)]">
                        {s.adult !== null ? `${s.adult} €` : '—'}
                      </span>
                      <span className="text-[var(--text-muted)]"> · {s.pts_price} pts</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-sm font-bold text-[var(--accent)]">
                      {s.total}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        aria-label={`Ouvrir la fiche de ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectStation(s.name);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    Aucune station ne correspond à votre recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
