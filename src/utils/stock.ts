import { Capability, Product, isUncountedKind } from '../types';

/**
 * Restock semantics for a depleted (negative) product:
 *   - normal stock: new + added
 *   - negative stock (e.g. -3): the physically counted amount replaces the
 *     debt, so 5 added becomes 5 (not 2).
 */
export function applyStockAddition(current: number, added: number): number {
  const c = Number.isFinite(current) ? Math.trunc(current) : 0;
  const a = Number.isFinite(added) ? Math.trunc(added) : 0;
  if (a <= 0) return c;
  return c < 0 ? a : c + a;
}

export type DepletedStockAction = 'add' | 'popup' | 'notify';

/** Decide what happens when an item is added to the bill. */
export function resolveDepletedStockAction(
  product: Pick<Product, 'kind' | 'category' | 'stockQty'>,
  capabilities: Capability[] = []
): DepletedStockAction {
  if (isUncountedKind(product)) return 'add';
  if (product.stockQty > 0) return 'add';
  if (capabilities.includes('admin') || capabilities.includes('inventory')) return 'popup';
  return 'notify';
}
