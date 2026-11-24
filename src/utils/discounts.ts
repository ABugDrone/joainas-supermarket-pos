import { CartItem, SaleRecord } from '../types';

// ===========================================================================
// v2.1.0 — percentage discounts / seasonal coupons.
//
// One percentage per product line and one percentage for the whole bill. Each
// percentage can carry an optional coupon name/code (e.g. "XMAS10", "EASTER").
// A sale may therefore use any combination of:
//   no discount | cash discount | product % | bill % / coupon rate | ALL
//
// Calculation order (confirmed by the shop owner):
//   1. every product % is taken off its OWN gross line amount,
//   2. the bill % is taken off the sum of the already-discounted lines,
//   3. the fixed cash discount is subtracted last.
// Every step is rounded to 2 decimals and the net total never drops below 0.
//
// `CartItem.amount` remains the GROSS line amount. All discount data lives in
// additive optional fields, so sales saved by v2.0.8/v2.0.9 (and older) read
// exactly as before: zero item/bill discounts, cash discount as stored.
// ===========================================================================

export const MAX_DISCOUNT_PERCENT = 100;
const MONEY_DECIMALS = 2;

/** Currency-safe rounding shared by the POS, receipts, records and exports. */
export function roundMoney(n: number, decimals: number = MONEY_DECIMALS): number {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/** Clamp any typed value into a valid 0–100 percentage. */
export function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT, roundMoney(n));
}

export function clampMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(n);
}

/** "10" -> "10%", "12.50" -> "12.5%". ASCII-safe for thermal printers. */
export function formatPercent(percent: number): string {
  return `${roundMoney(clampPercent(percent))}%`;
}

/** Short human label for a percentage, with the coupon code when present. */
export function discountLabel(percent: number, couponCode?: string): string {
  const code = (couponCode || '').trim();
  return code ? `${code} ${formatPercent(percent)} discount` : `${formatPercent(percent)} discount`;
}

export interface LineDiscount {
  index: number;
  name: string;
  percent: number;
  couponCode?: string;
  gross: number;
  amount: number; // money deducted from the line
  net: number; // what the line costs after its own discount
}

/** Deduction for ONE product. Pure: never mutates the cart line. */
export function lineDiscount(item: CartItem, index: number = 0): LineDiscount {
  const gross = roundMoney(Math.max(0, Number(item?.amount) || 0));
  const percent = clampPercent(item?.discountPercent);
  const couponCode = (item?.couponCode || '').trim() || undefined;
  const amount = Math.min(gross, roundMoney((gross * percent) / 100));
  return {
    index,
    name: item?.product?.name || 'Item',
    percent,
    couponCode,
    gross,
    amount,
    net: Math.max(0, roundMoney(gross - amount)),
  };
}

/** Return a copy of a cart line with its discount fields kept consistent. */
export function withLineDiscount(
  item: CartItem,
  percent: number,
  couponCode?: string,
): CartItem {
  const p = clampPercent(percent);
  const code = (couponCode || '').trim();
  const d = lineDiscount({ ...item, discountPercent: p, couponCode: code });
  return {
    ...item,
    discountPercent: p || undefined,
    couponCode: code || undefined,
    lineDiscountAmount: d.amount || undefined,
    netAmount: p > 0 ? d.net : undefined,
  };
}

export interface SaleFinancials {
  grossSubtotal: number;
  /** Only the lines that actually carry a percentage discount. */
  lineDiscounts: LineDiscount[];
  itemDiscountTotal: number;
  billPercent: number;
  billCouponCode?: string;
  billDiscountAmount: number;
  cashDiscount: number;
  totalDiscount: number;
  totalAmount: number;
  hasAnyDiscount: boolean;
}

export interface CartDiscountInput {
  items: CartItem[];
  billPercent: number;
  billCouponCode?: string;
  cashDiscount: number;
}

/** Forward calculation used by the live POS screen. */
export function computeCartFinancials(input: CartDiscountInput): SaleFinancials {
  const items = Array.isArray(input.items) ? input.items : [];
  const allLines = items.map((item, i) => lineDiscount(item, i));
  const grossSubtotal = roundMoney(allLines.reduce((s, l) => s + l.gross, 0));
  const itemDiscountTotal = roundMoney(allLines.reduce((s, l) => s + l.amount, 0));
  const afterItems = Math.max(0, roundMoney(grossSubtotal - itemDiscountTotal));

  const billPercent = clampPercent(input.billPercent);
  const billCouponCode = (input.billCouponCode || '').trim() || undefined;
  const billDiscountAmount = Math.min(
    afterItems,
    roundMoney((afterItems * billPercent) / 100),
  );
  const afterBill = Math.max(0, roundMoney(afterItems - billDiscountAmount));

  const cashDiscount = Math.min(afterBill, clampMoney(input.cashDiscount));
  const totalAmount = Math.max(0, roundMoney(afterBill - cashDiscount));
  const totalDiscount = Math.max(0, roundMoney(grossSubtotal - totalAmount));

  return {
    grossSubtotal,
    lineDiscounts: allLines.filter((l) => l.percent > 0),
    itemDiscountTotal,
    billPercent,
    billCouponCode,
    billDiscountAmount,
    cashDiscount,
    totalDiscount,
    totalAmount,
    hasAnyDiscount: totalDiscount > 0,
  };
}

