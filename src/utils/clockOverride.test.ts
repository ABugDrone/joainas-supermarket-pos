// v2.0.6 FLASHALERT / clock-override store tests.
//
// The persistent alert list (localStorage) must survive logout and restart;
// the runtime override (sessionStorage) only gates auto-logout for the current
// session. Only an ADMIN action clears the persistent list.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addClockOverrideAlert,
  clearClockOverrideAlerts,
  clearClockOverrideSession,
  hasActiveClockOverride,
  hasPendingClockOverrideAlerts,
  loadClockOverrideAlerts,
  loadClockOverrideSession,
  setClockOverrideSession,
  CLOCK_OVERRIDE_EVENT,
  type ClockOverrideAlert,
} from './clockOverride';

const baseAlert = {
  fullName: 'Test Cashier',
  role: 'Cashier' as const,
  loginAt: '2026-10-23T09:00:00.000Z',
  gateReason: 'Clock moved backwards by 2 hours.',
  lastGoodMs: 1000,
  nowMs: 900,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('persistent FLASHALERT list', () => {
  it('adds an alert and persists it across a simulated restart', () => {
    addClockOverrideAlert({ ...baseAlert, username: 'cashier1' });
    expect(loadClockOverrideAlerts()).toHaveLength(1);
    expect(loadClockOverrideAlerts()[0].username).toBe('cashier1');
    expect(hasPendingClockOverrideAlerts()).toBe(true);

    // A restart keeps localStorage but ends sessionStorage.
    clearClockOverrideSession();
    expect(loadClockOverrideAlerts()).toHaveLength(1);
    expect(hasPendingClockOverrideAlerts()).toBe(true);
  });

  it('keeps one entry per username, newest first, and preserves other users', () => {
    addClockOverrideAlert({ ...baseAlert, username: 'cashier1', loginAtMs: 10 });
    addClockOverrideAlert({ ...baseAlert, username: 'cashier2', loginAtMs: 20 });
    addClockOverrideAlert({ ...baseAlert, username: 'cashier1', loginAtMs: 30 });

    const list = loadClockOverrideAlerts();
    expect(list).toHaveLength(2);
    expect(list[0].username).toBe('cashier1');
    expect(list[0].loginAtMs).toBe(30);
    expect(list[1].username).toBe('cashier2');
  });

  it('clears every alert only when explicitly asked (ADMIN action)', () => {
    addClockOverrideAlert({ ...baseAlert, username: 'cashier1' });
    addClockOverrideAlert({ ...baseAlert, username: 'cashier2' });
    clearClockOverrideAlerts();
    expect(loadClockOverrideAlerts()).toEqual([]);
    expect(hasPendingClockOverrideAlerts()).toBe(false);
  });

  it('broadcasts a change event', () => {
    const handler = vi.fn();
    window.addEventListener(CLOCK_OVERRIDE_EVENT, handler);
    try {
      addClockOverrideAlert({ ...baseAlert, username: 'cashier1' });
      expect(handler).toHaveBeenCalled();
    } finally {
      window.removeEventListener(CLOCK_OVERRIDE_EVENT, handler);
    }
  });
});

describe('runtime clock override session', () => {
  it('sets, loads and clears the session override', () => {
    const session = {
      ...baseAlert,
      username: 'cashier1',
      loginAtMs: Date.now(),
    };
    setClockOverrideSession(session);
    expect(hasActiveClockOverride()).toBe(true);
    expect(loadClockOverrideSession()?.username).toBe('cashier1');

    clearClockOverrideSession();
    expect(hasActiveClockOverride()).toBe(false);
    expect(loadClockOverrideSession()).toBeNull();
  });

  it('ignores a malformed stored session', () => {
    sessionStorage.setItem('joainas_clock_override_session_v1', '{bad json');
    expect(loadClockOverrideSession()).toBeNull();
  });

  it('does not confuse an alert with an active session', () => {
    addClockOverrideAlert({ ...baseAlert, username: 'cashier1' });
    expect(hasPendingClockOverrideAlerts()).toBe(true);
    expect(hasActiveClockOverride()).toBe(false);
  });
});

describe('alert shape', () => {
  it('fills loginAtMs when omitted', () => {
    const [entry] = addClockOverrideAlert({ ...baseAlert, username: 'cashier1' });
    expect(entry.loginAtMs).toBeGreaterThan(0);
    expect((entry as ClockOverrideAlert).role).toBe('Cashier');
  });
});
