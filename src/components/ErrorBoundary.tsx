import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Une erreur inattendue est survenue.',
    };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let parsedError = this.state.message;
    try {
      const obj = JSON.parse(this.state.message);
      if (obj && typeof obj.error === 'string') {
        parsedError = obj.error;
      }
    } catch {
      // Keep raw message if not JSON
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-6 text-[var(--text-primary)]">
        <div className="w-full max-w-md rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <h1 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Accès interrompu
            </h1>
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed break-words">
            {parsedError}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Recharger l’application</span>
          </button>
        </div>
      </div>
    );
  }
}
