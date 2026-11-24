import { describe, expect, test } from 'vitest';
import { CartItem, SaleRecord } from '../types';
import {
  clampPercent,
  computeCartFinancials,
  discountSummaryRows,
  lineDiscount,
  roundMoney,
  saleFinancials,
  withLineDiscount,
} from '../utils/discounts';
import { buildSaleDisplay } from '../utils/saleLines';

const product = (name = 'Widget') => ({
  id: 'p-1',
  barcode: '',
  name,
  category: 'Goods',
  unit: 'piece' as const,
  costPrice: 0,
  retailPrice: 1000,
  wholesalePrice: 1000,
  stockQty: 100,
  reorderLevel: 0,
});

const item = (amount: number, opts: Partial<CartItem> = {}): CartItem => ({
  product: product(),
  quantity: 1,
  priceType: 'retail',
  rate: amount,
  amount,
  ...opts,
});

const sale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'sale-1',
  receiptNo: 'RCT-1',
  items: [item(1000), item(2000)],
  subtotal: 3000,
  totalAmount: 3000,
  advancePayment: 3000,
  balanceDue: 0,
  paymentMethod: 'Cash',
  priceType: 'retail',
  pointsEarned: 0,
  cashier: 'tester',
  date: '2026-11-24',
  time: '12:00:00',
  timestamp: Date.now(),
  ...overrides,
});

