import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  Sparkles,
} from 'lucide-react';
import { LumiplanBulletin } from '../types';
import {
  evaluateLumiplanBulletin,
  LUMIPLAN_CATALOG,
} from '../utils/lumiplan';
import { KpiItem, KpiStrip } from './KpiStrip';

interface LumiplanPanelProps {
  bulletins: LumiplanBulletin[];
  loadingSingle: boolean;
  batchLoading: boolean;
  error: string | null;
  onLoadSingle: (slug: string) => Promise<void>;
  onLoadAll: () => Promise<void>;
  onOpenDataManagement?: () => void;
}

export const LumiplanPanel: React.FC<LumiplanPanelProps> = ({
  bulletins,
  loadingSingle,
  batchLoading,
  error,
  onLoadSingle,
  onLoadAll,
  onOpenDataManagement,
}) => {
  const [selectedStationId, setSelectedStationId] = useState<string>('la-plagne');
  const [customStation, setCustomStation] = useState<string>('');
  const [showJson, setShowJson] = useState(false);
  const [tableFilter, setTableFilter] = useState<'all' | 'verified' | 'anomalies'>('all');

  const evaluatedList = useMemo(
    () =>
      bulletins.map((b) => ({
        bulletin: b,
        evalResult: evaluateLumiplanBulletin(b),
      })),
    [bulletins]
  );

  const verifiedCount = useMemo(
    () => evaluatedList.filter((e) => e.evalResult.reliability === 'verified').length,
    [evaluatedList]
  );
  const anomalyCount = evaluatedList.length - verifiedCount;

  const activeEntry =
    evaluatedList.find((e) => e.bulletin.slug === selectedStationId) ??
    evaluatedList[0] ??
    null;
  const activeBulletin = activeEntry?.bulletin ?? null;
  const activeEval = activeEntry?.evalResult ?? null;

  const filteredTable = useMemo(() => {
    if (tableFilter === 'verified') {
      return evaluatedList.filter((e) => e.evalResult.reliability === 'verified');
    }
    if (tableFilter === 'anomalies') {
      return evaluatedList.filter((e) => e.evalResult.reliability !== 'verified');
    }
    return evaluatedList;
  }, [evaluatedList, tableFilter]);

  const kpis: KpiItem[] = [
    {
      label: 'Station affichée (Lumiplan)',
      value: activeBulletin ? activeBulletin.title.replace(/^Bulletin\s*[-–]\s*/i, '') : '—',
      subtext: activeBulletin?.updatedLabel ?? 'Synchronisation en cours...',
      icon: Snowflake,
      iconColor: '#38BDF8',
    },
    {
      label: 'Hauteur max / min',
      value:
        activeBulletin?.maxSnowCm != null
          ? `${activeBulletin.minSnowCm ?? '—'}–${activeBulletin.maxSnowCm} cm`
          : '—',
      subtext: `${activeBulletin?.sectors.length ?? 0} tranches d’altitude`,
      icon: Sparkles,
      iconColor: '#35C6D0',
    },
    {
      label: 'Bulletins fiables / anomalies',
      value: `${verifiedCount} / ${anomalyCount}`,
      subtext: `${bulletins.length} bulletins Lumiplan chargés`,
      icon: ShieldAlert,
      iconColor: anomalyCount > 0 ? '#F59E0B' : '#64C99A',
    },
    {
      label: 'Dernière chute (station)',
      value: activeBulletin?.latestSnowfallDate ?? 'Non datée',
      subtext:
        activeEval?.reliability === 'verified'
          ? 'Bulletin vérifié'
          : activeEval?.reliability === 'stale'
            ? 'Bulletin périmé (exclu)'
            : 'À vérifier (exclu)',
      icon: CheckCircle2,
      iconColor:
        activeEval?.reliability === 'verified'
          ? '#64C99A'
          : activeEval?.reliability === 'stale'
            ? '#F87171'
            : '#F59E0B',
    },
  ];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customStation
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!cleaned) return;
    setSelectedStationId(cleaned);
    void onLoadSingle(cleaned);
    setCustomStation('');
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <select
              value={selectedStationId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedStationId(next);
                if (!bulletins.some((b) => b.slug === next)) {
                  void onLoadSingle(next);
                }
              }}
              aria-label="Choisir une station Lumiplan"
              className="h-9 w-full sm:w-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)]"
            >
              {LUMIPLAN_CATALOG.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name} ({item.department})
                </option>
              ))}
            </select>

            <form onSubmit={handleCustomSubmit} className="flex w-full sm:w-auto items-center gap-1.5">
              <input
                type="text"
                value={customStation}
                onChange={(e) => setCustomStation(e.target.value)}
                placeholder="Autre station (ex: val-cenis)"
                className="h-9 min-w-0 flex-1 sm:w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={loadingSingle || !customStation.trim()}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tester</span>
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={loadingSingle}
              onClick={() => void onLoadSingle(selectedStationId)}
              className="inline-flex h-9 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingSingle ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>

            <button
              type="button"
              disabled={batchLoading}
              onClick={() => void onLoadAll()}
              className="inline-flex h-9 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[var(--accent)] ${batchLoading ? 'animate-spin' : ''}`} />
              <span>
                {batchLoading
                  ? `Synchro (${LUMIPLAN_CATALOG.length})...`
                  : `Tout actualiser (${LUMIPLAN_CATALOG.length})`}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--text-muted)]">
          <span>
            Protection anti-anomalie active : les bulletins datés d’une saison passée ou sans date de chute récente sont signalés.
          </span>
          {activeBulletin && (
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline cursor-pointer"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{showJson ? 'Masquer le JSON' : 'Voir le flux JSON'}</span>
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {activeBulletin && activeEval && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {activeBulletin.title}
                </h3>
                {activeEval.reliability === 'verified' ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Bulletin fiable
                  </span>
                ) : activeEval.reliability === 'stale' ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
                    <AlertTriangle className="h-3 w-3" />
                    Bulletin périmé (exclu)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    À vérifier (exclu)
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {activeBulletin.updatedLabel ?? 'Relevé direct Lumiplan'}
                {activeBulletin.pistesTotal != null &&
                  ` · Pistes : ${activeBulletin.pistesOpen}/${activeBulletin.pistesTotal}`}
                {activeBulletin.liftsTotal != null &&
                  ` · Remontées : ${activeBulletin.liftsOpen}/${activeBulletin.liftsTotal}`}
              </p>
            </div>
            <a
              href={activeBulletin.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              <span>Bulletin officiel Lumiplan</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {activeEval.reasons.length > 0 && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${
                activeEval.reliability === 'stale'
                  ? 'border-red-500/40 bg-red-500/10 text-red-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Anomalie détectée sur ce bulletin :</span>
                </div>
                <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                  {activeEval.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
              {onOpenDataManagement && (
                <button
                  type="button"
                  onClick={onOpenDataManagement}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-current/30 px-2.5 text-[11px] font-medium hover:bg-black/20 cursor-pointer"
                >
                  <span>Gérer dans Gestion des données</span>
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeBulletin.sectors.map((sec) => (
              <div
                key={`${sec.sector}-${sec.altitudeM ?? 'na'}`}
                className={`rounded-lg border p-4 space-y-2 ${
                  sec.isStaleSector
                    ? 'border-amber-500/45 bg-amber-500/5'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-page)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {sec.sector}
                  </span>
                  <span className="font-mono-num tabular-nums text-xs font-semibold text-[var(--accent)]">
                    {sec.altitudeM != null ? `${sec.altitudeM} m` : 'Alt. n.c.'}
                  </span>
                </div>

                {sec.staleReason && (
                  <div className="text-[11px] text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>{sec.staleReason}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1 font-mono-num tabular-nums text-xs">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">Neige au sol</div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {sec.snowTotalCm != null ? `${sec.snowTotalCm} cm` : '—'}
                      {sec.snowQuality ? (
                        <span className="ml-1 font-sans text-[11px] font-normal text-[var(--text-secondary)]">
                          ({sec.snowQuality})
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">Dernière chute</div>
                    <div className="text-sm font-bold text-sky-400">
                      {sec.snowFreshCm != null ? `+${sec.snowFreshCm} cm` : '—'}
                    </div>
                    {sec.lastSnowfallDate && (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {sec.lastSnowfallDate}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2 text-[11px] text-[var(--text-muted)] font-mono-num tabular-nums">
                  <span>
                    {sec.tempMorningC != null ? `${sec.tempMorningC}°C` : '—'} /{' '}
                    {sec.tempAfternoonC != null ? `${sec.tempAfternoonC}°C` : '—'}
                    {sec.windKmh != null ? ` · ${sec.windKmh} km/h` : ''}
                  </span>
                  {sec.avalancheRisk != null && (
                    <span className="text-amber-400 font-semibold">
                      BRA {sec.avalancheRisk}/5
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activeBulletin.advisoryText && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Conseil du jour (station) : </strong>
              {activeBulletin.advisoryText}
            </div>
          )}

          {activeBulletin.forecastToday && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Bulletin météo du jour : </strong>
              {activeBulletin.forecastToday}
            </div>
          )}

          {showJson && (
            <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3.5 text-[11px] font-mono-num text-[var(--text-secondary)]">
              {JSON.stringify(activeBulletin, null, 2)}
            </pre>
          )}
        </div>
      )}

      {bulletins.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-4 py-3">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Synthèse des stations Lumiplan ({bulletins.length})
            </span>
            <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                  tableFilter === 'all'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Toutes ({evaluatedList.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('verified')}
                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                  tableFilter === 'verified'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Fiables ({verifiedCount})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('anomalies')}
                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                  tableFilter === 'anomalies'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Anomalies ({anomalyCount})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)] font-medium">
                  <th className="py-2.5 pl-4 pr-3">Station Lumiplan</th>
                  <th className="py-2.5 px-3">Fiabilité</th>
                  <th className="py-2.5 px-3">Dernière chute</th>
                  <th className="py-2.5 px-3 text-right">Neige min / max</th>
                  <th className="py-2.5 px-3 text-right">Fraîche max</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Secteurs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredTable.map(({ bulletin: b, evalResult }) => (
                  <tr
                    key={b.slug}
                    onClick={() => setSelectedStationId(b.slug)}
                    className={`cursor-pointer transition-colors ${
                      b.slug === selectedStationId
                        ? 'bg-[var(--bg-elevated)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-[var(--text-primary)]">
                      {b.title.replace(/^Bulletin\s*[-–]\s*/i, '')}
                    </td>
                    <td className="py-2.5 px-3">
                      {evalResult.reliability === 'verified' ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
                          Fiable
                        </span>
                      ) : evalResult.reliability === 'stale' ? (
                        <span
                          title={evalResult.reasons.join(' · ')}
                          className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-300"
                        >
                          Périmé
                        </span>
                      ) : (
                        <span
                          title={evalResult.reasons.join(' · ')}
                          className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300"
                        >
                          Suspect
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num tabular-nums text-[var(--text-secondary)]">
                      {b.latestSnowfallDate ?? 'Non datée'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-[var(--text-primary)]">
                      {b.maxSnowCm != null
                        ? `${b.minSnowCm ?? '—'}–${b.maxSnowCm} cm`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num tabular-nums text-sky-400">
                      {b.maxFreshCm != null ? `+${b.maxFreshCm} cm` : '—'}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono-num tabular-nums text-[var(--text-muted)]">
                      {b.sectors.length}
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
