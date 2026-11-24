import React, { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  GitBranch,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AccessRole,
  addAllowedUser,
  removeAllowedUser,
  saveUserPrefs,
  signOutUser,
  subscribeAllowedUsers,
  toggleAllowedUserActive,
} from '../firebase';
import { AllowedUserRecord, CloudSyncStatus, UserPrefsRecord } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface AccessViewProps {
  user: User;
  role: Exclude<AccessRole, 'denied'>;
  userPrefs: UserPrefsRecord;
  cloudSync?: {
    status: CloudSyncStatus;
    revision?: number;
    lastSyncAt?: string;
    stationCount: number;
    snowCount: number;
    error: string | null;
    onSyncNow: () => void;
  };
  onPrefsChange: (next: UserPrefsRecord) => void;
}

export const AccessView: React.FC<AccessViewProps> = ({
  user,
  role,
  userPrefs,
  cloudSync,
  onPrefsChange,
}) => {
  const [departureLabel, setDepartureLabel] = useState(userPrefs.departureLabel);
  const [showDeparture, setShowDeparture] = useState(userPrefs.showDepartureInSidebar);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [allowedUsers, setAllowedUsers] = useState<AllowedUserRecord[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [copiedInviteMsg, setCopiedInviteMsg] = useState(false);

  useEffect(() => {
    setDepartureLabel(userPrefs.departureLabel);
    setShowDeparture(userPrefs.showDepartureInSidebar);
  }, [userPrefs]);

  useEffect(() => {
    if (role !== 'admin') return;
    const unsub = subscribeAllowedUsers(
      (list) => setAllowedUsers(list),
      (err) =>
        setInviteFeedback({
          type: 'err',
          text: err.message,
        })
    );
    return () => unsub();
  }, [role]);

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsBusy(true);
    setPrefsSaved(false);
    try {
      const saved = await saveUserPrefs(user.uid, departureLabel, showDeparture);
      onPrefsChange(saved);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } finally {
      setPrefsBusy(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteBusy(true);
    setInviteFeedback(null);
    try {
      await addAllowedUser(user.uid, inviteEmail, inviteLabel);
      setInviteEmail('');
      setInviteLabel('');
      setInviteFeedback({
        type: 'ok',
        text: 'Accès ajouté. Votre ami peut maintenant se connecter avec cette adresse Google.',
      });
    } catch (err) {
      setInviteFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de l’ajout.',
      });
    } finally {
      setInviteBusy(false);
    }
  };

  const handleCopyShareMessage = async () => {
    const appUrl = window.location.origin;
    const msg = `Salut ! Voici mon accès privé pour l'appli SKI PILOT : ${appUrl}\n\nConnecte-toi avec ton compte Google autorisé.\nSur smartphone Android 16 (Chrome) : menu ⋮ > Ajouter à l'écran d'accueil > Installer.`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedInviteMsg(true);
      setTimeout(() => setCopiedInviteMsg(false), 2500);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--accent)',
                }}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Session protégée active
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {user.email} ·{' '}
                  <span className="font-semibold text-[var(--accent)]">
                    {role === 'admin' ? 'Administrateur' : 'Ami autorisé'}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => signOutUser()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>

          <p className="mt-4 text-xs text-[var(--text-secondary)] leading-relaxed">
            Tant que personne n’est connecté avec un compte autorisé, l’écran de verrouillage masque votre localisation, vos stations et vos fichiers Excel. Vos stations et historiques d’enneigement sont sauvegardés dans votre Cloud Firebase (répercutés en temps réel entre votre PC, votre Android et vos amis autorisés) tout en restant consultables hors-ligne.
          </p>

          {cloudSync && (
            <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3.5 py-2.5 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <Cloud className="h-4 w-4 text-[var(--accent)]" />
                  <span>
                    Base Cloud Firebase :{' '}
                    {cloudSync.status === 'synced'
                      ? 'Synchronisée'
                      : cloudSync.status === 'syncing' || cloudSync.status === 'loading'
                        ? 'Synchronisation...'
                        : cloudSync.status === 'offline'
                          ? 'Hors-ligne (en attente)'
                          : cloudSync.status === 'error'
                            ? 'Erreur'
                            : 'Initialisation'}
                  </span>
                </div>
                {role === 'admin' && (
                  <button
                    type="button"
                    disabled={cloudSync.status === 'syncing'}
                    onClick={cloudSync.onSyncNow}
                    className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${cloudSync.status === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    <span>Forcer la synchro</span>
                  </button>
                )}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono-num tabular-nums">
                {cloudSync.stationCount} stations · {cloudSync.snowCount.toLocaleString('fr-FR')} relevés
                {cloudSync.revision ? ` · Révision #${cloudSync.revision}` : ''}
                {cloudSync.lastSyncAt ? ` · MàJ ${cloudSync.lastSyncAt}` : ''}
              </div>
              {cloudSync.error && (
                <div className="text-[11px] text-red-300">{cloudSync.error}</div>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">
              Installer l’application sur cet appareil :
            </span>
            <PWAInstallButton compact />
          </div>
        </div>

        <form
          onSubmit={handleSavePrefs}
          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <MapPin className="h-4 w-4 text-[var(--accent)]" />
            <span>Confidentialité du point de départ</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Personnalisez ou masquez votre ville de départ affichée dans le menu latéral et les tableaux (utile si vous partagez l’application à des amis).
          </p>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Libellé de départ affiché après connexion
            </label>
            <input
              type="text"
              maxLength={80}
              value={departureLabel}
              onChange={(e) => setDepartureLabel(e.target.value)}
              placeholder="Ex. : Mon point de départ, Annecy, Chambéry..."
              className="h-9 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeparture}
              onChange={(e) => setShowDeparture(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--accent)]"
            />
            <span>Afficher le lieu de départ sous le logo dans la barre latérale</span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={prefsBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {prefsSaved ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Enregistré</span>
                </>
              ) : (
                <span>{prefsBusy ? 'Sauvegarde...' : 'Enregistrer'}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {role === 'admin' && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold font-display text-[var(--text-primary)]">
                <UserPlus className="h-4 w-4 text-[var(--accent)]" />
                <span>Partager l’accès avec des amis</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-2xl">
                Saisissez ici à l’avance les adresses Google de vos amis puis cliquez sur « Autoriser » avant de leur envoyer le lien (il n’y a pas de demande à valider au moment où ils se connectent : dès qu’ils ouvrent SKI PILOT avec cette adresse Google, ils accèdent directement).
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyShareMessage}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0"
            >
              {copiedInviteMsg ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Message d’invitation copié</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Copier le message pour un ami</span>
                </>
              )}
            </button>
          </div>

          <form
            onSubmit={handleAddFriend}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3"
          >
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Adresse Google de l’ami (ex: marc.dupont@gmail.com)"
              className="sm:col-span-6 h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <input
              type="text"
              maxLength={80}
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              placeholder="Prénom ou note (ex: Marc)"
              className="sm:col-span-4 h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={inviteBusy}
              className="sm:col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Autoriser</span>
            </button>
          </form>

          {inviteFeedback && (
            <div
              className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                inviteFeedback.type === 'ok'
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/35 bg-red-500/10 text-red-300'
              }`}
            >
              {inviteFeedback.text}
            </div>
          )}

          <div className="border-t border-[var(--border-hairline)] pt-4">
            <div className="text-xs font-medium text-[var(--text-muted)] mb-2.5">
              Comptes autorisés ({allowedUsers.length})
            </div>
            {allowedUsers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Aucun ami ajouté pour l’instant. Seul votre compte administrateur a accès à SKI PILOT.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)]">
                {allowedUsers.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--text-primary)] truncate">
                        {item.label}
                      </div>
                      <div className="text-[var(--text-muted)] truncate">{item.email}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleAllowedUserActive(item.id, !item.active)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium cursor-pointer ${
                          item.active
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[var(--text-muted)]'
                        }`}
                      >
                        {item.active ? (
                          <>
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Actif</span>
                          </>
                        ) : (
                          <>
                            <UserX className="h-3.5 w-3.5" />
                            <span>Suspendu</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => removeAllowedUser(item.id)}
                        aria-label={`Supprimer ${item.email}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <GitBranch className="h-4 w-4 text-[var(--accent)]" />
          <span>Utiliser votre compte GitHub pour héberger et partager</span>
        </div>
        <ol className="list-decimal space-y-1.5 pl-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <li>
            Téléchargez le projet depuis Google AI Studio (<strong className="text-[var(--text-primary)]">Download</strong>) et publiez-le dans un dépôt <strong className="text-[var(--text-primary)]">privé</strong> sur votre compte GitHub.
          </li>
          <li>
            Hébergez gratuitement l’application (ex. Cloudflare Pages, Vercel, Firebase Hosting ou Cloud Run) : même si l’adresse est sur Internet, le verrou Firebase ci-dessus bloque tout visiteur qui n’est pas dans votre liste d’amis.
          </li>
          <li>
            En cas de nouveau domaine d’hébergement, pensez à ajouter ce domaine dans <strong className="text-[var(--text-primary)]">Firebase Console → Authentication → Settings → Authorized domains</strong> pour que le bouton Google reste actif.
          </li>
        </ol>
      </div>
    </div>
  );
};
