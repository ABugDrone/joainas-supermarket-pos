import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { initStorage, registerCloseFlush } from './utils/storage.ts';
import {
  getSavedTheme,
  applyThemeToDocument,
  getSavedFontSize,
  applyFontSizeToDocument,
  getSavedFontFamily,
  applyFontFamilyToDocument,
} from './utils/theme.ts';

async function bootstrap() {
  // Apply saved UI theme & typography FIRST so the first paint is correct,
  // then render immediately so the splash is replaced even if storage hangs.
  // Storage loads in the background; App refreshes when 'storage-ready' fires.
  applyThemeToDocument(getSavedTheme());
  applyFontSizeToDocument(getSavedFontSize());
  applyFontFamilyToDocument(getSavedFontFamily());

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );

  // Load persisted data (SQLite or localStorage). Never let a storage failure
  // or hang block the UI — race with a timeout and always notify the app.
  // v1.5.2: 30s window (was 10s) — slow HDD/antivirus PCs need room for the
  // SQLite bootstrap, or the app decides setup-vs-login with empty caches.
  try {
    await Promise.race([
      initStorage(),
      new Promise<void>((resolve) => setTimeout(resolve, 30000)),
    ]);
  } catch (e) {
    console.error('Storage initialization failed — continuing with empty caches.', e);
  } finally {
    try {
      window.dispatchEvent(new Event('storage-ready'));
    } catch {}
  }

  // Register a window-close interceptor that flushes every pending SQLite
  // write before the app is allowed to exit — this is what prevents
  // "inventory vanished after restart" when the user closes the window
  // right after adding products (the queued write would otherwise die).
  void registerCloseFlush();
}

// If the bundle itself crashes before React mounts, replace the infinite
// spinner with the actual error so "stuck in splash" is diagnosable.
window.addEventListener('error', (e) => {
  const splash = document.getElementById('senior-splash');
  if (splash && !document.querySelector('#root > div:not(#senior-splash)')) {
    const sub = splash.querySelector('.subtitle');
    if (sub) {
      sub.textContent = `Startup error: ${(e as ErrorEvent).message || 'failed to load'}. Close and reopen the app.`;
      (sub as HTMLElement).style.color = '#f87171';
    }
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection during startup', (e as PromiseRejectionEvent).reason);
});

bootstrap();
