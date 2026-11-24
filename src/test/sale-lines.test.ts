import { describe, expect, test } from 'vitest';
import { CartItem, Product, SaleRecord, ThermalPrinterConfig } from '../types';
import {
  buildSaleDisplay,
  formatWholesaleNote,
  wholesaleDecimals,
} from '../utils/saleLines';
import { buildEscPos } from '../utils/escpos';

const packProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '20004492',
  name: 'Engine Oil',
  category: 'Products',
  kind: 'product',
  unit: 'carton',
  costPrice: 45000,
  retailPrice: 50000,
  wholesalePrice: 50000,
  minPrice: 46000,
  stockQty: 10,
  reorderLevel: 1,
  piecesPerCarton: 12,
  loosePieces: 7,
  pieceCostPrice: 3800,
  pieceMinPrice: 4000,
  pieceRetailPrice: 5000,
  ...overrides,
});

const packLine = (overrides: Partial<CartItem> = {}): CartItem => ({
  product: packProduct(),
  quantity: 12,
  priceType: 'retail',
  rate: 50000 / 12,
  amount: 50000,
  cartonQty: 1,
  pieceQty: 0,
  piecesPerCarton: 12,
  cartonRate: 50000,
  pieceRate: 0,
  saleMode: 'carton',
  saleUnitLabel: '1 carton',
  ...overrides,
});

describe('v2.0.9 box-first sale lines', () => {
  test('carton-only sale shows cartons and the carton price, not pieces', () => {
    const display = buildSaleDisplay([packLine()], { code: 'NGN' });
    expect(display.lines).toHaveLength(1);
    const line = display.lines[0];
    expect(line.kind).toBe('box');
    expect(line.qty).toBe(1);
    expect(line.unit).toBe('carton');
    expect(line.qtyLabel).toBe('1 carton');
    expect(line.rate).toBe(50000);
    expect(line.detail).toContain('1 carton');
    expect(line.detail).toContain('50,000.00');
    expect(display.unitSummary).toBe('1 carton');
    expect(display.hasGroups).toBe(false);
  });

  test('piece-only sale shows pieces and has no box footer', () => {
    const display = buildSaleDisplay(
      [
        packLine({
          cartonQty: 0,
          pieceQty: 6,
          cartonRate: 0,
          pieceRate: 5000,
          quantity: 6,
          rate: 5000,
          amount: 30000,
          saleMode: 'piece',
          saleUnitLabel: '6 pieces',
        }),
      ],
      { code: 'NGN' },
    );
    expect(display.lines).toHaveLength(1);
    const line = display.lines[0];
    expect(line.kind).toBe('piece');
    expect(line.qty).toBe(6);
    expect(line.unit).toBe('piece');
    expect(line.qtyLabel).toBe('6 pieces');
    expect(line.rate).toBe(5000);
    expect(line.noteLines).toHaveLength(0);
    expect(display.unitSummary).toBe('6 pieces');
  });

  test('mixed sale places every box row before every loose-piece row', () => {
    const display = buildSaleDisplay(
      [
        packLine({
          product: packProduct({ id: 'pieces', name: 'Cereal' }),
          cartonQty: 0,
          pieceQty: 3,
          cartonRate: 0,
          pieceRate: 5000,
          rate: 5000,
          quantity: 3,
          amount: 15000,
        }),
        packLine({
          product: packProduct({ id: 'boxes', name: 'Soap' }),
          cartonQty: 2,
          pieceQty: 4,
          cartonRate: 50000,
          pieceRate: 5000,
          rate: 0,
          quantity: 28,
          amount: 2 * 50000 + 4 * 5000,
        }),
      ],
      { code: 'NGN' },
    );
    expect(display.lines.map((l) => l.kind)).toEqual(['box', 'piece', 'piece']);
    expect(display.lines[0].name).toBe('Soap');
    expect(display.hasGroups).toBe(true);
    expect(display.pieceStartIndex).toBe(1);
    expect(display.unitSummary).toBe('2 cartons + 7 pieces');
  });

  test('legacy sale without split fields stays a single plain row', () => {
    const display = buildSaleDisplay(
      [
        {
          product: packProduct({ piecesPerCarton: undefined, unit: 'piece' }),
          quantity: 4,
          priceType: 'retail',
          rate: 1200,
          amount: 4800,
        } as CartItem,
      ],
      { code: 'NGN' },
    );
    expect(display.lines).toHaveLength(1);
    expect(display.lines[0].kind).toBe('plain');
    expect(display.lines[0].qty).toBe(4);
    expect(display.unitSummary).toBe('4');
  });
});

