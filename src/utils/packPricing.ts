// ===========================================================================
// v2.1.0 — box-derived wholesale piece pricing.
//
// Rule from the shop owner: as soon as at least ONE carton/pack is on a sale
// line, every loose piece on that same line is priced from the box, not from
// the (usually higher) loose-piece ladder.
//
//   box ₦10,000 / 12 pieces = ₦833.3333 per piece
//   1 box + 7 loose pieces = 19 pieces × ₦833.3333 = ₦15,833.33
//
// Piece-only lines keep their own configured ladder. This module is kept
// pure so the POS, receipts, sales records and tests all use one rule.
// ===========================================================================

export interface PackRateInput {
  cartonQty: number;
  pieceQty: number;
  piecesPerCarton: number;
  /** Price of ONE box, already clamped to the box min–max range. */
  cartonRate: number;
  /** The cashier's loose-piece ladder price (only used for piece-only lines). */
  pieceLadderRate: number;
}

export interface PackRates {
  cartonRate: number;
  pieceRate: number;
  amount: number;
  totalPieces: number;
  wholesaleApplied: boolean;
}

/** Discounted per-piece value of a box actually sold at `boxRate`. */
export function wholesalePieceRate(boxRate: number, piecesPerBox: number): number {
  if (!(piecesPerBox > 0) || !(boxRate > 0)) return 0;
  return boxRate / piecesPerBox;
}

/**
 * True when a persisted per-piece rate is the box-derived wholesale rate.
 * Used to avoid re-interpreting old v2.0.8/v2.0.9 records that legitimately
 * sold loose pieces at their own higher ladder.
 */
export function isWholesalePieceRate(
  pieceRate: number,
  boxRate: number,
  piecesPerBox: number,
): boolean {
  if (!(pieceRate > 0) || !(boxRate > 0) || !(piecesPerBox > 0)) return false;
  const expected = boxRate / piecesPerBox;
  return Math.abs(pieceRate - expected) <= Math.max(0.000001, Math.abs(expected) * 1e-9);
}

/** Resolve both rates and the line amount from the current carton state. */
export function resolvePackRates(input: PackRateInput): PackRates {
  const cartonQty = Math.max(0, Math.trunc(input.cartonQty || 0));
  const pieceQty = Math.max(0, Math.trunc(input.pieceQty || 0));
  const piecesPerCarton = Math.max(0, input.piecesPerCarton || 0);
  const cartonRate = cartonQty > 0 ? Math.max(0, input.cartonRate || 0) : 0;
  const wholesaleApplied = cartonQty > 0 && piecesPerCarton > 0;

  const pieceRate =
    pieceQty > 0
      ? wholesaleApplied
        ? wholesalePieceRate(cartonRate, piecesPerCarton)
        : Math.max(0, input.pieceLadderRate || 0)
      : 0;

  return {
    cartonRate,
    pieceRate,
    amount: cartonQty * cartonRate + pieceQty * pieceRate,
    totalPieces: cartonQty * piecesPerCarton + pieceQty,
    wholesaleApplied,
  };
}