/**
 * Reconstruct the discount breakdown of a SAVED sale.
 *
 * The persisted `totalAmount` is authoritative, so the bill-level deduction is
 * derived as the residual that makes every printed row tie exactly:
 *   gross - product discounts - bill discount - cash discount = total.
 * Legacy sales (no percentage fields) therefore keep their old behaviour and
 * still reconcile even when their item rows were repaired or partly missing.
 */
export function saleFinancials(sale: SaleRecord): SaleFinancials {
  const s = sale || ({} as SaleRecord);
  const items = Array.isArray(s.items) ? s.items : [];
  const allLines = items.map((item, i) => lineDiscount(item, i));
  const itemDiscountTotal = roundMoney(allLines.reduce((sum, l) => sum + l.amount, 0));
  const fromItems = roundMoney(allLines.reduce((sum, l) => sum + l.gross, 0));
  const totalAmount = roundMoney(Math.max(0, Number(s.totalAmount) || 0));
  const cashDiscount = clampMoney(s.cashDiscount);
  const billPercent = clampPercent(s.billDiscountPercent);
  const billCouponCode = (s.billCouponCode || '').trim() || undefined;

  // Prefer the stored gross; fall back to the item rows; finally fall back to
  // the smallest value that can still contain the net total + known discounts.
  const grossSubtotal = Math.max(
    clampMoney(s.grossSubtotal),
    fromItems,
    roundMoney(totalAmount + itemDiscountTotal + cashDiscount),
  );

  const billDiscountAmount = Math.max(
    0,
    roundMoney(grossSubtotal - itemDiscountTotal - cashDiscount - totalAmount),
  );
  const totalDiscount = Math.max(0, roundMoney(grossSubtotal - totalAmount));

  return {
    grossSubtotal,
    lineDiscounts: allLines.filter((l) => l.percent > 0),
    itemDiscountTotal,
    billPercent,
    billCouponCode,
    billDiscountAmount,
    cashDiscount,
    totalDiscount,
    totalAmount,
    hasAnyDiscount: totalDiscount > 0,
  };
}

export type DiscountRowKind = 'gross' | 'item' | 'bill' | 'cash' | 'saved' | 'net';

export interface DiscountSummaryRow {
  kind: DiscountRowKind;
  /** ASCII-only label (safe for ESC/POS and copy-text receipts). */
  label: string;
  amount: number;
  /** True when the amount should be printed with a leading minus. */
  negative: boolean;
}

/**
 * One ordered list of total rows for every surface (POS, preview, receipt,
 * print, sales record, export). Receivers only format the money.
 */
export function discountSummaryRows(f: SaleFinancials): DiscountSummaryRow[] {
  if (!f.hasAnyDiscount) {
    return [{ kind: 'net', label: 'TOTAL', amount: f.totalAmount, negative: false }];
  }
  const rows: DiscountSummaryRow[] = [
    { kind: 'gross', label: 'Subtotal', amount: f.grossSubtotal, negative: false },
  ];
  if (f.itemDiscountTotal > 0) {
    const n = f.lineDiscounts.length;
    rows.push({
      kind: 'item',
      label: `Product ${n === 1 ? 'discount' : 'discounts'} (${n} ${n === 1 ? 'line' : 'lines'})`,
      amount: f.itemDiscountTotal,
      negative: true,
    });
  }
  if (f.billDiscountAmount > 0) {
    const pct = f.billPercent > 0 ? ` ${formatPercent(f.billPercent)}` : '';
    const code = f.billCouponCode ? ` (${f.billCouponCode})` : '';
    rows.push({
      kind: 'bill',
      label: `Bill discount${pct}${code || (pct ? '' : ' (other)')}`,
      amount: f.billDiscountAmount,
      negative: true,
    });
  }
  if (f.cashDiscount > 0) {
    rows.push({ kind: 'cash', label: 'Cash discount', amount: f.cashDiscount, negative: true });
  }
  rows.push({ kind: 'saved', label: 'Total saved', amount: f.totalDiscount, negative: false });
  rows.push({ kind: 'net', label: 'TOTAL', amount: f.totalAmount, negative: false });
  return rows;
}
