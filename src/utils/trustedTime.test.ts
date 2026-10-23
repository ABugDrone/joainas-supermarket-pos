// v1.5.1 trusted-clock tests: rollback detection, tolerance, sale
// validation, monotonic sequence, and the ADMIN re-anchor hatch.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkWallClock,
  validateNewSale,
  advanceForSale,
  reanchor,
  touchClock,
  getAnchor,
  setAnchorForTests,
  localDayOf,
  refreshGate,
  getLastGate,
  getEffectiveGate,
  validateStartupTime,
  acceptStartupTime,
  reportStartupTamper,
  clearStartupTamperForTests,
  probeLocalPersistence,
  startClockMonitor,
  signalClockLogout,
  CLOCK_LOGOUT_EVENT,
  ROLLBACK_TOLERANCE_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  FORWARD_JUMP_MS,
} from './trustedTime';

const HOUR = 3600 * 1000;
const NOW = new Date('2026-09-18T10:00:00+01:00').getTime();

beforeEach(() => {
  localStorage.clear();
  setAnchorForTests({ lastSeenWallMs: 0, saleSeq: 0 });
  clearStartupTamperForTests();
});

describe('checkWallClock', () => {
  it('allows everything when no anchor exists yet (first ever launch)', () => {
    const g = checkWallClock(NOW, { lastSeenWallMs: 0, saleSeq: 0 });
    expect(g.ok).toBe(true);
  });

  it('blocks a backwards move beyond tolerance', () => {
    const anchor = { lastSeenWallMs: NOW, saleSeq: 3 };
    const g = checkWallClock(NOW - CLOCK_SKEW_TOLERANCE_MS - 1000, anchor);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/backwards/i);
  });

  it('allows a forwards move beyond tolerance (normal shutdown/downtime)', () => {
    const anchor = { lastSeenWallMs: NOW, saleSeq: 3 };
    const g = checkWallClock(NOW + CLOCK_SKEW_TOLERANCE_MS + 1000, anchor);
    expect(g.ok).toBe(true);
    expect(g.forwardJump).toBe(false);
  });

  it('allows a multi-day forward gap but flags it for the audit trail', () => {
    const anchor = { lastSeenWallMs: NOW, saleSeq: 3 };
    const g = checkWallClock(NOW + 2 * 24 * HOUR, anchor);
    expect(g.ok).toBe(true);
    expect(g.forwardJump).toBe(true);
    expect(g.lastGoodMs).toBe(NOW);
  });

  it('a long shutdown then restart is never treated as tampering', () => {
    // Anchor last advanced on Friday; shop reopens Monday morning.
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    const monday = NOW + 3 * 24 * HOUR;
    expect(checkWallClock(monday, getAnchor()).ok).toBe(true);
    expect(refreshGate(monday).ok).toBe(true);
    // Healthy forward time advances the high-water mark.
    expect(getAnchor().lastSeenWallMs).toBe(monday);
  });

  it('allows small moves either way (NTP, DST, seconds-level fixes)', () => {
    const anchor = { lastSeenWallMs: NOW, saleSeq: 3 };
    expect(checkWallClock(NOW - 60 * 1000, anchor).ok).toBe(true);
    expect(checkWallClock(NOW + 10 * 60 * 1000, anchor).ok).toBe(true);
  });

  it('catches the classic scam: forward jump, sale, then restore old date', () => {
    // Shop moves clock +2 days and sells (anchor rises to the fake time).
    const fakeNow = NOW + 2 * 24 * HOUR;
    touchClock(fakeNow);
    advanceForSale(fakeNow);
    // Then restores the true date — must BLOCK.
    const g = checkWallClock(NOW, getAnchor());
    expect(g.ok).toBe(false);
  });
});

