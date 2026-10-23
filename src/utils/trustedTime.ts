// ============================================================
// TRUSTED WALL-CLOCK ANCHOR (v1.5.1) — offline tamper-evident sales dating.
//
// Threat: the OS date is moved backwards, sales are made with a fake date,
// then the clock is restored — those receipts vanish from "today" unless an
// ADMIN digs through the audit trail.
//
// Defense (works fully offline): the app remembers the highest wall-clock
// value it has ever legitimately seen ("high-water anchor") plus a monotonic
// sale sequence number. Both live in the SQLite vault (app_settings) with a
// localStorage mirror, and are raised on every boot and every sale. The OS
// clock can be moved forward freely, but it can never be moved BACK below
// the anchor without the app noticing — and there is no in-app way to lower
// the anchor except the ADMIN re-anchor action (which writes an audit entry).
//
// This module is dependency-free (imports only ./db) so both storage.ts and
// UI components can use it without import cycles.
// ============================================================

import { dbGetSetting, dbSetSetting, isTauriRuntime } from './db';

export interface TimeAnchor {
  /** Highest legitimate wall-clock (Date.now ms) ever observed. */
  lastSeenWallMs: number;
  /** Monotonic counter bumped on every recorded sale. */
  saleSeq: number;
}

export interface ClockGate {
  ok: boolean;
  reason: string;
  lastGoodMs: number;
  nowMs: number;
  /** Clock jumped >24h forward — flagged, NOT blocked (see below). */
  forwardJump: boolean;
}

/** Verdict from the Rust backend's `validate_startup_time` command. */
export interface StartupTimeValidation {
  ok: boolean;
  reason: string;
  last_trusted_unix: number;
  current_unix: number;
}

/** Backward moves smaller than this are tolerated (travel, DST, drift). */
export const ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
/**
 * Session gate (v2.0.6): only BACKWARD moves beyond this tolerance block.
 * Backward moves hide sales from "today"; forward moves are normal downtime
 * (lunch, overnight, weekend) and are accepted. Small drifts (NTP, DST,
 * seconds-level fixes) pass freely; a real rollback needs an ADMIN
 * re-anchor (audit-logged) or an ADMIN login.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 30 * 60 * 1000;
/** Forward jumps beyond this raise a flag (possible prelude to rollback). */
export const FORWARD_JUMP_MS = 24 * 3600 * 1000;
/** A new sale's timestamp may lag "now" by at most this (slow checkout). */
export const SALE_PAST_WINDOW_MS = 15 * 60 * 1000;
/** A new sale's timestamp may lead "now" by at most this (ms drift). */
export const SALE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// NOTE: storage key is frozen forever — renaming it would reset the anchor
// and blind the detector on upgrade.
const LS_KEY = 'senior_citizen_accessories_trusted_time_v1';
const DB_KEY = 'trusted_time_anchor';

function readLocalAnchor(): TimeAnchor | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TimeAnchor>;
    const lastSeenWallMs = Number(parsed.lastSeenWallMs);
    const saleSeq = Number(parsed.saleSeq);
    if (!Number.isFinite(lastSeenWallMs) || lastSeenWallMs < 0) return null;
    if (!Number.isFinite(saleSeq) || saleSeq < 0) return null;
    return { lastSeenWallMs, saleSeq: Math.floor(saleSeq) };
  } catch {
    return null;
  }
}

function writeLocalAnchor(a: TimeAnchor): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(a));
  } catch {
    /* storage full/blocked — DB copy still protects Tauri installs */
  }
}

let memAnchor: TimeAnchor | null = null;

/** Synchronous in-memory anchor (hydrated from localStorage on first use). */
export function getAnchor(): TimeAnchor {
  if (!memAnchor) {
    memAnchor = readLocalAnchor() ?? { lastSeenWallMs: 0, saleSeq: 0 };
  }
  return memAnchor;
}

/** Test/edge hook: replace the in-memory anchor (also mirrors to localStorage). */
export function setAnchorForTests(a: TimeAnchor): void {
  memAnchor = { ...a };
  writeLocalAnchor(memAnchor);
}

/**
 * Merge the SQLite-vault anchor with the local mirror, keeping the maximum
 * of each field (an attacker can only move the OS clock — they cannot lower
 * either stored copy from outside the app). Call once during initStorage.
 */
