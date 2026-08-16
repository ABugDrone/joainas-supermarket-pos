import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initStorage } from './utils/storage.ts';
import {
  getSavedTheme,
  applyThemeToDocument,
  getSavedFontSize,
  applyFontSizeToDocument,
  getSavedFontFamily,
  applyFontFamilyToDocument,
} from './utils/theme.ts';

async function bootstrap() {
  // Load all persisted data from the internal SQLite database (or localStorage in browser dev).
  // Never let a storage failure block the UI — always render so the app is never a blank window.
  try {
    await initStorage();
  } catch (e) {
    console.error('Storage initialization failed — continuing with empty caches.', e);
  }

  // Immediately apply saved UI theme & typography settings on script boot
  applyThemeToDocument(getSavedTheme());
  applyFontSizeToDocument(getSavedFontSize());
  applyFontFamilyToDocument(getSavedFontFamily());

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
