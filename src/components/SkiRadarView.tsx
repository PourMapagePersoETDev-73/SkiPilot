import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Compass,
  Database,
  Euro,
  ExternalLink,
  Mountain,
  RefreshCw,
  Search,
  Snowflake,
} from 'lucide-react';
import {
  LumiplanBulletin,
  SkiRadarFeedCache,
  SkiRadarStation,
} from '../types';
import { getSkiRadarBulletinAnomaly, MASSIF_LABELS } from '../utils/skiradar';
import { SkiinfoCacheMap } from '../utils/storage';
import { GatewaysPanel } from './GatewaysPanel';
import { KpiItem, KpiStrip } from './KpiStrip';
import { LumiplanPanel } from './LumiplanPanel';

interface SkiRadarViewProps {
  cache: SkiRadarFeedCache | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  lumiplanBulletins: LumiplanBulletin[];
  lumiplanLoadingSingle: boolean;
  lumiplanBatchLoading: boolean;
  lumiplanError: string | null;
  onLoadSingleLumiplan: (slug: string) => Promise<void>;
  onLoadAllLumiplan: () => Promise<void>;
  skiinfoByRegion: SkiinfoCacheMap;
  skiinfoLoading: boolean;
  skiinfoError: string | null;
  onLoadSkiinfoRegion: (region: string) => Promise<void>;
  onOpenDataManagement: () => void;
}

type QuickFilter = 'all' | 'bulletin' | 'forfaits' | 'open';

function fmtDateShort(iso?: string | null): string {
  if (!iso) return 'Date n.c.';
  return iso.slice(0, 10);
}

