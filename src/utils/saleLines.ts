import { CartItem } from '../types';
import { formatMoney, moneyAscii, getCurrencySymbol, resolveCurrency } from './currency';
import { isWholesalePieceRate } from './packPricing';
import { formatPercent, lineDiscount } from './discounts';

// ===========================================================================
// v2.0.9 — clean, box-first sale lines for receipts and sales records.
//
// A pack/carton sale is persisted as ONE CartItem whose `quantity` is the
// TOTAL number of pieces and whose `rate` is a BLENDED per-piece rate. That
// made a 2-carton sale print "24 / 4,166.67" instead of "2 cartons × 50,000".
// buildSaleDisplay() re-derives presentation rows from the saved split fields
// (cartonQty / pieceQty / cartonRate / pieceRate / piecesPerCarton) WITHOUT
// changing the database or the stock accounting.
//
// Ordering rule from the shop owner:
//   * every box (carton/pack) transaction comes first,
//   * loose-piece transactions follow afterwards and are marked differently,
//   * a mixed sale therefore reads as "boxes first, then remaining pieces".
//
// Every box row carries a small wholesale footer: the pieces contained in the
// boxes × the discounted (wholesale) price per piece. That wholesale rate is
// ALWAYS the actual box price charged ÷ pieces per box, so it re-derives
// itself when the cashier moves the box price within its min–max range. Loose
// pieces keep their own (usually higher) price ladder. Both expressions are
// printed with the same total, so the line balances like a double entry.
// ===========================================================================

export type SaleLineKind = 'box' | 'piece' | 'plain';

export interface WholesaleNote {
  boxQty: number;
  boxUnit: string; // 'carton' | 'pack'
  boxRate: number; // price of ONE box as actually charged
  piecesPerBox: number;
  piecesInBoxes: number;
  wholesalePieceRate: number; // discounted price of ONE piece inside a box
  wholesaleDecimals: number; // decimals needed for the two sides to tie
  boxTotal: number;
  /** v2.1.0 — loose pieces on this line also use the box-derived rate. */
  wholesaleOnAllPieces: boolean;
  extraPieces: number;
  totalPieces: number;
  combinedTotal: number;
}

export interface SaleDisplayLine {
  key: string;
  kind: SaleLineKind;
  name: string;
  category: string;
  unit: string; // singular: carton / pack / piece / the product's own unit
  qty: number;
  qtyLabel: string; // "2 cartons", "6 pieces"
  rate: number; // price of ONE `unit`
  amount: number; // qty × rate
  rateLabel: string; // plain number for narrow receipt columns
  amountLabel: string;
  detail: string; // "2 cartons × ₦50,000.00"
  note?: WholesaleNote;
  noteLines: string[];
  /**
   * v2.1.0 — per-product percentage discount. Attached only to the FIRST
   * display row of that product so a mixed box + loose-piece item does not
   * print the same deduction twice.
   */
  discount?: LineDiscountInfo;
  discountNoteLines: string[];
}

export interface LineDiscountInfo {
  percent: number;
  couponCode?: string;
  gross: number;
  amount: number; // money deducted from the whole product line
  net: number; // line total after the deduction
}

export interface SaleDisplay {
  lines: SaleDisplayLine[];
  /** True when a sale has BOTH box rows and loose-piece rows. */
  hasGroups: boolean;
  /** Index of the first loose-piece row, or -1. */
  pieceStartIndex: number;
  /** Compact "2 cartons + 6 pieces" summary for the records Qty column. */
  unitSummary: string;
  /** Sum of the split row amounts — equals the sale gross subtotal. */
  linesTotal: number;
  /** v2.1.0 — sum of the per-product percentage deductions. */
  itemDiscountTotal: number;
}

export interface SaleDisplayOptions {
  code?: string | null;
  ascii?: boolean; // printer-safe text (ISO code instead of ₦, 'x' instead of ×)
}

