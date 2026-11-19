import { Product, CartItem } from '../types';
import { formatMoney } from './currency';

/**
 * Sentinel ceiling for a product that only has a minimum price. Using a
 * finite number (instead of Infinity) keeps JSON/SQLite snapshots valid while
 * still allowing any realistic selling price above the floor.
 */
export const NO_CEILING = 999_999_999;

function tierFor(product: Product, qty: number) {
  if (!product.priceTiers || product.priceTiers.length === 0) return null;
  return (
    product.priceTiers.find((t) => {
      const max = t.maxQty === null || t.maxQty === undefined ? Infinity : t.maxQty;
      return qty >= t.minQty && qty <= max;
    }) || null
  );
}

export function getCeilingFor(product: Product, qty: number): number {
  const tier = tierFor(product, qty);
  if (tier) return tier.ceiling;
  if (product.retailPrice > 0) return product.retailPrice;
  // Min-only product: the floor is set, the ceiling is open.
  if (product.minPrice !== undefined && product.minPrice !== null && product.minPrice > 0) {
    return NO_CEILING;
  }
  return 0;
}

export function getFloorFor(product: Product, qty: number): number {
  const tier = tierFor(product, qty);
  if (tier && tier.floor !== undefined && tier.floor !== null && tier.floor > 0) {
    return tier.floor;
  }
  // No min means no floor (max-only products may be discounted).
  if (product.minPrice !== undefined && product.minPrice !== null && product.minPrice > 0) {
    return product.minPrice;
  }
  return 0;
}

/** Sensible starting rate when an item is added to the bill. */
export function getDefaultRate(product: Product, qty: number = 1): number {
  const tier = tierFor(product, qty);
  if (tier) return tier.ceiling;
  if (product.retailPrice > 0) return product.retailPrice;
  if (product.minPrice !== undefined && product.minPrice !== null && product.minPrice > 0) {
    return product.minPrice;
  }
  return 0;
}

export function validateUnitPrice(rate: number, ceiling: number, floor: number = 0, code?: string | null): string | null {
  if (!Number.isFinite(rate) || rate < 0) return 'Price must be a valid number';
  if (rate === 0) return 'Price cannot be zero';
  if (ceiling > 0 && ceiling < NO_CEILING && rate > ceiling) {
    return `Price cannot exceed preset max ${formatMoney(ceiling, code)}`;
  }
  if (floor > 0 && rate < floor) return `Price cannot be below preset min ${formatMoney(floor, code)}`;
  return null;
}

/**
 * Price label:
 *  - quantity tiers        -> "n tiers"
 *  - explicit min < max    -> "min – max"
 *  - min only              -> "min+"  (sellable at min or higher)
 *  - max only              -> "max"   (no suffix, discountable)
 *  - neither               -> zero
 */
export function formatRange(product: Product, code?: string | null): string {
  if (product.priceTiers && product.priceTiers.length > 0) {
    return `${product.priceTiers.length} tiers`;
  }
  const min = product.minPrice;
  const max = product.retailPrice;
  const hasMin = min !== undefined && min !== null && Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;

  if (hasMin && hasMax && (min as number) < max) {
    return `${formatMoney(min as number, code)} – ${formatMoney(max, code)}`;
  }
  if (hasMin && !hasMax) {
    return `${formatMoney(min as number, code)}+`;
  }
  if (hasMax) {
    return formatMoney(max, code);
  }
  return formatMoney(0, code);
}

/** Cutoff: sales on/before Sept 10 2026 are legacy records shown as a
 *  single sold price (no range). */
export const LEGACY_SALE_CUTOFF = '2026-09-10';

export function isLegacySale(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) <= LEGACY_SALE_CUTOFF;
}

/** A past sale always shows the price the customer actually paid. Product
 *  ranges belong on the product, not on a historical receipt line. */
