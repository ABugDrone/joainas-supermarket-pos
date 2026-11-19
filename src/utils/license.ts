/**
 * Offline license key validation.
 *
 * The app is fully offline — no server call. The license key is validated
 * against a SHA-256 hash. The key itself is NEVER stored in the codebase;
 * only its hash is present below.
 *
 * Two activation paths:
 *  1. Manual entry — user types/pastes the key into the LicenseGate UI.
 *  2. license.key file — a plain-text file named "license.key" placed in
 *     the app's data directory (e.g. %APPDATA%\com.dronebug.dirms.desktop\).
 *
 * Once validated, the activation is persisted in localStorage so the gate
 * does not reappear on every launch. The user can deactivate from the
 * Developer/About modal if needed.
 */

// SHA-256 hash of the valid license key.
// The key itself is not stored here — only this hash is used for validation.
const LICENSE_HASH = '8bfa38aac6a73cfdd5cf48f785ef3ab085fb7496fd5ec03f71d0cdcb9854886f';

const LS_ACTIVATED_KEY = 'dirms_license_activated';
const LS_ACTIVATED_AT = 'dirms_license_activated_at';

/**
 * Compute SHA-256 hex digest of a string using the Web Crypto API.
 * Available in Chromium 100+ (SubtleCrypto landed in Chrome 37).
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate a license key against the stored hash.
 * Trims whitespace before hashing.
 */
export async function validateLicenseKey(key: string): Promise<boolean> {
  const trimmed = key.trim();
  if (!trimmed) return false;
  try {
    const hash = await sha256(trimmed);
    return hash === LICENSE_HASH;
  } catch (e) {
    console.error('License validation failed', e);
    return false;
  }
}

/**
 * Check if the app is already activated (from localStorage).
 * Synchronous — safe to call during render.
 */
export function isLicenseActivated(): boolean {
  try {
    return localStorage.getItem(LS_ACTIVATED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist activation state after successful validation.
 */
export function setLicenseActivated(activated: boolean): void {
  try {
    if (activated) {
      localStorage.setItem(LS_ACTIVATED_KEY, 'true');
      localStorage.setItem(LS_ACTIVATED_AT, new Date().toISOString());
    } else {
      localStorage.removeItem(LS_ACTIVATED_KEY);
      localStorage.removeItem(LS_ACTIVATED_AT);
    }
  } catch (e) {
    console.error('Failed to persist license activation', e);
  }
}

/**
 * Attempt to read a license.key file from the app data directory.
 * Returns the file contents (trimmed) if found and readable, or null.
 *
 * Uses the Tauri FS plugin and path API — no-op outside the desktop shell.
 */
export async function readLicenseKeyFile(): Promise<string | null> {
  try {
    const { isTauriRuntime } = await import('./db');
    if (!isTauriRuntime()) return null;

    const pathMod = await import('@tauri-apps/api/path').catch(() => null);
    const fsMod = await import('@tauri-apps/plugin-fs').catch(() => null);
    if (!pathMod?.appDataDir || !fsMod?.readTextFile) return null;

    const appDataDir = await pathMod.appDataDir().catch(() => '');
    if (!appDataDir) return null;

    const filePath = `${appDataDir}\\license.key`;
    const content = await fsMod.readTextFile(filePath).catch(() => null);
    if (content && typeof content === 'string') {
      return content.trim();
    }
    return null;
  } catch (e) {
    console.error('Failed to read license.key file', e);
    return null;
  }
}

/**
 * Get the app data directory path (for displaying instructions to the user).
 */
export async function getAppDataDirPath(): Promise<string> {
  try {
    const { isTauriRuntime } = await import('./db');
    if (!isTauriRuntime()) return '%APPDATA%\\com.dronebug.dirms.desktop';

    const pathMod = await import('@tauri-apps/api/path').catch(() => null);
    if (!pathMod?.appDataDir) return '%APPDATA%\\com.dronebug.dirms.desktop';

    const dir = await pathMod.appDataDir().catch(() => '');
    return dir || '%APPDATA%\\com.dronebug.dirms.desktop';
  } catch {
    return '%APPDATA%\\com.dronebug.dirms.desktop';
  }
}

/**
 * Full license check: first try the license.key file (silent), then fall
 * back to the localStorage activation flag. Returns true if either path
 * succeeds.
 */
export async function checkLicenseOnStartup(): Promise<boolean> {
  // 1. If already activated in localStorage, trust it (fast path).
  if (isLicenseActivated()) return true;

  // 2. Try reading a license.key file from app data.
  const fileKey = await readLicenseKeyFile();
  if (fileKey) {
    const valid = await validateLicenseKey(fileKey);
    if (valid) {
      setLicenseActivated(true);
      return true;
    }
  }

  return false;
}