function grouped(n: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function plain(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

function money(n: number, code: string | null | undefined, ascii: boolean): string {
  return ascii ? moneyAscii(n, code) : formatMoney(n, code);
}

function prefix(code: string | null | undefined, ascii: boolean): string {
  return ascii ? `${resolveCurrency(code).code} ` : getCurrencySymbol(code);
}

/** Money rendered at a custom precision (used only for the wholesale rate). */
function moneyAt(
  n: number,
  decimals: number,
  code: string | null | undefined,
  ascii: boolean,
): string {
  return `${prefix(code, ascii)}${grouped(n, decimals)}`;
}

export function pluralUnit(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Smallest number of decimals (starting at the currency's own precision) that
 * makes `shownRate × pieces` round to exactly the box total. For a 12-piece
 * box at ₦50,000 the raw rate is 4,166.666…; 2 decimals give 100,000.08 and
 * 3 give 100,000.008, so 4 decimals (4,166.6667) are needed to tie at kobo.
 */
export function wholesaleDecimals(
  boxTotal: number,
  pieces: number,
  code?: string | null,
): number {
  const cur = resolveCurrency(code);
  const tolerance = 0.5 * Math.pow(10, -cur.decimals);
  if (!Number.isFinite(boxTotal) || !Number.isFinite(pieces) || pieces <= 0) {
    return cur.decimals;
  }
  const raw = boxTotal / pieces;
  for (let d = cur.decimals; d <= 8; d += 1) {
    const shown = Number(raw.toFixed(d));
    if (Math.abs(shown * pieces - boxTotal) < tolerance) return d;
  }
  return 8;
}

/** The small footer note under a box row — both sides show the SAME total. */
export function formatWholesaleNote(
  note: WholesaleNote,
  opts: SaleDisplayOptions = {},
): string[] {
  const ascii = !!opts.ascii;
  const code = opts.code;
  const cross = ascii ? 'x' : '×';
  const rateText = moneyAt(note.wholesalePieceRate, note.wholesaleDecimals, code, ascii);
  const boxRateText = money(note.boxRate, code, ascii);
  const boxes = pluralUnit(note.boxQty, note.boxUnit);

  // v2.1.0 — boxes + loose pieces priced at ONE wholesale rate: both sides
  // of the double entry show the same combined total (19 pcs = 1 box + 7 pcs).
  if (note.wholesaleOnAllPieces && note.extraPieces > 0) {
    const totalText = money(note.combinedTotal, code, ascii);
    if (ascii) {
      return [
        `Wholesale: ${note.totalPieces}pcs ${cross} ${rateText}/pc = ${totalText}`,
        `Box check: ${boxes} ${cross} ${boxRateText} + ${note.extraPieces}pcs ${cross} ${rateText} = ${totalText}`,
      ];
    }
    return [
      `Wholesale: ${note.totalPieces} pcs ${cross} ${rateText}/pc = ${totalText}`,
      `Box check: ${boxes} ${cross} ${boxRateText} + ${note.extraPieces} pcs ${cross} ${rateText} = ${totalText}`,
    ];
  }

  const totalText = money(note.boxTotal, code, ascii);
  if (ascii) {
    return [
      `Wholesale: ${note.piecesInBoxes}pcs ${cross} ${rateText}/pc`,
      ` = ${totalText}`,
      `Box check: ${boxes} ${cross} ${boxRateText} = ${totalText}`,
    ];
  }
  return [
    `Wholesale: ${note.piecesInBoxes} pcs ${cross} ${rateText}/pc = ${totalText}`,
    `Box check: ${boxes} ${cross} ${boxRateText} = ${totalText}`,
  ];
}

interface MakeLineArgs {
  key: string;
  kind: SaleLineKind;
  name: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  note?: WholesaleNote;
  /** v2.1.0 — print a wholesale rate at full precision on the piece row. */
  rateDecimals?: number;
  /** v2.1.0 — per-product percentage discount note. */
  discount?: LineDiscountInfo;
  opts: SaleDisplayOptions;
}

function makeLine(a: MakeLineArgs): SaleDisplayLine {
  const ascii = !!a.opts.ascii;
  const cross = ascii ? 'x' : '×';
  const qtyLabel = pluralUnit(a.qty, a.unit);
  const rateText = a.rateDecimals
    ? moneyAt(a.rate, a.rateDecimals, a.opts.code, ascii)
    : money(a.rate, a.opts.code, ascii);
  const discountNoteLines: string[] = a.discount
    ? [
        `Discount ${formatPercent(a.discount.percent)}${
          a.discount.couponCode ? ` (${a.discount.couponCode})` : ''
        }: -${money(a.discount.amount, a.opts.code, ascii)} ${ascii ? '->' : '→'} ${money(
          a.discount.net,
          a.opts.code,
          ascii,
        )}`,
      ]
    : [];
  return {
    key: a.key,
    kind: a.kind,
    name: a.name,
    category: a.category,
    unit: a.unit,
    qty: a.qty,
    qtyLabel,
    rate: a.rate,
    amount: a.amount,
    rateLabel: a.rateDecimals ? grouped(a.rate, a.rateDecimals) : plain(a.rate),
    amountLabel: plain(a.amount),
    detail: `${qtyLabel} ${cross} ${rateText}`,
    note: a.note,
    noteLines: a.note ? formatWholesaleNote(a.note, a.opts) : [],
    discount: a.discount,
    discountNoteLines,
  };
}

/**
 * Turn persisted sale items into box-first display rows.
 * Older rows without split fields are kept as single "plain" rows.
 */
export function buildSaleDisplay(
  items: CartItem[],
  opts: SaleDisplayOptions = {},
): SaleDisplay {
  const boxes: SaleDisplayLine[] = [];
  const pieces: SaleDisplayLine[] = [];
  const plains: SaleDisplayLine[] = [];
  let itemDiscountTotal = 0;

  (items || []).forEach((item, idx) => {
    const product = item.product || ({} as CartItem['product']);
    // v2.1.0 — one percentage discount per PRODUCT, shown once on its first
    // presentation row even when the item splits into a box + loose-piece row.
    const ld = lineDiscount(item, idx);
    itemDiscountTotal += ld.amount;
    const discountInfo: LineDiscountInfo | undefined = ld.percent > 0
      ? {
          percent: ld.percent,
          couponCode: ld.couponCode,
          gross: ld.gross,
          amount: ld.amount,
          net: ld.net,
        }
      : undefined;
    let attached = false;
    const takeDiscount = (): LineDiscountInfo | undefined => {
      if (attached || !discountInfo) return undefined;
      attached = true;
      return discountInfo;
    };
    const name = product.name || 'Item';
    const category = product.category || '';
    const per = Number(item.piecesPerCarton ?? product.piecesPerCarton ?? 0);
    const c = Math.max(0, Number(item.cartonQty || 0));
    const p = Math.max(0, Number(item.pieceQty || 0));
    const hasSplit = per > 0 && (c > 0 || p > 0);

    if (!hasSplit) {
      plains.push(
        makeLine({
          key: `${idx}-plain`,
          kind: 'plain',
          name,
          category,
          unit: product.unit || 'unit',
          qty: Number(item.quantity || 0),
          rate: Number(item.rate || 0),
          amount: Number(item.amount || 0),
          discount: takeDiscount(),
          opts,
        }),
      );
      return;
    }

    const boxUnit = product.unit === 'pack' ? 'pack' : 'carton';
    const blended = Number(item.rate || 0);
    let boxRate = Number(item.cartonRate || 0);
    let pieceRate = Number(item.pieceRate || 0);
    // Legacy v2.0.8 rows that only carry the blended per-piece rate.
    if (c > 0 && !(boxRate > 0)) boxRate = blended * per;
    if (p > 0 && !(pieceRate > 0)) pieceRate = blended;

    const boxTotal = c * boxRate;
    const piecesInBoxes = c * per;
    // v2.1.0 — a mixed sale whose piece rate equals box ÷ pieces prices ALL
    // pieces at the wholesale rate. Legacy rows with their own higher piece
    // price keep the v2.0.9 box-only footer.
    const wholesaleOnAllPieces =
      c > 0 && p > 0 && per > 0 && isWholesalePieceRate(pieceRate, boxRate, per);
    const extraPieces = wholesaleOnAllPieces ? p : 0;
    const totalPieces = piecesInBoxes + extraPieces;
    const combinedTotal = boxTotal + extraPieces * pieceRate;
    const decimals = wholesaleDecimals(combinedTotal, totalPieces, opts.code);

    if (c > 0) {
      const note: WholesaleNote = {
        boxQty: c,
        boxUnit,
        boxRate,
        piecesPerBox: per,
        piecesInBoxes,
        wholesalePieceRate: Number((combinedTotal / totalPieces).toFixed(decimals)),
        wholesaleDecimals: decimals,
        boxTotal,
        wholesaleOnAllPieces,
        extraPieces,
        totalPieces,
        combinedTotal,
      };
      boxes.push(
        makeLine({
          key: `${idx}-box`,
          kind: 'box',
          name,
          category,
          unit: boxUnit,
          qty: c,
          rate: boxRate,
          amount: boxTotal,
          note,
          discount: takeDiscount(),
          opts,
        }),
      );
    }

    if (p > 0) {
      pieces.push(
        makeLine({
          key: `${idx}-piece`,
          kind: 'piece',
          name,
          category,
          unit: 'piece',
          qty: p,
          rate: pieceRate,
          amount: p * pieceRate,
          rateDecimals: wholesaleOnAllPieces ? decimals : undefined,
          discount: takeDiscount(),
          opts,
        }),
      );
    }
  });

  const lines = [...boxes, ...pieces, ...plains];
  const summary: string[] = [];
  if (boxes.length) {
    summary.push(pluralUnit(boxes.reduce((s, l) => s + l.qty, 0), boxes[0].unit));
  }
  if (pieces.length) {
    summary.push(pluralUnit(pieces.reduce((s, l) => s + l.qty, 0), 'piece'));
  }
  if (plains.length && (boxes.length || pieces.length)) {
    summary.push(`${plains.length} other item${plains.length === 1 ? '' : 's'}`);
  }
  const unitSummary = summary.length
    ? summary.join(' + ')
    : String((items || []).reduce((s, i) => s + Number(i.quantity || 0), 0));

  return {
    lines,
    hasGroups: boxes.length > 0 && pieces.length > 0,
    pieceStartIndex: pieces.length ? boxes.length : -1,
    unitSummary,
    linesTotal: lines.reduce((s, l) => s + l.amount, 0),
    itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
  };
}
