import { describe, expect, test } from 'vitest';
import { CartItem, Product } from '../types';
import {
  getCeilingFor,
  getDefaultRate,
  getFloorFor,
  formatCartonPieceBreakdown,
  formatPiecePriceDetail,
  getPieceCeilingFor,
  getPieceDefaultRate,
  getPieceFloorFor,
  hasPiecePricing,
} from '../utils/pricing';
import { deductSoldStock } from '../utils/stock';

const cartonProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '20004492',
  name: 'Engine Oil',
  category: 'Products',
  kind: 'product',
  unit: 'carton',
  costPrice: 45000,
  retailPrice: 53000,
  wholesalePrice: 53000,
  minPrice: 48000,
  stockQty: 10,
  reorderLevel: 1,
  piecesPerCarton: 12,
  loosePieces: 7,
  pieceCostPrice: 3800,
  pieceMinPrice: 4000,
  pieceRetailPrice: 5000,
  ...overrides,
});

describe('v2.0.8 dual-ladder pricing', () => {
  test('carton and piece ladders are independent', () => {
    const p = cartonProduct();
    expect(hasPiecePricing(p)).toBe(true);
    expect(getDefaultRate(p, 1)).toBe(53000);
    expect(getFloorFor(p, 1)).toBe(48000);
    expect(getPieceDefaultRate(p, 1)).toBe(5000);
    expect(getPieceFloorFor(p, 1)).toBe(4000);
  });

  test('piece tiers are selected by loose-piece quantity, not total pieces', () => {
    const p = cartonProduct({
      priceTiers: [{ id: 'c1', minQty: 1, maxQty: null, ceiling: 53000 }],
      piecePriceTiers: [
        { id: 'p1', minQty: 1, maxQty: 11, ceiling: 5000 },
        { id: 'p2', minQty: 12, maxQty: null, ceiling: 4500 },
      ],
    });
    expect(getPieceCeilingFor(p, 6)).toBe(5000);
    expect(getPieceCeilingFor(p, 12)).toBe(4500);
    // The carton ladder is unaffected by the piece quantity tiers.
    expect(getCeilingFor(p, 1)).toBe(53000);
  });

  test('legacy carton products derive piece prices from the carton price', () => {
    const p = cartonProduct({
      pieceCostPrice: undefined,
      pieceMinPrice: undefined,
      pieceRetailPrice: undefined,
      piecePriceTiers: undefined,
    });
    expect(hasPiecePricing(p)).toBe(false);
    expect(getPieceDefaultRate(p, 1)).toBeCloseTo(53000 / 12);
    expect(getPieceFloorFor(p, 1)).toBeCloseTo(48000 / 12);
    expect(formatPiecePriceDetail(p)).toContain('Max');
  });

  test('tiny per-piece detail shows cost, min and max', () => {
    expect(formatPiecePriceDetail(cartonProduct())).toBe(
      'Cost ₦3,800.00 · Min ₦4,000.00 · Max ₦5,000.00'
    );
  });

  test('sales line breakdown states cartons and pieces with their own rates', () => {
    const p = cartonProduct();
    const line = {
      product: p,
      quantity: 30,
      priceType: 'retail',
      rate: 0,
      amount: 136000,
      cartonQty: 2,
      pieceQty: 6,
      piecesPerCarton: 12,
      saleMode: 'both',
      cartonRate: 53000,
      pieceRate: 5000,
      saleUnitLabel: '2 cartons + 6 pieces',
    } as CartItem;
    expect(formatCartonPieceBreakdown(line)).toBe('2 cartons × ₦53,000.00 + 6 pcs × ₦5,000.00');
    expect(line.amount).toBe(2 * 53000 + 6 * 5000);
  });
});

describe('v2.0.8 stock re-bundling', () => {
  test('selling loose pieces converts remaining stock back into whole cartons', () => {
    const p = cartonProduct();
    const after = deductSoldStock(p, 1);
    // 10 cartons x 12 + 7 loose = 127 pieces; selling 1 leaves 126 = 10 cartons + 6 loose.
    expect(after.stockQty).toBe(10);
    expect(after.loosePieces).toBe(6);
  });

  test('selling a whole carton keeps the loose remainder', () => {
    const p = cartonProduct();
    const after = deductSoldStock(p, 12);
    expect(after.stockQty).toBe(9);
    expect(after.loosePieces).toBe(7);
  });
});
