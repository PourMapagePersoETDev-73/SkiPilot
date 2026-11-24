import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION } from '../version';

interface VersionPayload {
  version: string;
  date: string;
}

let swRegistrationRef: ServiceWorkerRegistration | null = null;
let updateSWRunner: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swInitialized = false;

export function useAppUpdate() {
  const [swNeedRefresh, setSwNeedRefresh] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [remoteDate, setRemoteDate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const checkServerVersion = useCallback(async (explicit = false) => {
    if (!navigator.onLine) {
      if (explicit && isMountedRef.current) {
        setStatusMessage('Hors-ligne : impossible de vérifier');
      }
      return;
    }

    if (explicit && isMountedRef.current) {
      setChecking(true);
      setStatusMessage(null);
    }

    try {
      if (swRegistrationRef) {
        await swRegistrationRef.update().catch(() => undefined);
      }

      const res = await fetch(`./api/version?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        if (explicit && isMountedRef.current) {
          setStatusMessage(`À jour (${APP_VERSION})`);
        }
        return;
      }

      const data = (await res.json()) as VersionPayload;
      if (!isMountedRef.current) return;

      setRemoteVersion(data.version || null);
      setRemoteDate(data.date || null);

      if (explicit) {
        if (data.version && data.version !== APP_VERSION) {
          setStatusMessage(`Mise à jour ${data.version} prête`);
        } else {
          setStatusMessage(`À jour (${APP_VERSION})`);
        }
      }
    } catch {
      if (explicit && isMountedRef.current) {
        setStatusMessage('Vérification impossible');
      }
    } finally {
      if (explicit && isMountedRef.current) {
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const hadControllerAtMount =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      Boolean(navigator.serviceWorker.controller);
    let controllerReloaded = false;

    const handleControllerChange = () => {
      if (!hadControllerAtMount || controllerReloaded) return;
      controllerReloaded = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    if (!swInitialized) {
      swInitialized = true;
      updateSWRunner = registerSW({
        immediate: true,
        onNeedRefresh() {
          if (isMountedRef.current) {
            setSwNeedRefresh(true);
          }
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            swRegistrationRef = registration;
          }
        },
      });
    }

    void checkServerVersion(false);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkServerVersion(false);
      }
    };
    const handleOnline = () => {
      void checkServerVersion(false);
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkServerVersion(false);
      }
    }, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, [checkServerVersion]);

  const versionMismatch =
    remoteVersion !== null && remoteVersion !== APP_VERSION;
  const updateAvailable = swNeedRefresh || versionMismatch;

  const applyUpdate = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(async (r) => {
            await r.update().catch(() => undefined);
            if (r.waiting) {
              r.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          })
        );
      }
      if (updateSWRunner && swNeedRefresh) {
        await updateSWRunner(true);
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => !k.includes('skiradar-api'))
            .map((k) => caches.delete(k))
        );
      }
    } finally {
      window.location.reload();
    }
  }, [swNeedRefresh]);

  return {
    updateAvailable,
    remoteVersion,
    remoteDate,
    checking,
    statusMessage,
    checkForUpdates: () => checkServerVersion(true),
    applyUpdate,
  };
}
