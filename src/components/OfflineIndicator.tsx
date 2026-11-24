import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/12 px-4 py-2 text-xs text-amber-300"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        Mode hors-ligne actif : vos stations, historiques neige et classements enregistrés restent disponibles localement.
      </span>
    </div>
  );
};