export async function hydrateAnchor(): Promise<TimeAnchor> {
  const merged: TimeAnchor = { ...getAnchor() };
  if (isTauriRuntime()) {
    try {
      const raw = await dbGetSetting(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TimeAnchor>;
        const dbWall = Number(parsed.lastSeenWallMs);
        const dbSeq = Number(parsed.saleSeq);
        if (Number.isFinite(dbWall) && dbWall > merged.lastSeenWallMs) {
          merged.lastSeenWallMs = dbWall;
        }
        if (Number.isFinite(dbSeq) && Math.floor(dbSeq) > merged.saleSeq) {
          merged.saleSeq = Math.floor(dbSeq);
        }
      }
    } catch {
      /* vault read failed — local mirror still protects this session */
    }
  }
  memAnchor = merged;
  writeLocalAnchor(merged);
  return merged;
}

/** Persist the anchor to both copies (best-effort, never throws). */
export async function persistAnchor(a: TimeAnchor = getAnchor()): Promise<void> {
  writeLocalAnchor(a);
  if (isTauriRuntime()) {
    try {
      await dbSetSetting(DB_KEY, JSON.stringify(a));
    } catch {
      /* vault write failed — local mirror still holds the value */
    }
  }
}

/**
 * Core detector: is `nowMs` believable given the anchor?
 *
 * v2.0.6 policy: ONLY a backwards rollback is tampering.
 * - Backwards beyond tolerance → BLOCKED (fake-date sales would vanish).
 * - Forwards beyond tolerance → ALLOWED. A shop that closes for lunch,
 *   overnight or a weekend naturally reopens with a wall clock ahead of the
 *   last in-app anchor. Treating that normal gap as tampering was the cause
 *   of the false warning after every restart / long shutdown.
 *   A forward jump over 24h is still flagged via `forwardJump` for the audit
 *   trail, but it does not block sign-in or sales.
 * - Anything else → allowed; caller raises the high-water mark.
 *
 * Recovery from a genuine backward fix: an ADMIN re-anchors from the login
 * screen or Admin → DB & Backups (password-verified, reason required,
 * audited), or simply signs in as ADMIN — v2.0.6 treats an ADMIN login as
 * clock verification and re-anchors automatically.
 */
export function checkWallClock(nowMs: number = Date.now(), anchor: TimeAnchor = getAnchor()): ClockGate {
  const lastGoodMs = anchor.lastSeenWallMs;
  if (lastGoodMs > 0 && nowMs < lastGoodMs - CLOCK_SKEW_TOLERANCE_MS) {
    return {
      ok: false,
      reason:
        `System clock was moved backwards by more than 30 minutes. Last verified time: ${new Date(lastGoodMs).toLocaleString()} — ` +
        `current system time: ${new Date(nowMs).toLocaleString()}. ` +
        `Sales continue under a FLASHALERT and are tagged for ADMIN review until the clock is corrected or an ADMIN verifies it.`,
      lastGoodMs,
      nowMs,
      forwardJump: false,
    };
  }
  if (lastGoodMs > 0 && nowMs > lastGoodMs + CLOCK_SKEW_TOLERANCE_MS) {
    const farFuture = nowMs > lastGoodMs + FORWARD_JUMP_MS;
    return {
      ok: true,
      reason: farFuture
        ? `System clock is more than a day ahead of the last verified time (normal after a long shutdown).`
        : '',
      lastGoodMs,
      nowMs,
      forwardJump: farFuture,
    };
  }
  return { ok: true, reason: '', lastGoodMs, nowMs, forwardJump: false };
}

/** Local YYYY-MM-DD for a wall-clock instant (matches sales dating). */
export function localDayOf(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA');
}

/**
 * Validate a freshly built sale before it is recorded. Rejects:
 * - sales dated to any day other than the current local day,
 * - timestamps outside [now − 15min, now + 5min],
 * - timestamps older than the anchor (monotonicity — a backdated insert
 *   from a manipulated clock can never slip in beside the wall check).
 */
export function validateNewSale(
  sale: { date: string; timestamp: number },
  nowMs: number = Date.now(),
  anchor: TimeAnchor = getAnchor()
): { ok: boolean; reason: string } {
  if (sale.date !== localDayOf(nowMs)) {
    return {
      ok: false,
      reason: `Sale date ${sale.date} does not match today ${localDayOf(nowMs)}. Check the system date.`,
    };
  }
  if (!Number.isFinite(sale.timestamp) || sale.timestamp < nowMs - SALE_PAST_WINDOW_MS) {
    return { ok: false, reason: 'Sale timestamp is too far in the past. Check the system date and time.' };
  }
  if (sale.timestamp > nowMs + SALE_FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'Sale timestamp is in the future. Check the system date and time.' };
  }
  if (anchor.lastSeenWallMs > 0 && sale.timestamp < anchor.lastSeenWallMs - ROLLBACK_TOLERANCE_MS) {
    return { ok: false, reason: 'Sale timestamp is older than the last verified time — possible clock tampering.' };
  }
  return { ok: true, reason: '' };
}