describe('validateNewSale', () => {
  it('accepts a normal same-day sale', () => {
    setAnchorForTests({ lastSeenWallMs: NOW - HOUR, saleSeq: 0 });
    const v = validateNewSale(
      { date: localDayOf(NOW), timestamp: NOW - 60 * 1000 },
      NOW,
      getAnchor()
    );
    expect(v.ok).toBe(true);
  });

  it('rejects a sale dated to another day', () => {
    const v = validateNewSale(
      { date: '2020-01-01', timestamp: NOW },
      NOW,
      { lastSeenWallMs: 0, saleSeq: 0 }
    );
    expect(v.ok).toBe(false);
  });

  it('rejects future and far-past timestamps', () => {
    const day = localDayOf(NOW);
    expect(validateNewSale({ date: day, timestamp: NOW + HOUR }, NOW).ok).toBe(false);
    expect(validateNewSale({ date: day, timestamp: NOW - HOUR }, NOW).ok).toBe(false);
  });

  it('rejects timestamps older than the anchor (backdated insert)', () => {
    const anchor = { lastSeenWallMs: NOW, saleSeq: 5 };
    const v = validateNewSale(
      { date: localDayOf(NOW - ROLLBACK_TOLERANCE_MS - 2000), timestamp: NOW - ROLLBACK_TOLERANCE_MS - 2000 },
      NOW,
      anchor
    );
    expect(v.ok).toBe(false);
  });
});

describe('anchor lifecycle', () => {
  it('advanceForSale raises the high-water mark and bumps the sequence', () => {
    setAnchorForTests({ lastSeenWallMs: NOW - HOUR, saleSeq: 4 });
    const next = advanceForSale(NOW);
    expect(next.lastSeenWallMs).toBe(NOW);
    expect(next.saleSeq).toBe(5);
  });

  it('touchClock never lowers the anchor', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 2 });
    touchClock(NOW - HOUR);
    expect(getAnchor().lastSeenWallMs).toBe(NOW);
    expect(getAnchor().saleSeq).toBe(2);
  });

  it('reanchor accepts the corrected time while keeping the sequence', () => {
    setAnchorForTests({ lastSeenWallMs: NOW + 2 * 24 * HOUR, saleSeq: 7 });
    const next = reanchor(NOW);
    expect(next.lastSeenWallMs).toBe(NOW);
    expect(next.saleSeq).toBe(7);
    expect(checkWallClock(NOW, next).ok).toBe(true);
  });
});

describe('live monitor', () => {
  it('refreshGate reports rollback and broadcasts it on an event', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    let received: unknown = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener('amorims-clock-gate', handler);
    try {
      const g = refreshGate(NOW - CLOCK_SKEW_TOLERANCE_MS - 5000);
      expect(g.ok).toBe(false);
      expect(getLastGate().ok).toBe(false);
      expect(received).toMatchObject({ ok: false });
    } finally {
      window.removeEventListener('amorims-clock-gate', handler);
    }
  });

  it('accepts a forward gap, advances the anchor, then treats a real rollback as tampering', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    expect(refreshGate(NOW + 2 * 24 * HOUR).ok).toBe(true);
    expect(getAnchor().lastSeenWallMs).toBe(NOW + 2 * 24 * HOUR);
    // Going back to the old time is now a genuine backward move.
    expect(refreshGate(NOW).ok).toBe(false);
  });

  it('returning to the true time after a blocked backward jump unblocks too', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    expect(refreshGate(NOW - HOUR).ok).toBe(false);
    expect(refreshGate(NOW).ok).toBe(true);
    expect(getLastGate().ok).toBe(true);
  });

  it('startClockMonitor is a singleton (StrictMode double-mount safe)', () => {
    setAnchorForTests({ lastSeenWallMs: 0, saleSeq: 0 });
    startClockMonitor(5000);
    startClockMonitor(5000);
    expect(getLastGate().ok).toBe(true);
  });

  it('signalClockLogout fires the shell sign-out event', () => {
    let fired = false;
    const handler = () => {
      fired = true;
    };
    window.addEventListener(CLOCK_LOGOUT_EVENT, handler);
    try {
      signalClockLogout();
      expect(fired).toBe(true);
    } finally {
      window.removeEventListener(CLOCK_LOGOUT_EVENT, handler);
    }
  });
});

