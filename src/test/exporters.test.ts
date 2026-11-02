import { describe, expect, test } from 'vitest';
import type { Product } from '../types';
import {
  buildDataTable,
  normalizeImportTable,
  parseCsv,
  planProductImport,
  type ExportPayload,
} from '../utils/exporters';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '111',
  name: 'Rice',
  category: 'Groceries',
  kind: 'product',
  unit: 'bag',
  costPrice: 100,
  retailPrice: 150,
  wholesalePrice: 150,
  minPrice: 120,
  stockQty: 10,
  reorderLevel: 5,
  ...overrides,
});

const payload = (products: Product[]): ExportPayload => ({
  products,
  sales: [],
  customers: [],
  expenditures: [],
  categories: [],
});

const IMPORT_HEADERS = [
  'S/N',
  'Barcode',
  'Product Name',
  'Category',
  'Subcategory',
  'Cost Price',
  'Min Price',
  'Max Price',
  'Available Qty',
  'Unit',
];

const importTable = (rows: string[][]) =>
  normalizeImportTable([IMPORT_HEADERS, ...rows.map((r, i) => [String(i + 1), ...r])]);

describe('inventory export', () => {
  test('uses the agreed columns and writes NULL qty for services/edibles', () => {
    const service = makeProduct({
      id: 'p2',
      barcode: '222',
      name: 'Delivery',
      category: 'Services',
      kind: 'service',
      unit: 'piece',
      stockQty: 0,
    });
    const table = buildDataTable('products', payload([makeProduct(), service]));

    expect(table.columns).toEqual([
      'S/N',
      'Barcode',
      'Product Name',
      'Category',
      'Subcategory',
      'Cost Price',
      'Min Price',
      'Max Price',
      'Available Qty',
      'Unit',
      'Reorder Level',
    ]);
    expect(table.rows[0][8]).toBe(10);
    expect(table.rows[1][8]).toBe('NULL');
  });

  test('CSV parser round-trips quoted cells', () => {
    const rows = parseCsv('"name","note"\r\n"Rice, bag","say ""hi"""');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Rice, bag', 'say "hi"'],
    ]);
  });
});

describe('inventory import', () => {
  test('add mode adds to existing stock', () => {
    const plan = planProductImport(
      importTable([['111', 'Rice', 'Groceries', 'Groceries', '100', '120', '150', '5', 'bag']]),
      [makeProduct()],
      'add',
      'restock.csv'
    );
    expect(plan.products.find((p) => p.barcode === '111')!.stockQty).toBe(15);
    expect(plan.counts.update).toBe(1);
  });

  test('NULL quantity leaves stock untouched', () => {
    const plan = planProductImport(
      importTable([['111', 'Rice', 'Groceries', 'Groceries', '100', '120', '150', 'NULL', 'bag']]),
      [makeProduct()],
      'add',
      'prices.csv'
    );
    expect(plan.products.find((p) => p.barcode === '111')!.stockQty).toBe(10);
  });

  test('a bad price range rejects only that row', () => {
    const plan = planProductImport(
      importTable([['111', 'Rice', 'Groceries', 'Groceries', '100', '200', '150', '5', 'bag']]),
      [makeProduct()],
      'add',
      'bad.csv'
    );
    expect(plan.counts.error).toBe(1);
    expect(plan.products.find((p) => p.barcode === '111')!.stockQty).toBe(10);
  });

  test('duplicate barcode merges to the last row and does not double-add stock', () => {
    const plan = planProductImport(
      importTable([
        ['111', 'Rice A', 'Groceries', 'Groceries', '100', '120', '150', '5', 'bag'],
        ['111', 'Rice B', 'Groceries', 'Groceries', '100', '120', '150', '7', 'bag'],
      ]),
      [makeProduct()],
      'add',
      'dupe.csv'
    );
    const product = plan.products.find((p) => p.barcode === '111')!;
    expect(product.name).toBe('Rice B');
    expect(product.stockQty).toBe(17); // 10 + 7, not 10 + 5 + 7
    expect(plan.warnings.some((w) => w.includes('last row wins'))).toBe(true);
  });

  test('services never change stock', () => {
    const service = makeProduct({
      id: 'p2',
      barcode: '222',
      name: 'Delivery',
      category: 'Services',
      kind: 'service',
      unit: 'piece',
      stockQty: 0,
    });
    const plan = planProductImport(
      importTable([['222', 'Delivery', 'Services', 'Services', '0', '0', '100', '50', 'piece']]),
      [service],
      'add',
      'services.csv'
    );
    expect(plan.products.find((p) => p.barcode === '222')!.stockQty).toBe(0);
  });

  test('a missing barcode is auto-numbered', () => {
    const plan = planProductImport(
      importTable([['', 'New Item', 'Groceries', 'Groceries', '10', '20', '30', '4', 'piece']]),
      [],
      'add',
      'new.csv'
    );
    const created = plan.products.find((p) => p.name === 'New Item')!;
    expect(created.barcode.startsWith('AUTO-')).toBe(true);
    expect(created.stockQty).toBe(4);
  });
});
