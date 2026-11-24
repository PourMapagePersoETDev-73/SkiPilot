import React from 'react';
import { ExternalLink, TrendingUp, X } from 'lucide-react';
import { ComputedStation } from '../types';
import { fmtTravel } from '../utils/scoring';

interface StationDrawerProps {
  station: ComputedStation | null;
  hasSnowHistory: boolean;
  onClose: () => void;
  onUpdateVillageScore: (stationName: string, score: number) => void;
  onOpenHistory: (stationName: string) => void;
}

export const StationDrawer: React.FC<StationDrawerProps> = ({
  station,
  hasSnowHistory,
  onClose,
  onUpdateVillageScore,
  onOpenHistory,
}) => {
  if (!station) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col justify-between border-l border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                {station.name}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {station.domain || station.kind || 'Station alpine'}
                {station.department ? ` · Dépt. ${station.department}` : ''}
                {' · '}
                Trajet {fmtTravel(station.travel, station.travel_min)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le panneau"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono-num tabular-nums">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3">
              <div className="text-[11px] font-sans text-[var(--text-muted)]">Score pondéré</div>
              <div className="mt-1 text-lg font-bold text-[var(--accent)]">{station.total} pts</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3">
              <div className="text-[11px] font-sans text-[var(--text-muted)]">Domaine skiable</div>
              <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {station.km !== null ? `${station.km} km` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3">
              <div className="text-[11px] font-sans text-[var(--text-muted)]">Altitudes ski</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {station.low_alt ?? '—'}–{station.high_alt ?? '—'} m
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3">
              <div className="text-[11px] font-sans text-[var(--text-muted)]">Poste météo</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {station.obs_alt !== null ? `${Math.round(station.obs_alt)} m` : '—'}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-[var(--border-hairline)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Tarifs forfaits
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-xs font-mono-num tabular-nums">
              <span className="font-sans text-[var(--text-muted)]">Journée adulte</span>
              <span className="text-right text-[var(--text-primary)]">
                {station.adult !== null ? `${station.adult} €` : '—'}
              </span>
              <span className="font-sans text-[var(--text-muted)]">Journée enfant</span>
              <span className="text-right text-[var(--text-primary)]">
                {station.child !== null ? `${station.child} €` : '—'}
              </span>
              <span className="font-sans text-[var(--text-muted)]">6 jours adulte</span>
              <span className="text-right text-[var(--text-primary)]">
                {station.sixday !== null ? `${station.sixday} €` : '—'}
              </span>
              <span className="font-sans text-[var(--text-muted)]">6 jours enfant</span>
              <span className="text-right text-[var(--text-primary)]">
                {station.child6 !== null ? `${station.child6} €` : '—'}
              </span>
            </div>

            {station.price_history && station.price_history.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Historique & suivi des tarifs
                </div>
                <div className="space-y-1 font-mono-num tabular-nums text-[11px]">
                  {(() => {
                    const baseAdult =
                      station.price_history.find((p) => p.season === '2026')?.adult ??
                      station.adult;
                    return station.price_history.map((entry) => {
                      const diff =
                        entry.season !== '2026' &&
                        baseAdult !== null &&
                        entry.adult !== null
                          ? entry.adult - baseAdult
                          : null;
                      return (
                        <div
                          key={entry.season}
                          className="flex items-center justify-between gap-2 text-[var(--text-secondary)]"
                        >
                          <span>
                            Saison <strong className="text-[var(--text-primary)]">{entry.season}</strong>
                            {entry.source ? ` · ${entry.source}` : ''}
                          </span>
                          <span>
                            <strong className="text-[var(--text-primary)]">
                              {entry.adult !== null ? `${entry.adult} €` : '—'}
                            </strong>
                            {entry.sixday !== null ? ` (6j: ${entry.sixday} €)` : ''}
                            {diff !== null && diff !== 0 && (
                              <span
                                className={
                                  diff > 0 ? ' text-amber-400' : ' text-emerald-400'
                                }
                              >
                                {diff > 0 ? ` +${diff.toFixed(1)}€` : ` ${diff.toFixed(1)}€`}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-[var(--border-hairline)] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Note village personnalisée (0–2)
              </h3>
              <span className="text-xs font-mono-num text-[var(--accent)]">
                {station.pts_village} / 2
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Ajustez le charme du village en direct ; le classement et le graphique TOP 20 se recalculent immédiatement.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { val: 0, label: '0 · Fonctionnelle' },
                { val: 1, label: '1 · Agréable' },
                { val: 2, label: '2 · Village alpin' },
              ].map((opt) => {
                const active = station.pts_village === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => onUpdateVillageScore(station.name, opt.val)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-page)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2.5 border-t border-[var(--border-hairline)] pt-4">
          {hasSnowHistory ? (
            <button
              type="button"
              onClick={() => onOpenHistory(station.name)}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Voir la courbe d’enneigement</span>
            </button>
          ) : (
            <div className="text-center text-xs text-[var(--text-muted)]">
              Aucun relevé météo quotidien lié à cette station.
            </div>
          )}

          {station.skiradar_url && (
            <a
              href={station.skiradar_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <span>Voir la fiche sur skiradar.fr</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </aside>
    </div>
  );
};