/**
 * Raise the high-water mark WITHOUT bumping the sequence (boot, close,
 * legitimate forward moves). Never lowers the anchor.
 */
export function touchClock(nowMs: number = Date.now()): TimeAnchor {
  const a = getAnchor();
  if (nowMs > a.lastSeenWallMs) {
    memAnchor = { ...a, lastSeenWallMs: nowMs };
    void persistAnchor(memAnchor);
  }
  return getAnchor();
}

/**
 * Record that a sale was just completed: raise the high-water mark and bump
 * the monotonic sequence. Persists to both copies (best-effort).
 */
export function advanceForSale(nowMs: number = Date.now()): TimeAnchor {
  const a = getAnchor();
  memAnchor = {
    lastSeenWallMs: Math.max(nowMs, a.lastSeenWallMs),
    saleSeq: a.saleSeq + 1,
  };
  void persistAnchor(memAnchor);
  return memAnchor;
}

/**
 * ADMIN-only escape hatch: accept the current OS time as the new anchor
 * (used after a genuine clock fix/replacement). There is deliberately NO
 * silent path — every caller must write an audit entry with the reason.
 */
export function reanchor(nowMs: number = Date.now()): TimeAnchor {
  const a = getAnchor();
  memAnchor = { lastSeenWallMs: nowMs, saleSeq: a.saleSeq };
  void persistAnchor(memAnchor);
  return memAnchor;
}

// ============================================================
// STORAGE SELF-TEST (v1.5.2) — fail LOUD, never loop silently.
//
// The setup/login decision depends on persisted flags (license, setup-done,
// users). If the WebView profile is non-persistent (temp profile, cleaner
// software, unwritable disk), every boot looks factory-fresh and the app
// loops setup forever with no explanation. Probe once at boot: a broken
// store gets an explicit error screen, not an infinite wizard loop.
// ============================================================

export interface StorageHealth {
  ok: boolean;
  reason: string;
}

const STORAGE_PROBE_KEY = '__amorims_storage_probe__';

/** Synchronous localStorage write/read/delete round-trip. Never throws. */
export function probeLocalPersistence(): StorageHealth {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return { ok: false, reason: 'No local storage available in this environment.' };
    }
    window.localStorage.setItem(STORAGE_PROBE_KEY, '1');
    const back = window.localStorage.getItem(STORAGE_PROBE_KEY);
    window.localStorage.removeItem(STORAGE_PROBE_KEY);
    if (back !== '1') {
      return {
        ok: false,
        reason: 'Local storage read-back mismatch — the app profile may be read-only or wiped by cleaner software after every launch.',
      };
    }
    return { ok: true, reason: '' };
  } catch (e) {
    return {
      ok: false,
      reason: `Local storage is not writable (${e instanceof Error ? e.message : String(e)}). Sign-in data cannot be saved on this PC — check disk space, antivirus quarantine, and that the app is not running in a temporary profile.`,
    };
  }
}

// ============================================================
// STARTUP VALIDATION (v1.5.2) — rollback detection across restarts.
//
// The in-app anchor only advances while the app is running, so a rollback
// performed while the app was CLOSED is invisible whenever the anchor stores
// were also wiped or restored from an old backup. The Rust backend keeps an
// independent boot timestamp (`validate_startup_time` command); this section
// consumes that verdict and latches a session-wide tamper gate from it.
//
// The latch is deliberate: the backend does NOT advance its stamp on a failed
// boot, so the condition persists until the clock is corrected AND the app is
// restarted (a fresh boot re-validates). The 2s monitor must not flap the
// verdict back to "ok" in between — hence every gate reader below honors the
// latch until process restart.
// ============================================================

/**
 * Ask the Rust backend whether the OS clock was moved backwards while the
 * app was closed. Returns null outside the Tauri runtime or when the backend
 * is unreachable — fail-OPEN, because a disk/permission error must never
 * brick sales; the in-app anchor + live monitor still protect the session.
 */
export async function validateStartupTime(): Promise<StartupTimeValidation | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const res = await invoke<StartupTimeValidation>('validate_startup_time');
    if (!res || typeof res.ok !== 'boolean') return null;
    return res;
  } catch {
    return null;
  }
}

/**
 * v2.0.6: rewrite the native startup stamp after an ADMIN has verified that
 * the current OS date/time is correct. Without this, `startup_time.bin` keeps
 * the old (possibly future) value and the next launch re-flags a clean clock.
 * Fail-open outside Tauri or when the backend is unreachable.
 */
