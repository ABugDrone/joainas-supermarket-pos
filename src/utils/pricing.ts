import { Product } from '../types';
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
