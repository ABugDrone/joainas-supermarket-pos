import { useEffect, useState } from 'react';
import { getCurrency, CURRENCY_EVENT, type CurrencyInfo } from '../utils/currency';

/**
 * Live shop currency. Updates within the same tick when the admin changes
 * the currency — no refresh needed. Safe to call during render (cheap,
 * synchronous).
 */
export function useCurrency(): CurrencyInfo {
  const [cur, setCur] = useState<CurrencyInfo>(() => {
    try {
      return getCurrency();
    } catch {
      return { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 2 };
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        setCur((e as CustomEvent<CurrencyInfo>).detail);
      } catch {
        /* malformed event — keep the previous currency */
      }
    };
    window.addEventListener(CURRENCY_EVENT, handler);
    return () => window.removeEventListener(CURRENCY_EVENT, handler);
  }, []);

  return cur;
}