describe('startup validation latch', () => {
  it('validateStartupTime returns null outside the Tauri runtime (fail-open, never throws)', async () => {
    await expect(validateStartupTime()).resolves.toBeNull();
  });

  it('reportStartupTamper latches a blocking gate over a healthy anchor', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    expect(getEffectiveGate(NOW).ok).toBe(true);
    const g = reportStartupTamper('rollback while closed', NOW - HOUR, NOW);
    expect(g.ok).toBe(false);
    expect(getEffectiveGate(NOW).ok).toBe(false);
    expect(getLastGate().ok).toBe(false);
    expect(refreshGate(NOW).ok).toBe(false);
    // The pure anchor check is untouched — only session readers see the latch.
    expect(checkWallClock(NOW, getAnchor()).ok).toBe(true);
  });

  it('reportStartupTamper broadcasts on the clock-gate event', () => {
    let received: unknown = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener('amorims-clock-gate', handler);
    try {
      reportStartupTamper('rollback while closed', NOW - HOUR, NOW);
      expect(received).toMatchObject({ ok: false, reason: expect.stringMatching(/rollback/) });
    } finally {
      window.removeEventListener('amorims-clock-gate', handler);
    }
  });

  it('monitor ticks cannot clear the latch (no flap until restart)', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 1 });
    reportStartupTamper('rollback while closed', NOW - HOUR, NOW);
    expect(refreshGate(NOW).ok).toBe(false);
    expect(refreshGate(NOW + 2000).ok).toBe(false);
    // Anchor is never raised while the latch holds.
    expect(getAnchor().lastSeenWallMs).toBe(NOW);
  });

  it('a corrected clock + ADMIN verification clears the latch and re-anchors', () => {
    setAnchorForTests({ lastSeenWallMs: NOW, saleSeq: 2 });
    reportStartupTamper('rollback while closed', NOW - 2 * HOUR, NOW - 2 * HOUR);
    expect(getEffectiveGate(NOW).ok).toBe(false);

    // The ADMIN confirms the now-correct clock (what reanchorClock does after
    // its password check): clear the boot latch and accept the current time.
    clearStartupTamperForTests();
    reanchor(NOW);
    expect(getEffectiveGate(NOW).ok).toBe(true);
    expect(getAnchor().lastSeenWallMs).toBe(NOW);
    expect(checkWallClock(NOW, getAnchor()).ok).toBe(true);
  });

  it('acceptStartupTime is a safe no-op outside the Tauri runtime', async () => {
    await expect(acceptStartupTime()).resolves.toBe(false);
  });
});

describe('storage self-test probe', () => {
  it('probeLocalPersistence passes when storage round-trips', () => {
    const mock = window.localStorage as unknown as Record<string, unknown>;
    const orig = { getItem: mock.getItem, setItem: mock.setItem, removeItem: mock.removeItem };
    const store = new Map<string, string>();
    mock.getItem = (k: string) => (store.has(k) ? (store.get(k) as string) : null);
    mock.setItem = (k: string, v: string) => {
      store.set(k, v);
    };
    mock.removeItem = (k: string) => {
      store.delete(k);
    };
    try {
      expect(probeLocalPersistence()).toEqual({ ok: true, reason: '' });
    } finally {
      mock.getItem = orig.getItem;
      mock.setItem = orig.setItem;
      mock.removeItem = orig.removeItem;
    }
  });

  it('probeLocalPersistence fails loud when storage throws', () => {
    const mock = window.localStorage as unknown as Record<string, unknown>;
    const orig = mock.setItem;
    mock.setItem = () => {
      throw new Error('denied');
    };
    try {
      const h = probeLocalPersistence();
      expect(h.ok).toBe(false);
      expect(h.reason).toMatch(/denied/);
    } finally {
      mock.setItem = orig;
    }
  });
});
