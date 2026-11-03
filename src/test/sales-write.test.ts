import { describe, expect, test } from 'vitest';
import { saleItemRows } from '../utils/db';
import type { SaleRecord } from '../types';

const sale = (overrides: Record<string, unknown> = {}): SaleRecord =>
  ({
    id: 'sale-1',
    receiptNo: 'RCT-TEST-001',
    items: [],
    subtotal: 0,
    totalAmount: 0,
    advancePayment: 0,
    balanceDue: 0,
    paymentMethod: 'Cash',
    priceType: 'retail',
    cashier: 'tester',
    date: '2026-11-04',
    time: '10:00:00',
    timestamp: 0,
    pointsEarned: 0,
    ...overrides,
  } as SaleRecord);

const item = (overrides: Record<string, unknown> = {}) => ({
  product: { id: 'p1', name: 'Milk', barcode: '', category: 'Food', unit: 'piece', costPrice: 1, retailPrice: 2, wholesalePrice: 2, stockQty: 10, reorderLevel: 1 },
  quantity: 2,
  priceType: 'retail',
  rate: 500,
  amount: 1000,
  ...overrides,
});

describe('saleItemRows — must never throw', () => {
  test('a receipt with no items array produces no rows', () => {
    const rows = saleItemRows([sale({ items: undefined })]);
    expect(rows).toEqual([]);
  });

  test('a receipt with null items produces no rows', () => {
    const rows = saleItemRows([sale({ items: null })]);
    expect(rows).toEqual([]);
  });

  test('null / undefined entries in the sale list are ignored', () => {
    const rows = saleItemRows([null as any, undefined as any, sale({ items: [item()] })]);
    expect(rows).toHaveLength(1);
  });

  test('a malformed item is skipped without aborting the good lines', () => {
    const rows = saleItemRows([
      sale({
        items: [
          item(),
          { quantity: 1, priceType: 'retail', rate: 10, amount: 10 }, // no product
          { product: { id: 'p2' }, quantity: 1, priceType: 'retail', rate: 10, amount: 10 }, // no name
          item({ product: { id: 'p3', name: 'Bread' } }),
        ],
      }),
    ]);
    // An item with an id but no name is kept with an empty name (the column is
    // NOT NULL, and losing the line would lose the sale detail entirely).
    expect(rows.map((r) => r.productId)).toEqual(['p1', 'p2', 'p3']);
    expect(rows[1].productName).toBe('');
  });

  test('non-finite quantity / rate / amount rows are skipped', () => {
    const rows = saleItemRows([
      sale({
        items: [
          item(),
          item({ product: { id: 'p2', name: 'Bad' }, amount: Number.NaN }),
          item({ product: { id: 'p3', name: 'Bad2' }, rate: Number.POSITIVE_INFINITY }),
        ],
      }),
    ]);
    expect(rows.map((r) => r.productId)).toEqual(['p1']);
  });

  test('an unexpected price type is stored as retail (column CHECK constraint)', () => {
    const rows = saleItemRows([sale({ items: [item({ priceType: 'bulk' as any })] })]);
    expect(rows[0].priceType).toBe('retail');
    expect(saleItemRows([sale({ items: [item({ priceType: 'wholesale' })] })])[0].priceType).toBe('wholesale');
  });

  test('string numbers are coerced, not rejected', () => {
    const rows = saleItemRows([
      sale({ items: [item({ quantity: '3', rate: '250.5', amount: '751.5' })] }),
    ]);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].rate).toBe(250.5);
    expect(rows[0].amount).toBe(751.5);
  });

  test('the same product cannot appear twice on one receipt', () => {
    const rows = saleItemRows([sale({ items: [item(), item({ rate: 600, amount: 1200 })] })]);
    expect(rows).toHaveLength(1);
  });

  test('a normal receipt maps every column', () => {
    const rows = saleItemRows([sale({ items: [item()] })]);
    expect(rows[0]).toMatchObject({
      id: 'item-sale-1-p1',
      saleId: 'sale-1',
      productId: 'p1',
      productName: 'Milk',
      quantity: 2,
      priceType: 'retail',
      rate: 500,
      amount: 1000,
    });
  });

  test('empty / missing sale ids are skipped', () => {
    const rows = saleItemRows([
      sale({ id: '', items: [item()] }),
      sale({ id: 'sale-2', items: [item()] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].saleId).toBe('sale-2');
  });
});
