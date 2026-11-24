import React, { useState } from 'react';
import { CheckCircle2, Download, Laptop, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { canNativePrompt, isInstalled, isIOS, isAndroid, isInIframe, promptInstall } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="truncate">Application installée (hors-ligne prêt)</span>
      </div>
    );
  }

  const handleClick = async () => {
    if (canNativePrompt) {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${
          compact ? 'h-9 px-3 text-xs' : 'w-full min-h-[40px] px-3 py-2 text-xs'
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span className="truncate">
          {canNativePrompt
            ? 'Installer l’application'
            : 'Installer (Android 16 / PC)'}
        </span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="pwa-guide-title"
                  className="font-display text-base font-semibold text-[var(--text-primary)]"
                >
                  Installer SKI PILOT sur smartphone & ordinateur
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  L’application fonctionne en plein écran et hors-ligne grâce à son Service Worker et à sa base locale IndexedDB.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Fermer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isInIframe && (
              <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-300">
                Vous consultez actuellement l’application dans un aperçu intégré. Ouvrez l’URL directe de l’application web dans un onglet Chrome/Edge (sur Android 16 ou Windows) pour activer le bouton d’installation natif.
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs text-[var(--text-secondary)]">
              <div
                className={`rounded-lg border p-3.5 ${
                  isAndroid
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-page)]'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                  <Smartphone className="h-4 w-4 text-[var(--accent)]" />
                  <span>Smartphone Android 16 (Chrome)</span>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Ouvrez l’URL de SKI PILOT dans Google Chrome sur Android 16.</li>
                  <li>
                    Appuyez sur le menu <strong className="text-[var(--text-primary)]">⋮</strong> (en haut à droite), puis choisissez{' '}
                    <strong className="text-[var(--text-primary)]">Ajouter à l’écran d’accueil</strong> &gt;{' '}
                    <strong className="text-[var(--text-primary)]">Installer</strong>.
                  </li>
                  <li>SKI PILOT apparaît comme une vraie app Android (icône dédiée, sans barre d’adresse, utilisable en station hors-ligne).</li>
                </ol>
              </div>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-3.5">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                  <Laptop className="h-4 w-4 text-sky-400" />
                  <span>Ordinateur Windows / Mac (Chrome ou Edge)</span>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Cliquez sur l’icône d’installation dans la barre d’adresse à droite (ou menu Edge &gt; Applications &gt; Installer ce site).</li>
                  <li>Une fenêtre autonome s’ouvre avec raccourci Bureau / Menu Démarrer.</li>
                </ol>
              </div>

              {isIOS && (
                <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3.5">
                  <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                    <Share className="h-4 w-4 text-[var(--accent)]" />
                    <span>iPhone / iPad (Safari)</span>
                  </div>
                  <p className="mt-1.5">
                    Appuyez sur <strong className="text-[var(--text-primary)]">Partager</strong> puis sur{' '}
                    <strong className="text-[var(--text-primary)]">Sur l’écran d’accueil</strong>.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="h-9 rounded-lg px-4 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