describe('v2.0.9 balanced wholesale footer', () => {
  test('one box at 50,000 / 12 pieces derives the default wholesale price', () => {
    const line = buildSaleDisplay([packLine()], { code: 'NGN' }).lines[0];
    expect(line.note).toBeDefined();
    const note = line.note!;
    expect(note.piecesInBoxes).toBe(12);
    expect(note.wholesaleDecimals).toBe(3);
    expect(note.wholesalePieceRate).toBe(4166.667);
    expect(line.noteLines.join(' ')).toContain('4,166.667');
    expect(line.noteLines.join(' ')).toContain('12 pcs');
  });

  test('two boxes tie exactly: 24 pcs x wholesale = 2 cartons x 50,000', () => {
    const line = buildSaleDisplay(
      [
        packLine({
          cartonQty: 2,
          quantity: 24,
          rate: 50000 / 12,
          amount: 100000,
        }),
      ],
      { code: 'NGN' },
    ).lines[0];
    const note = line.note!;
    expect(note.piecesInBoxes).toBe(24);
    expect(note.wholesaleDecimals).toBe(4);
    expect(note.wholesalePieceRate).toBe(4166.6667);
    expect(Math.round(note.wholesalePieceRate * note.piecesInBoxes * 100) / 100).toBe(
      note.boxTotal,
    );
    expect(note.boxQty * note.boxRate).toBe(note.boxTotal);
    expect(line.noteLines).toHaveLength(2);
    expect(line.noteLines[0]).toContain('24 pcs');
    expect(line.noteLines[1]).toContain('100,000.00');
    expect(line.noteLines[1]).toContain('2 cartons');
  });

  test('wholesale rate re-derives from a box price moved inside the range', () => {
    const discounted = buildSaleDisplay(
      [packLine({ cartonQty: 1, cartonRate: 48000, amount: 48000 })],
      { code: 'NGN' },
    ).lines[0].note!;
    expect(discounted.boxRate).toBe(48000);
    expect(Math.round(discounted.wholesalePieceRate * 12 * 100) / 100).toBe(48000);
    expect(discounted.wholesalePieceRate).toBeLessThan(4166.667);
  });

  test('printer-safe footer avoids the Naira glyph and uses ASCII x', () => {
    const line = buildSaleDisplay([packLine()], { code: 'NGN', ascii: true }).lines[0];
    const notes = line.noteLines.join(' ');
    expect(notes).not.toContain('₦');
    expect(notes).toContain('NGN');
    expect(notes).toContain('x');
    expect(formatWholesaleNote(line.note!, { code: 'NGN' })[0]).toContain('×');
    expect(wholesaleDecimals(50000, 12, 'NGN')).toBe(3);
  });
});

describe('v2.0.9 native receipt never emits the "1P" artifact', () => {
  const sale = {
    receiptNo: 'R-1',
    date: '2026-11-20',
    time: '12:00:00',
    cashier: 'tester',
    priceType: 'retail',
    paymentMethod: 'Cash',
    currency: 'NGN',
    totalAmount: 100000,
    advancePayment: 100000,
    balanceDue: 0,
    customerName: 'Customer',
    items: [
      packLine({
        cartonQty: 2,
        pieceQty: 6,
        cartonRate: 50000,
        pieceRate: 5000,
        quantity: 30,
        amount: 130000,
      }),
    ],
  } as unknown as SaleRecord;
  const config = {
    paperWidth: '80mm',
    showLogo: true,
    tagline: '',
    address: '',
    phone: '',
    receiptFooterNote: '',
  } as unknown as ThermalPrinterConfig;

  test('stream starts with INIT then native centre alignment only', () => {
    const bytes = Array.from(buildEscPos(sale, config));
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x01]);
    // The old "1P" came from GS ( K ... 0x31 0x50. That command is gone.
    const hasDensityCommand = bytes.some(
      (b, i) => b === 0x1d && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x4b,
    );
    expect(hasDensityCommand).toBe(false);
    expect(String.fromCharCode(...bytes.slice(0, 20)).startsWith('1P')).toBe(false);
  });

  test('native receipt prints box rows, a pieces heading and the footer note', () => {
    const text = String.fromCharCode(...buildEscPos(sale, config));
    expect(text).toContain('LOOSE PIECES');
    expect(text).toContain('2 cartons');
    expect(text).toContain('Wholesale:');
    expect(text).toContain('Box check:');
    expect(text).toContain('6 pieces');
  });
});

