import { describe, expect, test } from 'vitest';
import {
  isWholesalePieceRate,
  resolvePackRates,
  wholesalePieceRate,
} from '../utils/packPricing';

describe('v2.1.0 box-derived wholesale pricing', () => {
  test('box price divided by pieces gives the discounted per-piece rate', () => {
    const rate = wholesalePieceRate(10000, 12);
    expect(rate).toBeCloseTo(833.3333333333334, 8);
    expect(19 * rate).toBeCloseTo(15833.333333333334, 6);
  });

  test('one box plus 7 loose pieces all use the box rate', () => {
    const rates = resolvePackRates({
      cartonQty: 1,
      pieceQty: 7,
      piecesPerCarton: 12,
      cartonRate: 10000,
      pieceLadderRate: 5000, // higher piece-only price — ignored here
    });
    expect(rates.wholesaleApplied).toBe(true);
    expect(rates.pieceRate).toBeCloseTo(10000 / 12, 8);
    expect(rates.totalPieces).toBe(19);
    expect(rates.amount).toBeCloseTo(10000 + 7 * (10000 / 12), 6);
    expect(rates.amount).toBeCloseTo(19 * (10000 / 12), 6);
  });

  test('piece-only sales keep their own price ladder', () => {
    const rates = resolvePackRates({
      cartonQty: 0,
      pieceQty: 7,
      piecesPerCarton: 12,
      cartonRate: 10000,
      pieceLadderRate: 5000,
    });
    expect(rates.wholesaleApplied).toBe(false);
    expect(rates.pieceRate).toBe(5000);
    expect(rates.amount).toBe(35000);
    expect(rates.totalPieces).toBe(7);
  });

  test('moving the box price re-derives the loose-piece rate', () => {
    const first = resolvePackRates({
      cartonQty: 2,
      pieceQty: 4,
      piecesPerCarton: 12,
      cartonRate: 50000,
      pieceLadderRate: 6000,
    });
    const cheaper = resolvePackRates({
      cartonQty: 2,
      pieceQty: 4,
      piecesPerCarton: 12,
      cartonRate: 48000,
      pieceLadderRate: 6000,
    });
    expect(first.pieceRate).toBeCloseTo(50000 / 12, 8);
    expect(cheaper.pieceRate).toBeCloseTo(48000 / 12, 8);
    expect(cheaper.pieceRate).toBeLessThan(first.pieceRate);
    expect(cheaper.amount).toBeCloseTo(2 * 48000 + 4 * (48000 / 12), 6);
  });

  test('legacy higher piece rates are not mistaken for wholesale', () => {
    expect(isWholesalePieceRate(10000 / 12, 10000, 12)).toBe(true);
    expect(isWholesalePieceRate(5000, 10000, 12)).toBe(false);
    expect(isWholesalePieceRate(4166.67, 50000, 12)).toBe(false);
    expect(isWholesalePieceRate(0, 10000, 12)).toBe(false);
  });

  test('a product without a pieces-per-box count cannot apply wholesale', () => {
    const rates = resolvePackRates({
      cartonQty: 1,
      pieceQty: 3,
      piecesPerCarton: 0,
      cartonRate: 10000,
      pieceLadderRate: 5000,
    });
    expect(rates.wholesaleApplied).toBe(false);
    expect(rates.pieceRate).toBe(5000);
    expect(rates.totalPieces).toBe(3);
  });
});
