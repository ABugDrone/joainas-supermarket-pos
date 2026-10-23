// ============================================================
// CLOCK OVERRIDE / FLASHALERT (v2.0.6)
//
// Non-admin users may sign in AND SELL while the trusted clock is unverified.
// Their login is recorded in a PERSISTENT FLASHALERT list (localStorage) so
// the warning survives logout and app restarts. Sales are tagged in the audit
// trail so the ADMIN can reconcile stock/cash when they return. Only an ADMIN
// login or an ADMIN-password verification clears the alert.
//
// The runtime override (sessionStorage) is separate: it stops the live clock
// monitor from auto-signing-out the non-admin session while the gate is bad.
// ============================================================

import { UserRole } from '../types';

export interface ClockOverrideAlert {
  username: string;
  fullName: string;
  role: UserRole;
  /** ISO string for display. */
  loginAt: string;
  /** Unix ms, used for sorting and formatting. */
  loginAtMs: number;
  gateReason: string;
  lastGoodMs: number;
  nowMs: number;
}

export interface ClockOverrideSession {
  username: string;
  fullName: string;
  role: UserRole;
  loginAt: string;
  loginAtMs: number;
  gateReason: string;
  lastGoodMs: number;
  nowMs: number;
}

const ALERTS_KEY = 'joainas_clock_override_alerts_v1';
const SESSION_KEY = 'joainas_clock_override_session_v1';
export const CLOCK_OVERRIDE_EVENT = 'joainas-clock-override-changed';

const MAX_ALERTS = 50;

function emitChanged(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CLOCK_OVERRIDE_EVENT));
    }
  } catch {
    /* non-DOM test environment */
  }
}

function isAlert(value: unknown): value is ClockOverrideAlert {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ClockOverrideAlert>;
  return (
    typeof v.username === 'string' &&
    v.username.length > 0 &&
    typeof v.loginAtMs === 'number' &&
    Number.isFinite(v.loginAtMs)
  );
}

export function loadClockOverrideAlerts(): ClockOverrideAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAlert).slice(0, MAX_ALERTS);
  } catch {
    return [];
  }
}

export function hasPendingClockOverrideAlerts(): boolean {
  return loadClockOverrideAlerts().length > 0;
}

/**
 * Add an alert (newest first). Re-logging in as the same user replaces that
 * user's earlier entry, so the banner names each override user once while the
 * audit log keeps the full login history. Returns the updated list.
 */
export function addClockOverrideAlert(
  alert: Omit<ClockOverrideAlert, 'loginAtMs'> & { loginAtMs?: number }
): ClockOverrideAlert[] {
  const entry: ClockOverrideAlert = {
    ...alert,
    loginAtMs: alert.loginAtMs ?? Date.now(),
  };
  const key = entry.username.trim().toLowerCase();
  const others = loadClockOverrideAlerts().filter(
    (a) => a.username.trim().toLowerCase() !== key
  );
  const next = [entry, ...others].slice(0, MAX_ALERTS);
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(next));
  } catch {
    /* storage full/blocked — keep the in-memory return for this render */
  }
  emitChanged();
  return next;
}

/** Clear every pending FLASHALERT. ADMIN-only action. */
export function clearClockOverrideAlerts(): void {
  try {
    localStorage.removeItem(ALERTS_KEY);
  } catch {
    /* ignore */
  }
  emitChanged();
}

export function loadClockOverrideSession(): ClockOverrideSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClockOverrideSession>;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username) return null;
    return {
      username: parsed.username,
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : parsed.username,
      role: (parsed.role as UserRole) || 'Cashier',
      loginAt: typeof parsed.loginAt === 'string' ? parsed.loginAt : new Date().toISOString(),
      loginAtMs: typeof parsed.loginAtMs === 'number' ? parsed.loginAtMs : Date.now(),
      gateReason: typeof parsed.gateReason === 'string' ? parsed.gateReason : '',
      lastGoodMs: typeof parsed.lastGoodMs === 'number' ? parsed.lastGoodMs : 0,
      nowMs: typeof parsed.nowMs === 'number' ? parsed.nowMs : Date.now(),
    };
  } catch {
    return null;
  }
}

export function setClockOverrideSession(session: ClockOverrideSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  emitChanged();
}

export function clearClockOverrideSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  emitChanged();
}

export function hasActiveClockOverride(): boolean {
  return !!loadClockOverrideSession();
}