export function formatSaleRate(soldRate: number, _currentMax: number, _saleDate?: string, code?: string | null): string {
  if (!Number.isFinite(soldRate) || soldRate <= 0) return '—';
  return formatMoney(soldRate, code);
}

export function formatSoldRange(soldRate: number, _currentMax: number, code?: string | null): string {
  if (!Number.isFinite(soldRate) || soldRate <= 0) return '—';
  return formatMoney(soldRate, code);
}

// ---------------------------------------------------------------------------
// v2.0.8 — dual-ladder pricing for carton/pack products.
// The existing fields above describe the WHOLE carton/pack. These helpers
// describe ONE loose piece. Old catalogues without piece prices fall back to
// the carton price divided by piecesPerCarton, so nothing changes for them.
// ---------------------------------------------------------------------------

export function hasPiecePricing(product: Product): boolean {
  return !!product && (
    Number(product.pieceRetailPrice || 0) > 0 ||
    Number(product.pieceMinPrice || 0) > 0 ||
    (product.piecePriceTiers?.length || 0) > 0
  );
}

/** A product-shaped view whose price fields are the per-piece ladder. */
export function asPieceProduct(product: Product): Product {
  return {
    ...product,
    costPrice: Number(product.pieceCostPrice || 0),
    minPrice: product.pieceMinPrice,
    retailPrice: Number(product.pieceRetailPrice || 0),
    priceTiers: product.piecePriceTiers,
  };
}

function perCarton(product: Product): number {
  const per = Number(product.piecesPerCarton || 0);
  return per > 0 ? per : 1;
}

export function getPieceCeilingFor(product: Product, qty: number = 1): number {
  if (hasPiecePricing(product)) return getCeilingFor(asPieceProduct(product), qty);
  return Number(product.retailPrice || 0) / perCarton(product);
}

export function getPieceFloorFor(product: Product, qty: number = 1): number {
  if (hasPiecePricing(product)) return getFloorFor(asPieceProduct(product), qty);
  return Number(product.minPrice || 0) / perCarton(product);
}

export function getPieceDefaultRate(product: Product, qty: number = 1): number {
  if (hasPiecePricing(product)) return getDefaultRate(asPieceProduct(product), qty);
  if (Number(product.retailPrice || 0) > 0) return Number(product.retailPrice) / perCarton(product);
  return Number(product.minPrice || 0) / perCarton(product);
}

/** Human-readable dual-ladder breakdown for a carton/piece sale line. */
export function formatCartonPieceBreakdown(item: CartItem, code?: string | null): string {
  const parts: string[] = [];
  const unit = item.product.unit === 'pack' ? 'pack' : 'carton';
  if (Number(item.cartonQty || 0) > 0) {
    parts.push(`${item.cartonQty} ${unit}${item.cartonQty === 1 ? '' : 's'} × ${formatMoney(item.cartonRate || 0, code)}`);
  }
  if (Number(item.pieceQty || 0) > 0) {
    parts.push(`${item.pieceQty} pc${item.pieceQty === 1 ? '' : 's'} × ${formatMoney(item.pieceRate || 0, code)}`);
  }
  return parts.join(' + ');
}

/** Tiny sub-label used in inventory and POS: "Cost 4,000 · Min 4,500 · Max 5,000" */
export function formatPiecePriceDetail(product: Product, code?: string | null): string {
  const parts: string[] = [];
  const cost = Number(hasPiecePricing(product) ? product.pieceCostPrice || 0 : Number(product.costPrice || 0) / perCarton(product));
  const min = getPieceFloorFor(product, 1);
  const max = getPieceCeilingFor(product, 1);
  if (cost > 0) parts.push(`Cost ${formatMoney(cost, code)}`);
  if (min > 0 && min < NO_CEILING) parts.push(`Min ${formatMoney(min, code)}`);
  if (max > 0 && max < NO_CEILING) parts.push(`Max ${formatMoney(max, code)}`);
  return parts.join(' · ');
}
