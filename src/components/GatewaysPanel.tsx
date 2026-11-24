import React, { useEffect, useMemo, useState } from 'react';
import {
  CloudSnow,
  ExternalLink,
  Mountain,
  RefreshCw,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import {
  OpenMeteoSnowReport,
  SkiRadarStation,
} from '../types';
import { fetchOpenMeteoSnow } from '../utils/lumiplan';
import { SkiinfoCacheMap } from '../utils/storage';
import { KpiItem, KpiStrip } from './KpiStrip';

interface GatewaysPanelProps {
  skiRadarStations: SkiRadarStation[];
  skiinfoByRegion: SkiinfoCacheMap;
  loadingSkiinfo: boolean;
  skiinfoError: string | null;
  onLoadSkiinfoRegion: (region: string) => Promise<void>;
}

const REGIONS: Array<{ id: string; label: string }> = [
  { id: 'alpes-du-nord', label: 'Alpes du Nord' },
  { id: 'alpes-du-sud', label: 'Alpes du Sud' },
  { id: 'pyrenees', label: 'Pyrénées' },
  { id: 'vosges', label: 'Vosges' },
  { id: 'jura', label: 'Jura' },
  { id: 'massif-central', label: 'Massif Central' },
];

export const GatewaysPanel: React.FC<GatewaysPanelProps> = ({
  skiRadarStations,
  skiinfoByRegion,
  loadingSkiinfo,
  skiinfoError,
  onLoadSkiinfoRegion,
}) => {
  const [region, setRegion] = useState<string>('alpes-du-nord');

  const resorts = useMemo(
    () => skiinfoByRegion[region]?.resorts ?? [],
    [region, skiinfoByRegion]
  );

  const geoStations = useMemo(
    () =>
      skiRadarStations
        .filter((s) => s.geo && Number.isFinite(s.geo.lat) && Number.isFinite(s.geo.lng))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [skiRadarStations]
  );

  const [selectedGeoId, setSelectedGeoId] = useState<string>('');
  const [customElevation, setCustomElevation] = useState<number>(2000);
  const [meteoReport, setMeteoReport] = useState<OpenMeteoSnowReport | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(false);
  const [meteoError, setMeteoError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGeoId && geoStations.length > 0) {
      const alpe =
        geoStations.find((s) => s.name.toLowerCase().includes("alpe d'huez")) ??
        geoStations[0];
      setSelectedGeoId(alpe.id);
      setCustomElevation(alpe.altitudes?.sommet ?? alpe.altitudes?.bas ?? 2000);
    }
  }, [geoStations, selectedGeoId]);

  useEffect(() => {
    if (!skiinfoByRegion[region]) {
      void onLoadSkiinfoRegion(region);
    }
  }, [onLoadSkiinfoRegion, region, skiinfoByRegion]);

  const selectedGeoStation = useMemo(
    () => geoStations.find((s) => s.id === selectedGeoId) ?? null,
    [geoStations, selectedGeoId]
  );

  const loadOpenMeteo = async (st: SkiRadarStation, elev: number) => {
    if (!st.geo) return;
    setLoadingMeteo(true);
    setMeteoError(null);
    try {
      const report = await fetchOpenMeteoSnow(st.geo.lat, st.geo.lng, elev);
      setMeteoReport(report);
    } catch (err) {
      setMeteoError(
        err instanceof Error ? err.message : 'Erreur Open-Meteo.'
      );
    } finally {
      setLoadingMeteo(false);
    }
  };

  useEffect(() => {
    if (selectedGeoStation) {
      void loadOpenMeteo(selectedGeoStation, customElevation);
    }
  }, [selectedGeoStation, customElevation]);

  const kpis: KpiItem[] = [
    {
      label: 'Stations ouvertes (Skiinfo)',
      value: `${resorts.length}`,
      subtext: REGIONS.find((r) => r.id === region)?.label ?? region,
      icon: Snowflake,
      iconColor: '#38BDF8',
    },
    {
      label: 'Manteau Open-Meteo',
      value: meteoReport?.snowDepthCm != null ? `${meteoReport.snowDepthCm} cm` : '—',
      subtext: selectedGeoStation
        ? `${selectedGeoStation.name} (${customElevation} m)`
        : 'Sélectionnez une station',
      icon: CloudSnow,
      iconColor: '#35C6D0',
    },
    {
      label: 'Isotherme 0°C / Temp.',
      value:
        meteoReport?.freezingLevelM != null
          ? `${meteoReport.freezingLevelM} m`
          : '—',
      subtext:
        meteoReport?.tempC != null
          ? `Température à ${customElevation} m : ${meteoReport.tempC}°C`
          : 'Modèle haute résolution',
      icon: Thermometer,
      iconColor: '#F59E0B',
    },
    {
      label: 'Cumul neige prévu (4 j)',
      value: meteoReport
        ? `+${meteoReport.daily
            .reduce((acc, d) => acc + (d.snowfallCm ?? 0), 0)
            .toFixed(1)} cm`
        : '—',
      subtext: 'Prévision Open-Meteo AROME/ICON',
      icon: Mountain,
      iconColor: '#64C99A',
    },
  ];

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Passerelle 2 : Météo & manteau neigeux Open-Meteo (toutes stations par altitude)
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Idéal pour les stations sans flux Lumiplan (Alpe d’Huez, Les 2 Alpes, Chamrousse...) ou avant l’ouverture officielle des pistes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedGeoId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedGeoId(id);
                const found = geoStations.find((s) => s.id === id);
                if (found) {
                  setCustomElevation(found.altitudes?.sommet ?? found.altitudes?.bas ?? 2000);
                }
              }}
              aria-label="Choisir une station pour Open-Meteo"
              className="h-9 w-full sm:w-auto max-w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              {geoStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span>Alt.</span>
              <input
                type="number"
                min={300}
                max={4000}
                step={100}
                value={customElevation}
                onChange={(e) => setCustomElevation(Number(e.target.value) || 1800)}
                className="h-9 w-24 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs font-mono-num text-[var(--text-primary)]"
              />
              <span>m</span>
            </label>

            <button
              type="button"
              disabled={loadingMeteo || !selectedGeoStation}
              onClick={() =>
                selectedGeoStation && void loadOpenMeteo(selectedGeoStation, customElevation)
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingMeteo ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {meteoError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {meteoError}
          </div>
        )}

        {meteoReport && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {meteoReport.daily.map((d) => (
              <div
                key={d.date}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3 text-xs font-mono-num tabular-nums"
              >
                <div className="text-[11px] text-[var(--text-muted)]">{d.date}</div>
                <div className="mt-1 text-sm font-bold text-sky-400">
                  {d.snowfallCm != null ? `+${d.snowfallCm} cm` : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Passerelle 3 : Skiinfo / OnTheSnow (stations ouvertes en direct)
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Hauteurs bas–sommet, remontées/pistes ouvertes et cumul neige fraîche 24h / 7j par massif.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Choisir un massif Skiinfo"
              className="h-9 flex-1 sm:flex-initial rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={loadingSkiinfo}
              onClick={() => void onLoadSkiinfoRegion(region)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingSkiinfo ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {skiinfoError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {skiinfoError}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                <th className="py-2.5 pl-4 pr-3">Station ouverte</th>
                <th className="py-2.5 px-3 text-right">Neige bas–sommet</th>
                <th className="py-2.5 px-3 text-right">Remontées</th>
                <th className="py-2.5 px-3 text-right">Pistes</th>
                <th className="py-2.5 px-3 text-right">24h / 7j</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Lien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {resorts.map((r) => (
                <tr key={r.name} className="hover:bg-[var(--bg-subtle)]">
                  <td className="py-2.5 pl-4 pr-3 font-medium text-[var(--text-primary)]">
                    {r.name}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-primary)]">
                    {r.snowLowCm != null || r.snowHighCm != null
                      ? `${r.snowLowCm ?? '—'}–${r.snowHighCm ?? '—'} cm`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                    {r.liftsOpen ?? '—'}/{r.liftsTotal ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-secondary)]">
                    {r.pistesOpen ?? '—'}/{r.pistesTotal ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-sky-400">
                    {r.fresh24hCm != null ? `+${r.fresh24hCm}` : '—'} /{' '}
                    {r.fresh7dCm != null ? `+${r.fresh7dCm} cm` : '—'}
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
              {!loadingSkiinfo && resorts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    Aucune station officiellement ouverte recensée dans ce massif pour l’instant (utilisez Open-Meteo ci-dessus).
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