describe('v2.1.0 percentage discounts / seasonal coupons', () => {
  test('no discount keeps the gross total and a single TOTAL row', () => {
    const f = computeCartFinancials({ items: [item(1000), item(2000)], billPercent: 0, cashDiscount: 0 });
    expect(f.grossSubtotal).toBe(3000);
    expect(f.totalAmount).toBe(3000);
    expect(f.totalDiscount).toBe(0);
    expect(f.hasAnyDiscount).toBe(false);
    expect(discountSummaryRows(f)).toEqual([
      { kind: 'net', label: 'TOTAL', amount: 3000, negative: false },
    ]);
  });

  test('cash discount alone still behaves like v2.0.8', () => {
    const f = computeCartFinancials({ items: [item(1000), item(2000)], billPercent: 0, cashDiscount: 500 });
    expect(f.cashDiscount).toBe(500);
    expect(f.totalAmount).toBe(2500);
    const rows = discountSummaryRows(f);
    expect(rows.map((r) => r.kind)).toEqual(['gross', 'cash', 'saved', 'net']);
    expect(rows[1].amount).toBe(500);
  });

  test('a product percentage is shown as an actual deduction on that product', () => {
    const discounted = withLineDiscount(item(1000), 10, 'FESTIVE');
    expect(discounted.discountPercent).toBe(10);
    expect(discounted.lineDiscountAmount).toBe(100);
    expect(discounted.netAmount).toBe(900);
    const d = lineDiscount(discounted);
    expect(d.couponCode).toBe('FESTIVE');
    expect(d.amount).toBe(100);
    expect(d.net).toBe(900);

    const f = computeCartFinancials({ items: [discounted, item(2000)], billPercent: 0, cashDiscount: 0 });
    expect(f.itemDiscountTotal).toBe(100);
    expect(f.totalAmount).toBe(2900);
    expect(f.lineDiscounts).toHaveLength(1);
  });

  test('a whole-bill coupon rate is applied to the already-discounted lines', () => {
    const f = computeCartFinancials({
      items: [withLineDiscount(item(1000), 10), item(2000)],
      billPercent: 5,
      billCouponCode: 'XMAS10',
      cashDiscount: 200,
    });
    // 3000 gross - 100 product % = 2900; 5% of 2900 = 145; then -200 cash.
    expect(f.itemDiscountTotal).toBe(100);
    expect(f.billDiscountAmount).toBe(145);
    expect(f.cashDiscount).toBe(200);
    expect(f.totalAmount).toBe(2555);
    expect(f.totalDiscount).toBe(445);
    expect(f.billCouponCode).toBe('XMAS10');
    expect(discountSummaryRows(f).find((r) => r.kind === 'bill')?.label).toBe('Bill discount 5% (XMAS10)');
  });

  test('every summary row ties exactly to the saved total', () => {
    const f = computeCartFinancials({
      items: [withLineDiscount(item(1000), 12.5, 'EASTER'), item(2000)],
      billPercent: 7.5,
      cashDiscount: 100,
    });
    const rows = discountSummaryRows(f);
    const gross = rows.find((r) => r.kind === 'gross')!.amount;
    const deductions = rows.filter((r) => r.negative).reduce((s, r) => s + r.amount, 0);
    const net = rows.find((r) => r.kind === 'net')!.amount;
    expect(roundMoney(gross - deductions)).toBe(net);
    expect(net).toBe(f.totalAmount);
  });

  test('percentages are clamped to 0–100 and money never goes below zero', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent('abc')).toBe(0);
    const full = computeCartFinancials({
      items: [withLineDiscount(item(1000), 250)],
      billPercent: 100,
      cashDiscount: 99999,
    });
    expect(full.totalAmount).toBe(0);
    expect(full.cashDiscount).toBe(0);
    expect(full.itemDiscountTotal).toBe(1000);
  });

  test('legacy sale records have no percentage fields and still reconcile', () => {
    const legacy = sale({ subtotal: 2500, totalAmount: 2500, cashDiscount: 500 });
    const f = saleFinancials(legacy);
    expect(f.grossSubtotal).toBe(3000);
    expect(f.itemDiscountTotal).toBe(0);
    expect(f.billDiscountAmount).toBe(0);
    expect(f.cashDiscount).toBe(500);
    expect(f.totalAmount).toBe(2500);
    expect(roundMoney(f.grossSubtotal - f.totalDiscount)).toBe(f.totalAmount);
  });

  test('saved discount fields are reconstructed without changing the net total', () => {
    const saved = sale({
      subtotal: 3000,
      totalAmount: 2555,
      cashDiscount: 200,
      grossSubtotal: 3000,
      itemDiscountTotal: 100,
      billDiscountPercent: 5,
      billDiscountAmount: 145,
      billCouponCode: 'XMAS10',
      totalDiscount: 445,
      items: [withLineDiscount(item(1000), 10, 'FESTIVE'), item(2000)],
    });
    const f = saleFinancials(saved);
    expect(f.grossSubtotal).toBe(3000);
    expect(f.itemDiscountTotal).toBe(100);
    expect(f.billDiscountAmount).toBe(145);
    expect(f.cashDiscount).toBe(200);
    expect(f.totalAmount).toBe(2555);
    expect(f.totalDiscount).toBe(445);
  });

  test('a repaired legacy receipt with missing items still reconciles', () => {
    const broken = sale({ items: [], subtotal: 2500, totalAmount: 2500, cashDiscount: 500 });
    const f = saleFinancials(broken);
    expect(f.grossSubtotal).toBe(3000);
    expect(f.cashDiscount).toBe(500);
    expect(f.totalAmount).toBe(2500);
  });

  test('a mixed box + loose-piece product prints its discount once', () => {
    const mixed = withLineDiscount(item(15833.33, {
      cartonQty: 1,
      pieceQty: 7,
      piecesPerCarton: 12,
      cartonRate: 10000,
      pieceRate: roundMoney(10000 / 12),
      saleMode: 'both',
    }), 10, 'BOXSALE');
    const display = buildSaleDisplay([mixed]);
    expect(display.lines.map((l) => l.kind)).toEqual(['box', 'piece']);
    const withDiscount = display.lines.filter((l) => l.discount);
    expect(withDiscount).toHaveLength(1);
    expect(withDiscount[0].discount?.amount).toBe(1583.33);
    expect(withDiscount[0].discountNoteLines[0]).toContain('BOXSALE');
    expect(display.itemDiscountTotal).toBe(1583.33);
  });
});