export const SkiRadarView: React.FC<SkiRadarViewProps> = ({
  cache,
  loading,
  error,
  onRefresh,
  lumiplanBulletins,
  lumiplanLoadingSingle,
  lumiplanBatchLoading,
  lumiplanError,
  onLoadSingleLumiplan,
  onLoadAllLumiplan,
  skiinfoByRegion,
  skiinfoLoading,
  skiinfoError,
  onLoadSkiinfoRegion,
  onOpenDataManagement,
}) => {
  const [feedMode, setFeedMode] = useState<'lumiplan' | 'skiradar' | 'gateways'>('lumiplan');
  const [massifFilter, setMassifFilter] = useState<string>('alpes-du-nord');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const stations = cache?.stations ?? [];

  const massifs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stations) {
      const m = s.massif || 'autre';
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [stations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (massifFilter !== 'ALL' && s.massif !== massifFilter) return false;
      if (quickFilter === 'bulletin' && !s.neige) return false;
      if (quickFilter === 'forfaits' && s.forfaits?.jourAdulte == null) return false;
      if (quickFilter === 'open' && s.neige?.statut !== 'ouvert') return false;
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !(s.commune ?? '').toLowerCase().includes(term) &&
        !(s.domaine ?? '').toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [massifFilter, quickFilter, search, stations]);

  const focusedStation: SkiRadarStation | null = useMemo(() => {
    if (!focusedId) return null;
    return filtered.find((s) => s.id === focusedId) ?? null;
  }, [filtered, focusedId]);

  const kpis: KpiItem[] = useMemo(() => {
    if (focusedStation) {
      const s = focusedStation;
      const kmVal = s.pistes?.km ?? s.pistes?.kmDomaineRelie ?? null;
      const snowTxt =
        s.neige && (s.neige.basCm != null || s.neige.hautCm != null)
          ? `${s.neige.basCm ?? '—'}–${s.neige.hautCm ?? '—'} cm`
          : s.neigeObservee?.posteAltitude != null
            ? `${s.neigeObservee.joursSkiablesMoyen ?? '—'} j/hiver`
            : 'Non relevé';

      return [
        {
          label: 'Station SkiRadar sélectionnée',
          value: s.name,
          subtext: `${s.commune ?? '—'} · ${MASSIF_LABELS[s.massif ?? ''] ?? s.massif ?? '—'}`,
          icon: Compass,
          iconColor: '#35C6D0',
          actionLabel: 'Réinitialiser',
          onAction: () => setFocusedId(null),
        },
        {
          label: 'Altitudes & Pistes',
          value:
            s.altitudes?.sommet != null
              ? `${s.altitudes.bas ?? s.altitudes.village ?? '—'}–${s.altitudes.sommet} m`
              : 'Non relevé',
          subtext:
            kmVal !== null
              ? `${kmVal} km ${s.pistes?.km == null && s.pistes?.domaineRelie ? `(${s.pistes.domaineRelie})` : ''}`
              : `${s.pistes?.remontees ?? '—'} remontées`,
          icon: Mountain,
          iconColor: '#64C99A',
        },
        {
          label: 'Neige & Climat Météo-France',
          value: snowTxt,
          subtext:
            s.neigeObservee?.statut === 'mesure'
              ? `Poste ${s.neigeObservee.poste} (${s.neigeObservee.posteAltitude} m)`
              : s.neigeObservee?.motif ?? 'Sans poste rattaché',
          icon: Snowflake,
          iconColor: '#38BDF8',
        },
        {
          label: 'Forfait jour adulte',
          value: s.forfaits?.jourAdulte != null ? `${s.forfaits.jourAdulte} €` : 'Non relevé',
          subtext: s.forfaits
            ? `${s.forfaits.saison ?? 'Saison n.p.'} · ${s.forfaits.source ?? 'source'}`
            : 'Aucun tarif relevé',
          icon: Euro,
          iconColor: '#F59E0B',
        },
      ];
    }

    const withBulletin = filtered.filter((s) => s.neige !== null).length;
    const withPrice = filtered.filter((s) => s.forfaits?.jourAdulte != null);
    const avgPrice =
      withPrice.length > 0
        ? (
            withPrice.reduce((acc, s) => acc + (s.forfaits?.jourAdulte ?? 0), 0) /
            withPrice.length
          ).toFixed(1)
        : '—';
    const maxPeak = filtered.reduce(
      (max, s) =>
        s.altitudes?.sommet != null && s.altitudes.sommet > max ? s.altitudes.sommet : max,
      0
    );

    return [
      {
        label: 'Stations SkiRadar affichées',
        value: `${filtered.length}`,
        subtext: `${stations.length} stations en France (${massifFilter === 'ALL' ? 'tous massifs' : MASSIF_LABELS[massifFilter] ?? massifFilter})`,
        icon: Compass,
        iconColor: '#35C6D0',
      },
      {
        label: 'Sommet maximal du filtre',
        value: maxPeak > 0 ? `${maxPeak} m` : '—',
        subtext: 'Sources : site officiel / STRMTG / OSM',
        icon: Mountain,
        iconColor: '#64C99A',
      },
      {
        label: 'Bulletins neige actifs',
        value: `${withBulletin}`,
        subtext: `${filtered.filter((s) => s.neigeObservee?.statut === 'mesure').length} avec poste Météo-France`,
        icon: Snowflake,
        iconColor: '#38BDF8',
      },
      {
        label: 'Forfait jour moyen relevé',
        value: avgPrice !== '—' ? `${avgPrice} €` : '—',
        subtext: `${withPrice.length} stations tarifées`,
        icon: Euro,
        iconColor: '#F59E0B',
      },
    ];
  }, [filtered, focusedStation, massifFilter, stations.length]);

  const skiinfoTotalLoaded = useMemo(
    () =>
      Object.values(skiinfoByRegion).reduce(
        (sum, entry) => sum + entry.resorts.length,
        0
      ),
    [skiinfoByRegion]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3.5 sm:px-4 py-3">
        <div className="inline-flex flex-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFeedMode('lumiplan')}
            className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              feedMode === 'lumiplan'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {lumiplanBatchLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
            <span>Lumiplan ({lumiplanBulletins.length || 31})</span>
          </button>
          <button
            type="button"
            onClick={() => setFeedMode('skiradar')}
            className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              feedMode === 'skiradar'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {loading && <RefreshCw className="h-3 w-3 animate-spin" />}
            <span>SkiRadar ({stations.length || 315})</span>
          </button>
          <button
            type="button"
            onClick={() => setFeedMode('gateways')}
            className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              feedMode === 'gateways'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {skiinfoLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
            <span>Skiinfo & Météo ({skiinfoTotalLoaded})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenDataManagement}
          className="inline-flex h-8 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Database className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>MàJ base & Archive → Gestion des données</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {feedMode === 'lumiplan' ? (
        <LumiplanPanel
          bulletins={lumiplanBulletins}
          loadingSingle={lumiplanLoadingSingle}
          batchLoading={lumiplanBatchLoading}
          error={lumiplanError}
          onLoadSingle={onLoadSingleLumiplan}
          onLoadAll={onLoadAllLumiplan}
          onOpenDataManagement={onOpenDataManagement}
        />
      ) : feedMode === 'gateways' ? (
        <GatewaysPanel
          skiRadarStations={stations}
          skiinfoByRegion={skiinfoByRegion}
          loadingSkiinfo={skiinfoLoading}
          skiinfoError={skiinfoError}
          onLoadSkiinfoRegion={onLoadSkiinfoRegion}
        />
      ) : (
        <>
          <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher station, commune, domaine..."
                className="h-9 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>

            <select
              value={massifFilter}
              onChange={(e) => setMassifFilter(e.target.value)}
              aria-label="Filtrer par massif"
              className="h-9 w-full sm:w-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              <option value="ALL">Tous les massifs ({stations.length})</option>
              {massifs.map(([key, count]) => (
                <option key={key} value={key}>
                  {MASSIF_LABELS[key] ?? key} ({count})
                </option>
              ))}
            </select>

            <div className="inline-flex flex-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1 w-full sm:w-auto">
              {(
                [
                  { id: 'all', label: 'Toutes' },
                  { id: 'bulletin', label: 'Bulletin neige' },
                  { id: 'forfaits', label: 'Tarifs relevés' },
                  { id: 'open', label: 'Ouvertes' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setQuickFilter(item.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    quickFilter === item.id
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synchronisation...' : 'Actualiser SkiRadar'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--text-muted)]">
          <span>
            API ouverte{' '}
            <a
              href="https://skiradar.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              skiradar.fr
            </a>{' '}
            · Licence ouverte · Météo-France, STRMTG, DATAtourisme, OSM, Wikidata & bulletins officiels
          </span>
          {cache && (
            <span className="font-mono-num tabular-nums">
              Feed v{cache.version} · Généré le {fmtDateShort(cache.generatedAt)}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {focusedStation && (
        <div className="rounded-xl border border-[var(--accent)] bg-[var(--bg-panel)] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {focusedStation.name}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {focusedStation.resume || `${focusedStation.commune ?? ''} · ${focusedStation.domaine ?? ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {focusedStation.planPistes?.url && (
                <a
                  href={focusedStation.planPistes.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  <span>Plan des pistes ({focusedStation.planPistes.format?.toUpperCase() ?? 'PDF'})</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {focusedStation.siteOfficiel && (
                <a
                  href={focusedStation.siteOfficiel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline"
                >
                  <span>Site officiel</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <a
                href={focusedStation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
              >
                <span>Fiche skiradar.fr</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)]">
                Domaine & Ski de fond
              </div>
              <div className="text-[var(--text-secondary)] font-mono-num tabular-nums">
                Remontées : {focusedStation.pistes?.remontees ?? 'Non relevé'} · Webcams :{' '}
                {focusedStation.webcams ?? 'Non relevé'}
              </div>
              {focusedStation.nordique ? (
                <div className="text-[var(--text-muted)]">
                  Nordique ({focusedStation.nordique.site ?? 'domaine'}) : {focusedStation.nordique.km} km ·{' '}
                  {focusedStation.nordique.itineraires} itinéraires
                </div>
              ) : (
                <div className="text-[var(--text-muted)]">Domaine nordique : non relevé</div>
              )}
              {focusedStation.snowparks?.zones != null && (
                <div className="text-[var(--text-muted)]">
                  Zones snowpark OSM : {focusedStation.snowparks.zones}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)]">
                Poste Météo-France & École de ski
              </div>
              {focusedStation.neigeObservee?.statut === 'mesure' ? (
                <div className="text-[var(--text-secondary)] font-mono-num tabular-nums">
                  {focusedStation.neigeObservee.poste} ({focusedStation.neigeObservee.posteAltitude} m, à{' '}
                  {focusedStation.neigeObservee.distanceKm} km) ·{' '}
                  {focusedStation.neigeObservee.joursSkiablesMoyen} j/hiver ({focusedStation.neigeObservee.periode})
                </div>
              ) : (
                <div className="text-[var(--text-muted)]">
                  Sans poste météo rattaché ({focusedStation.neigeObservee?.motif ?? 'non relevé'})
                </div>
              )}
              {focusedStation.ecoleDeSki && (
                <div className="text-[var(--text-muted)]">
                  {focusedStation.ecoleDeSki.nom} · {focusedStation.ecoleDeSki.moniteurs ?? '—'} moniteurs
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)]">
                Activités hors-ski (DATAtourisme)
              </div>
              {focusedStation.activites?.parType ? (
                <div className="text-[var(--text-secondary)]">
                  {Object.entries(focusedStation.activites.parType)
                    .slice(0, 6)
                    .map(([k, v]) => `${k} (${v})`)
                    .join(' · ')}
                </div>
              ) : (
                <div className="text-[var(--text-muted)]">Aucune activité recensée</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                <th className="py-3 pl-4 pr-3">Station / Commune</th>
                <th className="py-3 px-3">Massif · Domaine</th>
                <th className="py-3 px-3 text-right">Altitudes</th>
                <th className="py-3 px-3 text-right">Pistes / Remontées</th>
                <th className="py-3 px-3">Bulletin neige</th>
                <th className="py-3 px-3">Climat Météo-France</th>
                <th className="py-3 px-3 text-right">Forfait jour</th>
                <th className="py-3 pl-3 pr-4 text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {loading && stations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-[var(--text-muted)]">
                    Chargement du flux SkiRadar (315+ stations françaises)...
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isSelected = focusedId === s.id;
                  const kmLabel =
                    s.pistes?.km != null
                      ? `${s.pistes.km} km`
                      : s.pistes?.kmDomaineRelie != null
                        ? `${s.pistes.kmDomaineRelie} km relié`
                        : 'Non relevé';

                  return (
                    <tr
                      key={s.id}
                      onClick={() =>
                        setFocusedId((prev) => (prev === s.id ? null : s.id))
                      }
                      className={`transition-colors cursor-pointer ${
                        isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-medium text-[var(--text-primary)]">{s.name}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {s.commune ?? '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-[var(--text-secondary)]">
                          {MASSIF_LABELS[s.massif ?? ''] ?? s.massif ?? '—'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {s.pistes?.domaineRelie || s.domaine || 'Station indépendante'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-primary)]">
                        {s.altitudes?.bas ?? s.altitudes?.village ?? '—'}–
                        {s.altitudes?.sommet ?? '—'} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                        <div className="text-[var(--text-primary)]">{kmLabel}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {s.pistes?.remontees != null
                            ? `${s.pistes.remontees} remontées`
                            : 'Remontées n.r.'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-num tabular-nums">
                        {s.neige ? (
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[var(--text-primary)]">
                              <span>
                                {s.neige.basCm != null || s.neige.hautCm != null
                                  ? `${s.neige.basCm ?? '—'}–${s.neige.hautCm ?? '—'} cm`
                                  : s.neige.statut ?? 'Relevé'}
                                {s.neige.pistesOuvertes != null && s.neige.pistesTotal != null
                                  ? ` · ${s.neige.pistesOuvertes}/${s.neige.pistesTotal} pistes`
                                  : ''}
                              </span>
                              {getSkiRadarBulletinAnomaly(s) && (
                                <span
                                  title={getSkiRadarBulletinAnomaly(s) ?? ''}
                                  className="font-sans rounded border border-red-500/40 bg-red-500/10 px-1 py-0.5 text-[10px] text-red-300"
                                >
                                  Périmé
                                </span>
                              )}
                            </div>
                            <div className="font-sans text-[11px] text-[var(--text-muted)]">
                              {fmtDateShort(s.neige.releveLe)} · {s.neige.source ?? 'bulletin'}
                            </div>
                          </div>
                        ) : (
                          <span className="font-sans text-[var(--text-muted)]">Non relevé</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono-num tabular-nums">
                        {s.neigeObservee?.statut === 'mesure' ? (
                          <div>
                            <div className="text-[var(--text-primary)]">
                              {s.neigeObservee.posteAltitude} m ·{' '}
                              {s.neigeObservee.joursSkiablesMoyen ?? '—'} j/hiver
                            </div>
                            <div className="font-sans text-[11px] text-[var(--text-muted)] truncate max-w-[180px]">
                              {s.neigeObservee.poste} ({s.neigeObservee.periode})
                            </div>
                          </div>
                        ) : (
                          <span className="font-sans text-[var(--text-muted)]">Sans poste</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num tabular-nums">
                        {s.forfaits?.jourAdulte != null ? (
                          <div>
                            <div className="font-semibold text-[var(--text-primary)]">
                              {s.forfaits.jourAdulte} €
                            </div>
                            <div className="font-sans text-[11px] text-[var(--text-muted)]">
                              {s.forfaits.saison ?? 'Saison n.p.'} · {s.forfaits.source}
                            </div>
                          </div>
                        ) : (
                          <span className="font-sans text-[var(--text-muted)]">Non relevé</span>
                        )}
                      </td>
                      <td
                        className="py-2.5 pl-3 pr-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Voir ${s.name} sur skiradar.fr`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    Aucune station ne correspond aux filtres SkiRadar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
