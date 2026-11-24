import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  Clock,
  Euro,
  Eye,
  EyeOff,
  Info,
  Mountain,
  MountainSnow,
  Search,
  X,
} from 'lucide-react';
import { StationRecord } from '../types';
import {
  fmtTravel,
  getAvailablePriceSeasons,
  getStationPriceForSeason,
} from '../utils/scoring';
import { KpiItem, KpiStrip } from './KpiStrip';
import { StationsAltitudeChart } from './StationsAltitudeChart';

interface StationsViewProps {
  stations: StationRecord[];
  priceSeason: string;
  onChangePriceSeason: (season: string) => void;
  onSelectStation: (stationName: string) => void;
}

type StationSortKey =
  | 'name'
  | 'adult'
  | 'child'
  | 'sixday'
  | 'travel_min'
  | 'km'
  | 'high_alt'
  | 'obs_alt';

export const StationsView: React.FC<StationsViewProps> = ({
  stations,
  priceSeason,
  onChangePriceSeason,
  onSelectStation,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<StationSortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [compareNames, setCompareNames] = useState<string[]>([]);
  const [focusedStationName, setFocusedStationName] = useState<string | null>(null);
  const [showAltChart, setShowAltChart] = useState(true);

  const availableSeasons = useMemo(() => getAvailablePriceSeasons(stations), [stations]);

  const cleanStations = useMemo(() => {
    return stations
      .filter((s) => {
        const n = (s.name || '').trim();
        const low = n.toLowerCase();
        return (
          n !== '' &&
          !low.includes('bleu =') &&
          !low.includes('vert =') &&
          !low.includes('valeur saisie')
        );
      })
      .map((s) => {
        const p = getStationPriceForSeason(s, priceSeason);
        return {
          ...s,
          adult: p.adult,
          child: p.child,
          sixday: p.sixday,
          child6: p.child6,
        };
      });
  }, [priceSeason, stations]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of cleanStations) {
      if (s.department.trim()) set.add(s.department.trim());
    }
    return Array.from(set).sort();
  }, [cleanStations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = cleanStations.filter((s) => {
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
      if (sortBy === 'name') {
        const cmp = a.name.localeCompare(b.name, 'fr');
        return isDesc ? -cmp : cmp;
      }
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return isDesc ? bv - av : av - bv;
    });

    return list;
  }, [cleanStations, deptFilter, search, sortBy, sortOrder]);

  const focusedStation = useMemo(() => {
    if (!focusedStationName) return null;
    return filtered.find((s) => s.name === focusedStationName) ?? null;
  }, [filtered, focusedStationName]);

  const kpis: KpiItem[] = useMemo(() => {
    if (focusedStation) {
      return [
        {
          label: 'Station sélectionnée',
          value: focusedStation.name,
          subtext: `${focusedStation.domain || focusedStation.kind || 'Station'} · Dépt. ${focusedStation.department || '—'}`,
          icon: Mountain,
          iconColor: '#64C99A',
          actionLabel: 'Réinitialiser',
          onAction: () => setFocusedStationName(null),
        },
        {
          label: 'Temps de trajet',
          value: fmtTravel(focusedStation.travel, focusedStation.travel_min),
          subtext:
            focusedStation.obs_alt !== null
              ? `Poste météo : ${Math.round(focusedStation.obs_alt)} m`
              : 'Temps de route estimé',
          icon: Clock,
          iconColor: '#A78BFA',
        },
        {
          label: 'Domaine & Altitudes',
          value: focusedStation.km !== null ? `${Math.round(focusedStation.km)} km` : '—',
          subtext: `${focusedStation.low_alt ?? '—'}–${focusedStation.high_alt ?? '—'} m`,
          icon: MountainSnow,
          iconColor: '#35C6D0',
        },
        {
          label: 'Forfait jour / 6 jours',
          value: focusedStation.adult !== null ? `${focusedStation.adult} €` : '—',
          subtext:
            focusedStation.sixday !== null
              ? `6 jours adulte : ${focusedStation.sixday} €`
              : 'Tarif journée adulte',
          icon: Euro,
          iconColor: '#38BDF8',
          actionLabel: 'Fiche',
          onAction: () => onSelectStation(focusedStation.name),
        },
      ];
    }

    let maxAlt = 0;
    let maxKm = 0;
    let priceSum = 0;
    let priceCount = 0;
    let travelSum = 0;
    let travelCount = 0;

    for (const s of filtered) {
      if (s.high_alt !== null && s.high_alt > maxAlt) maxAlt = Math.round(s.high_alt);
      if (s.km !== null && s.km > maxKm) maxKm = Math.round(s.km);
      if (s.adult !== null && s.adult > 0) {
        priceSum += s.adult;
        priceCount++;
      }
      if (s.travel_min !== null) {
        travelSum += s.travel_min;
        travelCount++;
      }
    }

    const avgTravel = travelCount > 0 ? Math.round(travelSum / travelCount) : null;
    const avgPrice = priceCount > 0 ? (priceSum / priceCount).toFixed(1) : '—';

    return [
      {
        label: 'Stations répertoriées',
        value: `${filtered.length}`,
        subtext: `${departments.length} départements couverts`,
        icon: Mountain,
        iconColor: '#64C99A',
      },
      {
        label: 'Trajet moyen',
        value: avgTravel !== null ? fmtTravel(null, avgTravel) : '—',
        subtext: `${travelCount} trajets renseignés`,
        icon: Clock,
        iconColor: '#A78BFA',
      },
      {
        label: 'Domaine max · Altitude',
        value: maxKm > 0 ? `${maxKm} km` : '—',
        subtext: maxAlt > 0 ? `Sommet max : ${maxAlt} m` : 'Pistes reliées',
        icon: MountainSnow,
        iconColor: '#35C6D0',
      },
      {
        label: 'Prix jour moyen',
        value: avgPrice !== '—' ? `${avgPrice} €` : '—',
        subtext: `${priceCount} tarifs adulte`,
        icon: Euro,
        iconColor: '#38BDF8',
      },
    ];
  }, [departments.length, filtered, focusedStation, onSelectStation]);

  const comparedStations = useMemo(() => {
    return compareNames
      .map((name) => cleanStations.find((s) => s.name === name))
      .filter((s): s is StationRecord => Boolean(s));
  }, [cleanStations, compareNames]);

  const toggleCompare = (name: string) => {
    setCompareNames((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) return [...prev.slice(1), name];
      return [...prev, name];
    });
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une station..."
                className="h-9 w-56 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
              onChange={(e) => setSortBy(e.target.value as StationSortKey)}
              aria-label="Trier les stations"
              className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              <option value="name">Trier : Nom</option>
              <option value="adult">Trier : Prix adulte</option>
              <option value="child">Trier : Prix enfant</option>
              <option value="sixday">Trier : Forfait 6 jours</option>
              <option value="travel_min">Trier : Temps de trajet</option>
              <option value="km">Trier : Km de pistes</option>
              <option value="high_alt">Trier : Altitude haute</option>
              <option value="obs_alt">Trier : Altitude poste météo</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{sortOrder === 'asc' ? 'Croissant' : 'Décroissant'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-[var(--text-muted)] font-mono-num tabular-nums">
              Cliquez sur une station pour actualiser les cartes · cochez jusqu’à 3 pour comparer
            </span>
            <button
              type="button"
              onClick={() => setShowAltChart((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap cursor-pointer"
            >
              {showAltChart ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showAltChart ? 'Masquer graphique' : 'Profil d’altitudes'}</span>
            </button>
          </div>
        </div>
      </div>

      {showAltChart && (
        <StationsAltitudeChart
          stations={filtered}
          selectedStationName={focusedStationName}
          onSelectStation={(name) =>
            setFocusedStationName((prev) => (prev === name ? null : name))
          }
        />
      )}

      {comparedStations.length >= 2 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Comparatif côte à côte ({comparedStations.length} stations)
            </h2>
            <button
              type="button"
              onClick={() => setCompareNames([])}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Fermer le comparatif</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
                  <th className="py-2.5 pl-5 pr-3 text-[var(--text-muted)] font-medium">Critère</th>
                  {comparedStations.map((s) => (
                    <th key={s.name} className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)] font-mono-num tabular-nums">
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">Domaine · Dépt.</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 font-sans text-[var(--text-secondary)]">
                      {s.domain || '—'} · {s.department || '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">Temps de trajet</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 text-[var(--text-primary)]">
                      {fmtTravel(s.travel, s.travel_min)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">Altitudes ski</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 text-[var(--text-primary)]">
                      {s.low_alt ?? '—'}–{s.high_alt ?? '—'} m
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">Km de pistes</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 text-[var(--text-primary)]">
                      {s.km !== null ? `${s.km} km` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">Jour adulte / enfant</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 text-[var(--text-primary)]">
                      {s.adult ?? '—'} € / {s.child ?? '—'} €
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pl-5 pr-3 font-sans text-[var(--text-muted)]">6 jours adulte / enfant</td>
                  {comparedStations.map((s) => (
                    <td key={s.name} className="py-2 px-4 text-[var(--text-primary)]">
                      {s.sixday ?? '—'} € / {s.child6 ?? '—'} €
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                <th className="py-3 pl-4 pr-2 w-10">Comp.</th>
                <th className="py-3 px-3">Station / domaine</th>
                <th className="py-3 px-3">Dépt.</th>
                <th className="py-3 px-3 text-right">Trajet</th>
                <th className="py-3 px-3 text-right">Altitudes ski</th>
                <th className="py-3 px-3 text-right">Poste météo</th>
                <th className="py-3 px-3 text-right">Pistes</th>
                <th className="py-3 px-3 text-right">Jour adulte</th>
                <th className="py-3 px-3 text-right">Jour enfant</th>
                <th className="py-3 px-3 text-right">6j adulte</th>
                <th className="py-3 pl-2 pr-4 text-right w-12">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filtered.map((s) => {
                const isCompare = compareNames.includes(s.name);
                const isFocused = focusedStationName === s.name;
                return (
                  <tr
                    key={s.name}
                    onClick={() =>
                      setFocusedStationName((prev) => (prev === s.name ? null : s.name))
                    }
                    className={`transition-colors cursor-pointer ${
                      isFocused ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <td
                      className="py-2.5 pl-4 pr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCompare(s.name)}
                        aria-label={`Comparer ${s.name}`}
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors cursor-pointer ${
                          isCompare
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-page)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        {isCompare && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[var(--text-primary)]">{s.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {s.domain || s.kind || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {s.department || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {fmtTravel(s.travel, s.travel_min)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-primary)]">
                      {s.low_alt !== null ? Math.round(s.low_alt) : '—'}–
                      {s.high_alt !== null ? Math.round(s.high_alt) : '—'} m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {s.obs_alt !== null ? `${Math.round(s.obs_alt)} m` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-primary)]">
                      {s.km !== null ? `${Math.round(s.km)} km` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums font-medium text-[var(--text-primary)]">
                      {s.adult !== null ? `${s.adult} €` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {s.child !== null ? `${s.child} €` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {s.sixday !== null ? `${s.sixday} €` : '—'}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        aria-label={`Ouvrir la fiche de ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStation(s.name);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    Aucune station trouvée.
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
