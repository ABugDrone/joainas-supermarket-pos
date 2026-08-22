import { useEffect } from 'react';

/**
 * Desktop-app hardening: disables browser behaviours that have no place
 * inside an installed POS application.
 *
 * - Right-click context menu (which on Windows/WebView2 exposes "Reload"
 *   / "Inspect") is suppressed everywhere — the user asked that system/
 *   browser features like right-click → Refresh never appear in the
 *   desktop app.
 * - Page reload (F5 / Ctrl+R / browser Refresh button) is intentionally
 *   *not* blocked: the session is now persisted in sessionStorage so a
 *   refresh keeps the user logged in. Only closing the window/tab
 *   clears the session (sessionStorage semantics), which is exactly what
 *   the user requested for the web preview ("refresh should not lead to
 *   log out only close of app can automatically log out").
 */
export function useDisableBrowserInterference(): void {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Capture phase so we win even if a child calls stopPropagation.
    document.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, []);
}
