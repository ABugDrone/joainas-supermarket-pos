import { describe, expect, test } from 'vitest';
import { CartItem, Product, SaleRecord } from '../types';
import { buildSaleDisplay } from '../utils/saleLines';
import { buildDataTable, ExportPayload } from '../utils/exporters';
import { saleItemRows } from '../utils/db';

// ===========================================================================
// v2.0.9 compatibility guard for sales written by older releases.
//
// v2.0.7 and earlier: a sale item had only quantity + rate + amount, and all
// carton/piece columns read back as 0 from SQLite.
// v2.0.8: the same item also carries cartonQty / pieceQty / cartonRate /
// pieceRate / piecesPerCarton / saleMode.
// v2.0.9 must only change PRESENTATION — never the stored numbers, totals or
// the item objects themselves.
// ===========================================================================

const legacyProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'old-product',
  barcode: '',
  name: 'Bottled Water',
  category: 'Drinks',
  unit: 'piece',
  costPrice: 300,
  retailPrice: 500,
  wholesalePrice: 450,
  stockQty: 12,
  reorderLevel: 2,
  ...overrides,
});

/** Exactly the shape mapSale() produces for a pre-v2.0.8 SQLite row. */
const oldDbItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  product: legacyProduct(),
  quantity: 4,
  priceType: 'retail',
  rate: 500,
  amount: 2000,
  cartonQty: 0,
  pieceQty: 0,
  piecesPerCarton: 0,
  cartonRate: 0,
  pieceRate: 0,
  saleMode: undefined,
  saleUnitLabel: undefined,
  ...overrides,
});

const oldSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'sale-old',
  receiptNo: 'R-100',
  date: '2026-05-03',
  time: '09:15:00',
  timestamp: Date.parse('2026-05-03T09:15:00'),
  items: [oldDbItem()],
  subtotal: 2000,
  totalAmount: 2000,
  advancePayment: 2000,
  balanceDue: 0,
  paymentMethod: 'Cash',
  priceType: 'retail',
  cashier: 'tester',
  pointsEarned: 0,
  ...overrides,
});

describe('v2.0.9 keeps pre-v2.0.8 sales records intact', () => {
  test('old DB-shaped item renders as one plain row with unchanged numbers', () => {
    const item = oldDbItem();
    const before = JSON.stringify(item);
    const display = buildSaleDisplay([item], { code: 'NGN' });

    expect(display.lines).toHaveLength(1);
    const line = display.lines[0];
    expect(line.kind).toBe('plain');
    expect(line.qty).toBe(item.quantity);
    expect(line.rate).toBe(item.rate);
    expect(line.amount).toBe(item.amount);
    expect(line.noteLines).toHaveLength(0);
    expect(display.hasGroups).toBe(false);
    expect(display.pieceStartIndex).toBe(-1);
    expect(display.unitSummary).toBe('4');
    expect(display.linesTotal).toBe(item.amount);
    // Presentation must not mutate the stored receipt object.
    expect(JSON.stringify(item)).toBe(before);
  });

  test('old carton-labelled catalogue without split data still shows plain pieces', () => {
    // A restored/backup product might carry piecesPerCarton without any
    // sale-level split fields. It must not invent carton rows for an old sale.
    const item = oldDbItem({
      product: legacyProduct({ unit: 'carton', piecesPerCarton: 12 }),
    });
    const display = buildSaleDisplay([item], { code: 'NGN' });
    expect(display.lines).toHaveLength(1);
    expect(display.lines[0].kind).toBe('plain');
    expect(display.lines[0].qty).toBe(4);
    expect(display.lines[0].amount).toBe(2000);
    expect(display.lines[0].noteLines).toHaveLength(0);
  });

  test('a v2.0.8 split sale still totals exactly the same after being split', () => {
    const item: CartItem = {
      product: legacyProduct({ unit: 'carton', piecesPerCarton: 12 }),
      quantity: 30,
      priceType: 'retail',
      rate: 130000 / 30,
      amount: 130000,
      cartonQty: 2,
      pieceQty: 6,
      piecesPerCarton: 12,
      cartonRate: 50000,
      pieceRate: 5000,
      saleMode: 'both',
      saleUnitLabel: '2 cartons + 6 pieces',
    };
    const before = JSON.stringify(item);
    const display = buildSaleDisplay([item], { code: 'NGN' });
    expect(display.lines.map((l) => l.kind)).toEqual(['box', 'piece']);
    expect(display.linesTotal).toBe(item.amount);
    expect(display.lines[0].amount + display.lines[1].amount).toBe(130000);
    expect(JSON.stringify(item)).toBe(before);
  });

  test('sales export keeps old Qty/Rate/Amount values, adding only the Sale Unit column', () => {
    const sale = oldSale();
    const data: ExportPayload = {
      products: [],
      sales: [sale],
      customers: [],
      expenditures: [],
      categories: [],
    };
    const table = buildDataTable('sales', data);
    const header = table.columns.indexOf('Sale Unit');
    expect(header).toBeGreaterThan(-1);
    const row = table.rows[0];
    expect(row[table.columns.indexOf('Product')]).toBe('Bottled Water');
    expect(row[table.columns.indexOf('Qty')]).toBe(4);
    expect(row[table.columns.indexOf('Rate')]).toBe(500);
    expect(row[table.columns.indexOf('Amount')]).toBe(2000);
    expect(row[table.columns.indexOf('Total')]).toBe(2000);
    expect(String(row[header])).toContain('4 pieces');
  });

  test('the real sale-item writer still writes untouched legacy numbers', () => {
    const sale = oldSale();
    const rows = saleItemRows([sale]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(4);
    expect(rows[0].rate).toBe(500);
    expect(rows[0].amount).toBe(2000);
    expect(rows[0].cartonQty).toBe(0);
    expect(rows[0].pieceQty).toBe(0);
    expect(rows[0].piecesPerCarton).toBe(0);
  });
});
