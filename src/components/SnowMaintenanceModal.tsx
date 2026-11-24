import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  LumiplanBulletin,
  SkiRadarStation,
  SnowBackupSnapshot,
  SnowRecord,
  StationRecord,
} from '../types';
import { detectSnowDatabaseAnomalies, SnowRecordAnomaly } from '../utils/lumiplan';

interface SnowMaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  snow: SnowRecord[];
  stations: StationRecord[];
  lumiplanBulletins: LumiplanBulletin[];
  skiRadarStations: SkiRadarStation[];
  backups: SnowBackupSnapshot[];
  onPurgeSince: (cutoffDay: string, label: string) => number;
  onPurgeRecords: (
    targets: Array<{ station: string; day: string }>,
    label: string
  ) => number;
  onRestoreBackup: (snapshotId: string) => void;
  onUpdateRecord: (station: string, day: string, ground: number | null, fresh: number | null) => void;
  onDeleteRecord: (station: string, day: string) => void;
  onAddManualRecord: (station: string, day: string, ground: number, fresh: number) => void;
}

export const SnowMaintenanceModal: React.FC<SnowMaintenanceModalProps> = ({
  open,
  onClose,
  snow,
  stations,
  lumiplanBulletins,
  skiRadarStations,
  backups,
  onPurgeSince,
  onPurgeRecords,
  onRestoreBackup,
  onUpdateRecord,
  onDeleteRecord,
  onAddManualRecord,
}) => {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [filterMode, setFilterMode] = useState<'anomalies' | 'all_recent'>('all_recent');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editGround, setEditGround] = useState<string>('');
  const [editFresh, setEditFresh] = useState<string>('');

  const [manualStation, setManualStation] = useState<string>(stations[0]?.name ?? '');
  const [manualDay, setManualDay] = useState<string>(todayIso);
  const [manualGround, setManualGround] = useState<string>('');
  const [manualFresh, setManualFresh] = useState<string>('0');

  const analyzed = useMemo(
    () => detectSnowDatabaseAnomalies(snow, lumiplanBulletins, skiRadarStations),
    [lumiplanBulletins, skiRadarStations, snow]
  );

  const todayCount = useMemo(
    () => snow.filter((r) => r.day >= todayIso).length,
    [snow, todayIso]
  );
  const seasonCount = useMemo(
    () => snow.filter((r) => r.day >= '2026-09-01').length,
    [snow]
  );
  const anomalyRows = useMemo(
    () => analyzed.filter((r) => r.severity !== 'ok'),
    [analyzed]
  );
  const criticalRows = useMemo(
    () => analyzed.filter((r) => r.severity === 'critical'),
    [analyzed]
  );
  const anomalyCount = anomalyRows.length;
  const criticalCount = criticalRows.length;
  const okCount = Math.max(0, analyzed.length - anomalyCount);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analyzed.filter((row) => {
      if (filterMode === 'anomalies' && row.severity === 'ok') return false;
      if (q && !row.station.toLowerCase().includes(q) && !row.day.includes(q)) return false;
      return true;
    });
  }, [analyzed, filterMode, search]);

  const stationNames = useMemo(
    () =>
      Array.from(new Set(stations.map((s) => s.name))).sort((a, b) =>
        a.localeCompare(b, 'fr')
      ),
    [stations]
  );

  if (!open) return null;

  const startEdit = (row: SnowRecordAnomaly) => {
    setEditingKey(`${row.station}__${row.day}`);
    setEditGround(row.ground !== null ? String(row.ground) : '');
    setEditFresh(row.fresh !== null ? String(row.fresh) : '0');
  };

  const commitEdit = (station: string, day: string) => {
    const g = editGround.trim() === '' ? null : Math.max(0, Math.round(Number(editGround)));
    const f = editFresh.trim() === '' ? null : Math.max(0, Math.round(Number(editFresh)));
    if (g !== null && !Number.isFinite(g)) return;
    if (f !== null && !Number.isFinite(f)) return;
    onUpdateRecord(station, day, g, f);
    setEditingKey(null);
    setFeedback(`Relevé corrigé : ${station} (${day}) -> ${g ?? '—'} cm au sol.`);
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const st = manualStation || stationNames[0];
    const g = Math.max(0, Math.round(Number(manualGround)));
    const f = Math.max(0, Math.round(Number(manualFresh || 0)));
    if (!st || !/^\d{4}-\d{2}-\d{2}$/.test(manualDay) || !Number.isFinite(g)) return;
    onAddManualRecord(st, manualDay, g, Number.isFinite(f) ? f : 0);
    setManualGround('');
    setFeedback(`Relevé manuel enregistré : ${st} (${manualDay}) -> ${g} cm.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Réparation & contrôle de la base neige
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Revenir avant la mise à jour d’aujourd’hui, purger les bulletins périmés ou corriger une hauteur manuellement.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {feedback && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-[11px] underline cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Quick Recovery Actions */}
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <RotateCcw className="h-4 w-4 text-[var(--accent)]" />
              <span>Restauration rapide de l’historique neige</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={todayCount === 0}
                onClick={() => {
                  const removed = onPurgeSince(todayIso, `Avant purge du ${todayIso}`);
                  setFeedback(
                    `${removed} relevé(s) enregistré(s) à partir du ${todayIso} supprimé(s). Votre base est revenue comme avant aujourd’hui (sauvegarde automatique créée).`
                  );
                }}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/15 px-3.5 py-1.5 text-center text-xs font-semibold leading-snug text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Revenir avant aujourd’hui ({todayCount} relevé{todayCount > 1 ? 's' : ''} du {todayIso})
                </span>
              </button>

              <button
                type="button"
                disabled={anomalyCount === 0}
                onClick={() => {
                  const removed = onPurgeRecords(
                    anomalyRows.map((r) => ({ station: r.station, day: r.day })),
                    `Avant suppression de ${anomalyCount} anomalie(s)`
                  );
                  setFeedback(
                    `${removed} relevé(s) avec anomalies supprimé(s) d’un coup. Les ${okCount} relevé(s) OK de la saison (et les années précédentes) sont conservés.`
                  );
                }}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-500/15 px-3.5 py-1.5 text-center text-xs font-semibold leading-snug text-orange-200 hover:bg-orange-500/25 disabled:opacity-40 cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Supprimer toutes les anomalies ({anomalyCount}) · Garder {okCount} OK
                </span>
              </button>

              {criticalCount > 0 && criticalCount < anomalyCount && (
                <button
                  type="button"
                  onClick={() => {
                    const removed = onPurgeRecords(
                      criticalRows.map((r) => ({ station: r.station, day: r.day })),
                      `Avant suppression de ${criticalCount} anomalie(s) critique(s)`
                    );
                    setFeedback(
                      `${removed} anomalie(s) critique(s) supprimée(s) (les relevés OK et avertissements mineurs sont conservés).`
                    );
                  }}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-1.5 text-center text-xs font-medium leading-snug text-red-200 hover:bg-red-500/20 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Critiques uniquement ({criticalCount})</span>
                </button>
              )}

              <button
                type="button"
                disabled={seasonCount === 0}
                onClick={() => {
                  const removed = onPurgeSince('2026-09-01', 'Avant remise à zéro saison 2026-27');
                  setFeedback(
                    `${removed} relevé(s) de la saison 2026-27 supprimé(s). Les années précédentes (Excel / 2024–2026) sont intactes.`
                  );
                }}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 text-center text-xs font-medium leading-snug text-red-200 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Purger toute la saison 2026-27 ({seasonCount} relevé{seasonCount > 1 ? 's' : ''})
                </span>
              </button>
            </div>

            {backups.length > 0 && (
              <div className="border-t border-[var(--border-hairline)] pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                  <History className="h-3.5 w-3.5" />
                  <span>Sauvegardes automatiques récentes (avant chaque modification)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {backups.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        onRestoreBackup(b.id);
                        setFeedback(
                          `Sauvegarde restaurée (${b.label} · ${b.snow.length.toLocaleString('fr-FR')} relevés).`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3 text-[var(--accent)]" />
                      <span>
                        {b.label} ({new Date(b.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Anomaly Inspector & Inline Editor */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all_recent')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      filterMode === 'all_recent'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Relevés 2026-27 ({seasonCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('anomalies')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      filterMode === 'anomalies'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Anomalies ({anomalyCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-52">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer station ou date..."
                    className="h-8 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] pl-8 pr-2.5 text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-hairline)]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border-hairline)]">
                    <th className="py-2 pl-3 pr-2">Station</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2 text-right">Sol (cm)</th>
                    <th className="py-2 px-2 text-right">Fraîche</th>
                    <th className="py-2 px-2">Diagnostic</th>
                    <th className="py-2 pl-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {visibleRows.map((row) => {
                    const rowKey = `${row.station}__${row.day}`;
                    const isEditing = editingKey === rowKey;
                    return (
                      <tr key={rowKey} className="hover:bg-[var(--bg-subtle)]">
                        <td className="py-2 pl-3 pr-2 font-medium text-[var(--text-primary)]">
                          {row.station}
                        </td>
                        <td className="py-2 px-2 font-mono-num tabular-nums text-[var(--text-secondary)]">
                          {row.day}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-num tabular-nums">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              max={900}
                              value={editGround}
                              onChange={(e) => setEditGround(e.target.value)}
                              className="h-7 w-16 rounded border border-[var(--accent)] bg-[var(--bg-page)] px-1.5 text-right text-xs text-[var(--text-primary)]"
                            />
                          ) : (
                            <span className="font-semibold text-[var(--text-primary)]">
                              {row.ground !== null ? `${row.ground} cm` : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-num tabular-nums">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              max={300}
                              value={editFresh}
                              onChange={(e) => setEditFresh(e.target.value)}
                              className="h-7 w-14 rounded border border-[var(--accent)] bg-[var(--bg-page)] px-1.5 text-right text-xs text-[var(--text-primary)]"
                            />
                          ) : (
                            <span className="text-sky-400">
                              {row.fresh !== null && row.fresh > 0 ? `+${row.fresh} cm` : '0'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {row.severity === 'critical' ? (
                            <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-300">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[210px]" title={row.reason ?? ''}>
                                {row.reason}
                              </span>
                            </span>
                          ) : row.severity === 'warning' ? (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[210px]" title={row.reason ?? ''}>
                                {row.reason}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-400">OK</span>
                          )}
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => commitEdit(row.station, row.day)}
                                className="inline-flex h-7 items-center gap-1 rounded bg-emerald-500/20 px-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                              >
                                <Save className="h-3 w-3" />
                                <span>OK</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingKey(null)}
                                className="inline-flex h-7 items-center rounded px-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="rounded border border-[var(--border-hairline)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                              >
                                Corriger
                              </button>
                              <button
                                type="button"
                                aria-label={`Supprimer ${row.station} ${row.day}`}
                                onClick={() => {
                                  onDeleteRecord(row.station, row.day);
                                  setFeedback(`Relevé supprimé : ${row.station} (${row.day}).`);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border-hairline)] text-[var(--text-muted)] hover:border-red-500/50 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                        {seasonCount === 0
                          ? 'Aucun relevé enregistré pour la saison 2026-27 (base propre).'
                          : 'Aucun relevé ne correspond à ce filtre.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Manual Entry */}
          <form
            onSubmit={handleManualAdd}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-2.5"
          >
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Ajouter ou corriger un relevé manuellement
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="space-y-1">
                <span className="block text-[11px] text-[var(--text-muted)]">Station</span>
                <select
                  value={manualStation}
                  onChange={(e) => setManualStation(e.target.value)}
                  className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 text-xs text-[var(--text-primary)]"
                >
                  {stationNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[11px] text-[var(--text-muted)]">Date</span>
                <input
                  type="date"
                  value={manualDay}
                  onChange={(e) => setManualDay(e.target.value)}
                  className="h-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 text-xs font-mono-num text-[var(--text-primary)]"
                />
              </label>

              <label className="space-y-1">
                <span className="block text-[11px] text-[var(--text-muted)]">Au sol (cm)</span>
                <input
                  type="number"
                  min={0}
                  max={900}
                  required
                  value={manualGround}
                  onChange={(e) => setManualGround(e.target.value)}
                  placeholder="ex: 45"
                  className="h-8 w-24 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 text-xs font-mono-num text-[var(--text-primary)]"
                />
              </label>

              <label className="space-y-1">
                <span className="block text-[11px] text-[var(--text-muted)]">Fraîche (cm)</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={manualFresh}
                  onChange={(e) => setManualFresh(e.target.value)}
                  className="h-8 w-20 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 text-xs font-mono-num text-[var(--text-primary)]"
                />
              </label>

              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Enregistrer</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