describe('v2.1.0 mixed-sale wholesale double entry', () => {
  const mixedSaleLine = () =>
    packLine({
      cartonQty: 1,
      pieceQty: 7,
      piecesPerCarton: 12,
      cartonRate: 10000,
      pieceRate: 10000 / 12,
      quantity: 19,
      rate: (10000 + 7 * (10000 / 12)) / 19,
      amount: 10000 + 7 * (10000 / 12),
      saleMode: 'both',
      saleUnitLabel: '1 carton + 7 pieces',
    });

  test('all 19 pieces are priced at the box-derived wholesale rate', () => {
    const display = buildSaleDisplay([mixedSaleLine()], { code: 'NGN' });
    const note = display.lines[0].note!;
    expect(note.wholesaleOnAllPieces).toBe(true);
    expect(note.extraPieces).toBe(7);
    expect(note.totalPieces).toBe(19);
    expect(note.combinedTotal).toBeCloseTo(15833.333333, 5);
    expect(note.wholesalePieceRate).toBe(833.3333);
    expect(note.wholesaleDecimals).toBe(4);
    expect(note.wholesalePieceRate * note.totalPieces).toBeCloseTo(note.combinedTotal, 2);
  });

  test('the footer shows 19 pcs and the box + 7 pcs check with the same total', () => {
    const notes = buildSaleDisplay([mixedSaleLine()], { code: 'NGN' }).lines[0].noteLines;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('19 pcs');
    expect(notes[0]).toContain('833.3333');
    expect(notes[0]).toContain('15,833.33');
    expect(notes[1]).toContain('1 carton');
    expect(notes[1]).toContain('10,000.00');
    expect(notes[1]).toContain('7 pcs');
    expect(notes[1]).toContain('15,833.33');
  });

  test('the loose-piece row prints the precise wholesale rate, not 833.33', () => {
    const lines = buildSaleDisplay([mixedSaleLine()], { code: 'NGN' }).lines;
    expect(lines.map((l) => l.kind)).toEqual(['box', 'piece']);
    const piece = lines[1];
    expect(piece.qty).toBe(7);
    expect(piece.detail).toContain('833.3333');
    expect(piece.rateLabel).toBe('833.3333');
    expect(piece.amount).toBeCloseTo(7 * (10000 / 12), 6);
  });

  test('a legacy mixed sale keeps its higher piece-ladder price', () => {
    const legacy = packLine({
      cartonQty: 2,
      pieceQty: 6,
      cartonRate: 50000,
      pieceRate: 5000,
      quantity: 30,
      amount: 130000,
      saleMode: 'both',
    });
    const display = buildSaleDisplay([legacy], { code: 'NGN' });
    expect(display.lines[0].note!.wholesaleOnAllPieces).toBe(false);
    expect(display.lines[0].noteLines[0]).toContain('24 pcs');
    expect(display.lines[1].rate).toBe(5000);
    expect(display.lines[1].detail).toContain('5,000.00');
    expect(display.linesTotal).toBeCloseTo(130000, 6);
  });

  test('printer-safe mixed footer has no Naira glyph and still balances', () => {
    const notes = buildSaleDisplay([mixedSaleLine()], { code: 'NGN', ascii: true }).lines[0].noteLines;
    expect(notes.join(' ')).not.toContain('₦');
    expect(notes.join(' ')).toContain('NGN 833.3333');
    expect(notes.join(' ')).toContain('19pcs');
    expect(notes.join(' ')).toContain('15,833.33');
  });
});
