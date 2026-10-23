import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { Product } from '../types';
import {
  isLegacyBackup,
  isValidBackupPayload,
  mergeBackupProducts,
  normalizeLegacyBackup,
} from '../utils/backup';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: 'B1',
  name: 'Rice',
  category: 'Groceries',
  kind: 'product',
  unit: 'bag',
  costPrice: 1000,
  retailPrice: 5000,
  wholesalePrice: 4800,
  stockQty: 10,
  reorderLevel: 2,
  ...overrides,
});

const legacyPayload = () => ({
  app: 'DIRMS StoreBox PRO',
  version: '1.4.8',
  products: [
    product({ id: 'p1', minPrice: 5000, retailPrice: 5000 }),
    product({
      id: 'p2',
      name: 'Home Delivery',
      category: 'Services',
      barcode: 'B2',
      kind: undefined,
      minPrice: 1000,
      retailPrice: 1000,
      unit: 'job',
    }),
    product({ id: 'p3', name: 'Gift Pack', category: 'Groceries', barcode: 'B3', minPrice: 2000, retailPrice: 3000 }),
  ],
  categories: [
    { id: 'c1', name: 'Groceries', color: '#14b8a6' },
    { id: 'c2', name: 'Services', color: '#6366f1' },
  ],
  customers: [],
  sales: [],
  users: [],
});

describe('legacy detection', () => {
  test('2.0.5 Joainas backups are untouched', () => {
    const current = {
      appName: 'Joainas Mart',
      appVersion: '2.0.5',
      products: [product({ kind: 'service', minPrice: 1000, retailPrice: 2000 })],
      customers: [],
      sales: [],
    };
    expect(isLegacyBackup(current)).toBe(false);
    expect(normalizeLegacyBackup(current)).toBe(current);
  });

  test('old versions and old app names are legacy', () => {
    expect(isLegacyBackup({ version: '2.0.4', app: 'Joainas Mart' })).toBe(true);
    expect(isLegacyBackup({ version: '2.0.5', app: 'DIRMS StoreBox PRO' })).toBe(true);
    expect(isLegacyBackup({})).toBe(true);
  });
});

describe('legacy normalization', () => {
  test('every item becomes a Product under a Product category', () => {
    const normalized = normalizeLegacyBackup(legacyPayload());
    expect(normalized.products.every((p: Product) => p.kind === 'product')).toBe(true);
    expect(normalized.categories.every((c: any) => c.kind === 'product' && c.parentRoot === 'Products')).toBe(true);
    const delivery = normalized.products.find((p: Product) => p.id === 'p2')!;
    expect(delivery.category).toBe('Services (Legacy)');
  });

  test('single legacy prices become maximums', () => {
    const normalized = normalizeLegacyBackup(legacyPayload());
    const rice = normalized.products.find((p: Product) => p.id === 'p1')!;
    expect(rice.retailPrice).toBe(5000);
    expect(rice.minPrice).toBeUndefined();
  });

  test('an explicit min < max range is preserved', () => {
    const normalized = normalizeLegacyBackup(legacyPayload());
    const gift = normalized.products.find((p: Product) => p.id === 'p3')!;
    expect(gift.minPrice).toBe(2000);
    expect(gift.retailPrice).toBe(3000);
  });

  test('numeric prices survive as numbers', () => {
    const normalized = normalizeLegacyBackup(legacyPayload());
    expect(typeof normalized.products[0].retailPrice).toBe('number');
    expect(typeof normalized.products[0].stockQty).toBe('number');
  });
});

describe('backup validation', () => {
  test('requires a real numeric stockQty on every product', () => {
    const base = { products: [product()], customers: [], sales: [] };
    expect(isValidBackupPayload(base)).toBe(true);
    expect(isValidBackupPayload({ ...base, products: [{ ...product(), stockQty: '5' }] })).toBe(false);
    expect(
      isValidBackupPayload({ ...base, products: [{ ...product(), stockQty: undefined }] })
    ).toBe(false);
    expect(isValidBackupPayload({ ...base, products: [{ ...product(), stockQty: NaN }] })).toBe(false);
  });
});

describe('backup merging', () => {
  test('dedupes by ID and barcode and never changes live stock', () => {
    const live = [product({ id: 'p1', barcode: 'B1', stockQty: 7 }), product({ id: 'p2', barcode: 'B2', stockQty: 3 })];
    const incoming = [
      product({ id: 'p1', barcode: 'B1', stockQty: 999 }),
      product({ id: 'p3', barcode: 'B3', stockQty: 11 }),
      product({ id: 'p4', barcode: 'B1', stockQty: 50 }),
      product({ id: 'p3', barcode: 'B3', stockQty: 11 }),
    ];
    const merged = mergeBackupProducts(live, incoming);
    expect(merged.added.map((p) => p.id)).toEqual(['p3']);
    expect(merged.products.find((p) => p.id === 'p1')!.stockQty).toBe(7);
    expect(merged.products.find((p) => p.id === 'p2')!.stockQty).toBe(3);
  });

  test('property: five or more backups never corrupt live stock', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            barcode: fc.string({ minLength: 1, maxLength: 8 }),
            stock: fc.integer({ min: 0, max: 500 }),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 6, maxLength: 10 }),
        (liveSeeds, backupStocks) => {
          const seen = new Set<string>();
          const live: Product[] = [];
          for (const seed of liveSeeds) {
            if (seen.has(seed.id)) continue;
            seen.add(seed.id);
            live.push(product({ id: seed.id, barcode: seed.barcode, stockQty: seed.stock }));
          }
          const original = new Map(live.map((p) => [p.id, p.stockQty]));

          let merged = live;
          // Process more than five backups, each touching existing IDs.
          for (let i = 0; i < backupStocks.length; i++) {
            const incoming = live.map((p, idx) =>
              product({
                id: p.id,
                barcode: p.barcode,
                stockQty: backupStocks[(i + idx) % backupStocks.length],
              })
            );
            incoming.push(product({ id: `new-${i}`, barcode: `NB-${i}`, stockQty: backupStocks[i] }));
            merged = mergeBackupProducts(merged, incoming).products;
          }

          return [...original].every(([id, stock]) => merged.find((p) => p.id === id)?.stockQty === stock);
        }
      )
    );
  });
});