export async function acceptStartupTime(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('accept_startup_time');
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// LIVE MONITOR (v1.5.1) — real-time tamper response, no refresh needed.
//
// A 5s singleton ticker re-evaluates the gate and broadcasts it on
// 'amorims-clock-gate'. The app subscribes: POS banners appear/disappear
// live, a tampered session is signed out within seconds, and the login
// screen unblocks the instant the clock is corrected. Legitimate forward
// time keeps the high-water mark fresh (throttled to one vault write/min).
// ============================================================

const CLOCK_GATE_EVENT = 'amorims-clock-gate';
// Fired when a checkout is attempted under a manipulated clock — the app
// must sign the user out immediately (POS cannot log out by itself).
const CLOCK_LOGOUT_EVENT = 'amorims-clock-logout';
const ANCHOR_REFRESH_MS = 60 * 1000;

let lastGate: ClockGate | null = null;
let monitorId: ReturnType<typeof setInterval> | null = null;

/** Latched startup-tamper gate (null = this boot validated cleanly). */
let startupTamper: ClockGate | null = null;

/**
 * Latch a failed startup validation for the rest of this process: every gate
 * reader reports it and every UI listener blocks on it. Broadcasts
 * immediately so the login screen + POS react without waiting for the next
 * monitor tick.
 */
export function reportStartupTamper(reason: string, lastGoodMs: number, nowMs: number): ClockGate {
  startupTamper = { ok: false, reason, lastGoodMs, nowMs, forwardJump: false };
  lastGate = startupTamper;
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CLOCK_GATE_EVENT, { detail: startupTamper }));
    }
  } catch {
    /* non-DOM environment (tests import this module too) */
  }
  return startupTamper;
}

/**
 * Clear the latched boot-time tamper verdict.
 *
 * Only ever called after an ADMIN has password-verified that the computer's
 * date and time are correct (the accepted re-anchor). This is the sanctioned
 * path for the common false positive: Windows/Internet time sync auto-corrects
 * the date after a shutdown or a network cable is plugged in, the boot check
 * had already flagged the mismatch, and the app would otherwise stay blocked
 * until a restart even though the clock is now right.
 */
export function clearStartupTamper(): void {
  startupTamper = null;
  lastGate = null;
}

/** Test hook — same latch, kept for the existing test suite. */
export function clearStartupTamperForTests(): void {
  clearStartupTamper();
}

/**
 * Session-effective verdict: a latched startup tamper wins over the
 * wall-clock anchor check. `checkWallClock` itself stays pure (tests + sale
 * validation call it directly); this is the session-policy wrapper every
 * live reader should use.
 */
export function getEffectiveGate(nowMs: number = Date.now(), anchor: TimeAnchor = getAnchor()): ClockGate {
  return startupTamper ?? checkWallClock(nowMs, anchor);
}

/** Most recent evaluated gate (evaluates on the spot if never run). */
export function getLastGate(nowMs: number = Date.now()): ClockGate {
  return startupTamper ?? lastGate ?? checkWallClock(nowMs, getAnchor());
}

/** Re-evaluate now, refresh the anchor when healthy, broadcast the result. */
export function refreshGate(nowMs: number = Date.now()): ClockGate {
  const anchor = getAnchor();
  const g = getEffectiveGate(nowMs, anchor);
  if (g.ok && nowMs - anchor.lastSeenWallMs > ANCHOR_REFRESH_MS) {
    touchClock(nowMs);
  }
  lastGate = g;
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CLOCK_GATE_EVENT, { detail: g }));
    }
  } catch {
    /* non-DOM environment (tests import this module too) */
  }
  return g;
}

/** Start the app-lifetime ticker (singleton — safe under StrictMode). */
export function startClockMonitor(intervalMs: number = 2000): void {
  if (typeof window === 'undefined') return;
  if (monitorId !== null) return;
  try {
    refreshGate();
  } catch {
    /* first evaluation must never break startup */
  }
  monitorId = setInterval(() => {
    try {
      refreshGate();
    } catch {
      /* a failed tick must never kill the monitor */
    }
  }, intervalMs);
}

export { CLOCK_GATE_EVENT, CLOCK_LOGOUT_EVENT };

/**
 * Signal the app shell to sign the current user out NOW (called when a
 * Save/Print checkout is attempted under a manipulated OS clock). The App
 * shell owns the session, so POS/Login/Admin request it via this event.
 */
export function signalClockLogout(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CLOCK_LOGOUT_EVENT));
    }
  } catch {
    /* non-DOM environment — nothing to sign out */
  }
}
