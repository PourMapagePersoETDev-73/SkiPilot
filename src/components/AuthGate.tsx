import React, { useState } from 'react';
import { Lock, LogIn, LogOut, Mountain, ShieldAlert } from 'lucide-react';
import { User } from 'firebase/auth';
import { signInWithGooglePopup, signOutUser } from '../firebase';

interface AuthGateProps {
  status: 'checking' | 'unauthenticated' | 'denied';
  user: User | null;
  errorMessage?: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({ status, user, errorMessage }) => {
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setLoginError(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-blocked')) {
        setLoginError(
          'La fenêtre de connexion a été bloquée par le navigateur. Autorisez les pop-ups pour ce site puis réessayez.'
        );
      } else if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
        setLoginError('Connexion annulée.');
      } else {
        setLoginError('Impossible d’ouvrir la connexion Google. Vérifiez votre connexion Internet.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] px-4 py-8 text-[var(--text-primary)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{
              backgroundColor: 'var(--accent-soft)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--accent)',
            }}
          >
            <Mountain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">
              SKI PILOT
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Comparateur alpin · Accès protégé
            </p>
          </div>
        </div>

        {status === 'checking' && (
          <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-5 text-center">
            <div className="text-sm font-medium text-[var(--text-primary)]">
              Vérification de l’accès en cours...
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Contrôle de votre session autorisée.
            </p>
          </div>
        )}

        {status === 'unauthenticated' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Lock className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Application privée</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Connectez-vous avec votre compte Google autorisé pour accéder aux classements, aux données d’enneigement et à vos imports Excel.
              </p>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleSignIn}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <LogIn className="h-4 w-4" />
              <span>{busy ? 'Connexion en cours...' : 'Se connecter avec Google'}</span>
            </button>
          </div>
        )}

        {status === 'denied' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Compte non autorisé</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                Le compte{' '}
                <strong className="text-[var(--text-primary)]">
                  {user?.email ?? 'inconnu'}
                </strong>{' '}
                ne figure pas dans la liste d’accès de cette application. Demandez à l’administrateur d’ajouter cette adresse e-mail dans l’onglet « Accès & Profil ».
              </p>
            </div>

            <button
              type="button"
              onClick={() => signOutUser()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Changer de compte Google</span>
            </button>
          </div>
        )}

        {(loginError || errorMessage) && (
          <div className="mt-4 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {loginError || errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};
