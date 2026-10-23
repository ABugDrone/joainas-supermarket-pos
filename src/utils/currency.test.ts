// v1.6.0 currency tests: defaults, formatting, decimals, ASCII fallback.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  getCurrency,
  getCurrencyCode,
  resolveCurrency,
  setCurrency,
  formatMoney,
  moneyAscii,
  getCurrencySymbol,
  CURRENCY_EVENT,
} from './currency';

beforeEach(async () => {
  localStorage.clear();
  await setCurrency('NGN');
});

describe('currency table', () => {
  it('defaults to NGN first', () => {
    expect(DEFAULT_CURRENCY_CODE).toBe('NGN');
    expect(CURRENCIES[0]?.code).toBe('NGN');
    expect(CURRENCIES.length).toBeGreaterThan(150);
  });

  it('covers major world currencies with correct decimals', () => {
    const byCode = (c: string) => CURRENCIES.find((x) => x.code === c);
    expect(byCode('USD')?.symbol).toBe('$');
    expect(byCode('EUR')?.symbol).toBe('€');
    expect(byCode('GBP')?.symbol).toBe('£');
    expect(byCode('JPY')?.decimals).toBe(0);
    expect(byCode('KWD')?.decimals).toBe(3);
    expect(byCode('XOF')?.decimals).toBe(0);
    expect(byCode('GHS')?.symbol).toBe('₵');
  });
});

describe('formatting', () => {
  it('formats NGN like the old formatNaira', () => {
    expect(formatMoney(1500)).toBe('₦1,500.00');
    expect(formatMoney(-250)).toBe('-₦250.00');
    expect(formatMoney(0)).toBe('₦0.00');
  });

  it('uses per-currency decimals', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(5.5, 'KWD')).toBe('KD5.500');
    expect(formatMoney(99.99, 'USD')).toBe('$99.99');
  });

  it('moneyAscii is printer-safe (code, no glyphs)', () => {
    expect(moneyAscii(1500)).toBe('NGN 1,500.00');
    expect(moneyAscii(1500, 'EUR')).toBe('EUR 1,500.00');
    expect(moneyAscii(-75, 'USD')).toBe('-USD 75.00');
  });

  it('unknown codes fall back to current, then NGN', () => {
    expect(resolveCurrency('XXQ').code).toBe('NGN');
    expect(getCurrencySymbol('XXQ')).toBe('₦');
    expect(formatMoney(10, null)).toBe('₦10.00');
  });
});

describe('setting', () => {
  it('setCurrency persists and broadcasts', async () => {
    let received: unknown = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener(CURRENCY_EVENT, handler);
    try {
      const cur = await setCurrency('USD');
      expect(cur.code).toBe('USD');
      expect(getCurrencyCode()).toBe('USD');
      expect(getCurrency().symbol).toBe('$');
      expect(formatMoney(20)).toBe('$20.00');
      expect(received).toMatchObject({ code: 'USD' });
    } finally {
      window.removeEventListener(CURRENCY_EVENT, handler);
    }
  });

  it('rejects unknown codes back to NGN', async () => {
    const cur = await setCurrency('NOPE');
    expect(cur.code).toBe('NGN');
    expect(getCurrencyCode()).toBe('NGN');
  });
});
