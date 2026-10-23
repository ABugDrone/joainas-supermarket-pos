import { useEffect, useState } from 'react';
import { getLastGate, CLOCK_GATE_EVENT, type ClockGate } from '../utils/trustedTime';

const FALLBACK_GATE: ClockGate = {
  ok: true,
  reason: '',
  lastGoodMs: 0,
  nowMs: Date.now(),
  forwardJump: false,
};

/**
 * Live trusted-clock verdict. Updates within seconds when the OS clock is
 * moved — no refresh needed. Safe to call during render (cheap, synchronous).
 */
export function useClockGate(): ClockGate {
  const [gate, setGate] = useState<ClockGate>(() => {
    try {
      return getLastGate();
    } catch {
      return { ...FALLBACK_GATE, nowMs: Date.now() };
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        setGate((e as CustomEvent<ClockGate>).detail);
      } catch {
        /* malformed event — keep the previous verdict */
      }
    };
    window.addEventListener(CLOCK_GATE_EVENT, handler);
    try {
      setGate(getLastGate());
    } catch {
      /* keep the initial verdict */
    }
    return () => window.removeEventListener(CLOCK_GATE_EVENT, handler);
  }, []);

  return gate;
}
