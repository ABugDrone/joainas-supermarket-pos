import { describe, expect, test } from 'vitest';
import { Product } from '../types';
import {
  NO_CEILING,
  formatRange,
  formatSaleRate,
  getCeilingFor,
  getDefaultRate,
  getFloorFor,
  validateUnitPrice,
} from '../utils/pricing';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '1001',
  name: 'Test Product',
  category: 'Groceries',
  kind: 'product',
  unit: 'piece',
  costPrice: 100,
  retailPrice: 0,
  wholesalePrice: 0,
  stockQty: 10,
  reorderLevel: 2,
  ...overrides,
});

describe('price display modes', () => {
  test('max-only shows a plain maximum and is discountable', () => {
    const p = product({ retailPrice: 5000 });
    expect(formatRange(p)).toBe('₦5,000.00');
    expect(getCeilingFor(p, 1)).toBe(5000);
    expect(getFloorFor(p, 1)).toBe(0);
    expect(getDefaultRate(p, 1)).toBe(5000);
  });

  test('min-only shows a plus and has an open ceiling', () => {
    const p = product({ minPrice: 3000 });
    expect(formatRange(p)).toBe('₦3,000.00+');
    expect(getFloorFor(p, 1)).toBe(3000);
    expect(getCeilingFor(p, 1)).toBe(NO_CEILING);
    expect(getDefaultRate(p, 1)).toBe(3000);
  });

  test('both prices show a range and enforce both bounds', () => {
    const p = product({ minPrice: 3000, retailPrice: 5000 });
    expect(formatRange(p)).toBe('₦3,000.00 – ₦5,000.00');
    expect(getFloorFor(p, 1)).toBe(3000);
    expect(getCeilingFor(p, 1)).toBe(5000);
  });

  test('equal min and max display as a single maximum', () => {
    const p = product({ minPrice: 5000, retailPrice: 5000 });
    expect(formatRange(p)).toBe('₦5,000.00');
  });

  test('tiers take precedence over single-price display', () => {
    const p = product({
      retailPrice: 5000,
      priceTiers: [
        { id: 't1', minQty: 1, maxQty: 5, ceiling: 5000, floor: 4000 },
        { id: 't2', minQty: 6, maxQty: null, ceiling: 4500, floor: 3500 },
      ],
    });
    expect(formatRange(p)).toBe('2 tiers');
    expect(getCeilingFor(p, 6)).toBe(4500);
    expect(getFloorFor(p, 6)).toBe(3500);
  });
});

describe('price validation', () => {
  test('rejects prices above a real ceiling and below the floor', () => {
    expect(validateUnitPrice(6000, 5000, 3000)).toMatch(/exceed/i);
    expect(validateUnitPrice(2000, 5000, 3000)).toMatch(/below/i);
    expect(validateUnitPrice(4000, 5000, 3000)).toBeNull();
  });

  test('NO_CEILING means no upper bound', () => {
    expect(validateUnitPrice(50_000_000, NO_CEILING, 3000)).toBeNull();
  });

  test('sold prices are shown plainly, never as a range', () => {
    expect(formatSaleRate(4200, 5000)).toBe('₦4,200.00');
  });
});
