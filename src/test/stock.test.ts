import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { applyStockAddition, resolveDepletedStockAction } from '../utils/stock';

describe('stock addition', () => {
  test('normal stock increments', () => {
    expect(applyStockAddition(10, 5)).toBe(15);
    expect(applyStockAddition(0, 5)).toBe(5);
  });

  test('negative stock resets to the added amount', () => {
    expect(applyStockAddition(-3, 5)).toBe(5);
    expect(applyStockAddition(-20, 1)).toBe(1);
  });

  test('non-positive additions never change stock', () => {
    expect(applyStockAddition(-3, 0)).toBe(-3);
    expect(applyStockAddition(4, -2)).toBe(4);
  });

  test('property: negative resets, non-negative increments', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 50 }), fc.integer({ min: 1, max: 50 }), (current, added) => {
        const next = applyStockAddition(current, added);
        return next === (current < 0 ? added : current + added);
      })
    );
  });
});

describe('depleted stock action', () => {
  const goods = { kind: 'product' as const, category: 'Groceries', stockQty: 0 };

  test('inventory users get the popup for depleted goods', () => {
    expect(resolveDepletedStockAction(goods, ['inventory'])).toBe('popup');
    expect(resolveDepletedStockAction(goods, ['admin'])).toBe('popup');
  });

  test('other roles are told to ask a manager', () => {
    expect(resolveDepletedStockAction(goods, ['sell'])).toBe('notify');
  });

  test('in-stock and uncounted items add directly', () => {
    expect(resolveDepletedStockAction({ ...goods, stockQty: 5 }, ['sell'])).toBe('add');
    expect(resolveDepletedStockAction({ ...goods, kind: 'service' }, [])).toBe('add');
    expect(resolveDepletedStockAction({ ...goods, kind: 'edible' }, [])).toBe('add');
  });

  test('explicit kind wins over a category named Services', () => {
    expect(
      resolveDepletedStockAction(
        { kind: 'product', category: 'Services', stockQty: 0 },
        ['inventory']
      )
    ).toBe('popup');
  });
});
