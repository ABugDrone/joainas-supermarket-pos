import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches any render-time error in the app tree and shows a visible recovery
 * screen instead of letting React unmount the whole window (which looks like a
 * frozen/blank app). Reloading the page re-runs the normal boot sequence and
 * recovers from the cached SQLite data.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('App render error caught by ErrorBoundary:', error, info);
  }

  private reload = () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        window.location.reload();
      } else {
        window.location.reload();
      }
    } catch {
      // no-op
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#0c0e12] p-6 font-sans">
          <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl p-8 text-center shadow-2xl">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--warning-bg)] border border-[var(--warning)]/40 flex items-center justify-center text-2xl mb-4">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Something went wrong</h3>
            <p className="text-sm text-slate-400 mb-1">The app hit an unexpected error while rendering.</p>
            <p className="text-xs text-slate-500 mb-6 break-words">Details: {this.state.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.reload}
                className="px-5 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-xl transition"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}