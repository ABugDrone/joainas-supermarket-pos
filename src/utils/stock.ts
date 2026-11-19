import { Capability, Product, isUncountedKind, totalPieces, isPackProduct } from '../types';

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

/**
 * v2.0.8 — deduct a sold quantity from a product's stock, handling cartons +
 * loose pieces. Returns a NEW product object (never mutates the input).
 * `soldPieces` is the total number of individual units sold.
 */
export function deductSoldStock(product: Product, soldPieces: number): Product {
  if (isUncountedKind(product)) return product;
  if (!isPackProduct(product)) {
    return { ...product, stockQty: product.stockQty - soldPieces };
  }
  const per = Number(product.piecesPerCarton || 0);
  const available = totalPieces(product);
  const remaining = available - soldPieces;
  // Convert the remaining pieces back into whole cartons + loose pieces.
  const cartons = Math.floor(remaining / per);
  const loose = remaining - cartons * per;
  return { ...product, stockQty: cartons, loosePieces: loose };
}

/** Decide what happens when an item is added to the bill. */
export function resolveDepletedStockAction(
  product: Pick<Product, 'kind' | 'category' | 'stockQty' | 'piecesPerCarton' | 'loosePieces'>,
  capabilities: Capability[] = []
): DepletedStockAction {
  if (isUncountedKind(product)) return 'add';
  const available = isPackProduct(product)
    ? totalPieces(product as Product)
    : product.stockQty;
  if (available > 0) return 'add';
  if (capabilities.includes('admin') || capabilities.includes('inventory')) return 'popup';
  return 'notify';
}
