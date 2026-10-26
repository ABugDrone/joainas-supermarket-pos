import { Category, Product, SaleRecord } from '../types';

/**
 * Legacy backup normalization.
 *
 * Prior releases mixed goods, services and edibles in one flat catalogue and
 * treated the single price as a minimum. Rabiu Entreprises treats every inventory
 * item as a Product, groups categories under the Products root, and treats a
 * legacy single price as a MAXIMUM. An explicit range (min < max, or a tier
 * floor below its ceiling) is preserved because it was deliberate.
 */

export const CURRENT_APP_VERSION = '2.0.6';

export interface BackupPayload {
  version?: string;
  appVersion?: string;
  appName?: string;
  products?: any[];
  categories?: any[];
  sales?: any[];
  customers?: any[];
  users?: any[];
  [key: string]: any;
}

const num = (value: any): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/** True when a payload predates 2.0.5 or was written by the old app names. */
export function isLegacyBackup(payload: BackupPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return true;

  const name = String(payload.appName ?? payload.app ?? payload.appTitle ?? '').toLowerCase();
  if (name.includes('dirms') || name.includes('senior citizen') || name.includes('storebox')) {
    return true;
  }

  const raw = String(payload.appVersion ?? payload.version ?? '');
  if (!raw.trim()) return true;
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return true;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major !== 2) return major < 2;
  if (minor !== 0) return minor < 0;
  return patch < 5;
}

function hasExplicitPriceRange(product: any): boolean {
  const min = num(product?.minPrice);
  const max = num(product?.retailPrice);
  if (min > 0 && max > 0 && min < max) return true;

  const tiers = Array.isArray(product?.priceTiers) ? product.priceTiers : [];
  return tiers.some((tier: any) => {
    const floor = num(tier?.floor);
    const ceiling = num(tier?.ceiling);
    return floor > 0 && ceiling > 0 && floor < ceiling;
  });
}

function normalizeLegacyProduct(product: any, categoryMap: Map<string, string>): any {
  if (!product || typeof product !== 'object') return product;

  const next: any = { ...product };
  next.kind = 'product';

  const oldCategory = String(product.category ?? '').trim();
  next.category = categoryMap.get(oldCategory.toLowerCase()) || oldCategory || 'Groceries';
  next.barcode = String(product.barcode ?? '');
  next.name = String(product.name ?? 'Unnamed item');
  next.unit = product.unit || 'piece';
  next.costPrice = num(product.costPrice);
  next.wholesalePrice = num(product.wholesalePrice);
  // Strict numeric stock: never-string, never NaN.
  next.stockQty = Number.isFinite(product.stockQty) ? Math.trunc(product.stockQty) : 0;
  next.reorderLevel = num(product.reorderLevel);

  if (hasExplicitPriceRange(product)) {
    next.retailPrice = num(product.retailPrice);
    next.minPrice = num(product.minPrice) > 0 ? num(product.minPrice) : undefined;
  } else {
    // A legacy single price is the maximum. If only a min was recorded it
    // becomes the max; the product is then discountable (no floor).
    const tierCeilings = Array.isArray(product.priceTiers)
      ? product.priceTiers.map((tier: any) => num(tier?.ceiling)).filter((n: number) => n > 0)
      : [];
    const max = Math.max(num(product.retailPrice), num(product.minPrice), ...tierCeilings);
    next.retailPrice = max;
    next.minPrice = undefined;
    if (Array.isArray(product.priceTiers)) {
      next.priceTiers = product.priceTiers.map((tier: any) => ({
        ...tier,
        floor: undefined,
        minQty: num(tier?.minQty) || 1,
        maxQty: tier?.maxQty === null || tier?.maxQty === undefined ? null : num(tier.maxQty),
        ceiling: num(tier?.ceiling),
      }));
    }
  }

  return next;
}

function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

/**
 * Normalize a legacy JSON backup in place-safe fashion (returns a clone).
 * 2.0.5 payloads are returned unchanged.
 */
export function normalizeLegacyBackup(payload: BackupPayload): BackupPayload {
  if (!isLegacyBackup(payload)) return payload;

  const result: BackupPayload = { ...payload };
  const categoryMap = new Map<string, string>();
  const existingNames = new Set<string>();
  const categories: Category[] = [];

  const pushCategory = (raw: any, fallbackName?: string) => {
    const originalName = String(raw?.name ?? fallbackName ?? 'Groceries').trim() || 'Groceries';

    // Legacy service/edible categories would keep triggering uncounted
    // treatment. They become Product categories, renamed to avoid ambiguity.
    let name = originalName;
    if (/^services$/i.test(originalName)) name = 'Services (Legacy)';
    if (/^edibles$/i.test(originalName)) name = 'Edibles (Legacy)';

    categoryMap.set(originalName.toLowerCase(), name);
    const nameKey = name.toLowerCase();
    if (existingNames.has(nameKey)) return;
    existingNames.add(nameKey);

    categories.push({
      id: String(raw?.id ?? `legacy-cat-${categorySlug(name)}`),
      name,
      color: String(raw?.color ?? '#6366f1'),
      description: raw?.description,
      kind: 'product',
      parentRoot: 'Products',
      createdAt: raw?.createdAt,
    });
  };

  const sourceCategories = Array.isArray(payload.categories) ? payload.categories : [];
  sourceCategories.forEach((category) => pushCategory(category));

  const products = (Array.isArray(payload.products) ? payload.products : [])
    .filter((product) => product && typeof product === 'object')
    .map((product, index) => {
      const oldCategory = String(product.category ?? '').trim() || 'Groceries';
      if (!categoryMap.has(oldCategory.toLowerCase())) {
        pushCategory(null, oldCategory);
      }
      const normalized = normalizeLegacyProduct(product, categoryMap);
      if (!normalized.id) normalized.id = `legacy-product-${index}-${categorySlug(normalized.name)}`;
      return normalized;
    });

  const sales = (Array.isArray(payload.sales) ? payload.sales : []).map((sale: SaleRecord) => {
    if (!sale || !Array.isArray((sale as any).items)) return sale;
    return {
      ...sale,
      items: (sale as any).items.map((item: any) => {
        if (!item || !item.product) return item;
        const oldCategory = String(item.product.category ?? '').trim() || 'Groceries';
        if (!categoryMap.has(oldCategory.toLowerCase())) pushCategory(null, oldCategory);
        return { ...item, product: normalizeLegacyProduct(item.product, categoryMap) };
      }),
    };
  });

  result.products = products;
  result.categories = categories;
  result.sales = sales;
  result.version = CURRENT_APP_VERSION;
  result.appVersion = CURRENT_APP_VERSION;
  result.appName = 'Rabiu Entreprises';
  return result;
}

/** Strict backup validation: every product needs a real numeric stockQty. */
export function isValidBackupPayload(parsed: any): boolean {
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    Array.isArray(parsed.products) &&
    Array.isArray(parsed.customers) &&
    Array.isArray(parsed.sales) &&
    parsed.products.every(
      (product: any) =>
        !!product &&
        typeof product === 'object' &&
        typeof product.stockQty === 'number' &&
        Number.isFinite(product.stockQty)
    )
  );
}

/**
 * Add only genuinely-new products. Live products are never modified (their
 * stockQty is the source of truth). Dedupe by ID *and* barcode, including
 * duplicates inside the backup itself.
 */
export function mergeBackupProducts(
  live: Product[],
  incoming: any[]
): { products: Product[]; added: Product[] } {
  const liveIds = new Set(live.map((p) => p.id));
  const liveBarcodes = new Set(live.map((p) => p.barcode).filter(Boolean));
  const seenIds = new Set<string>();
  const seenBarcodes = new Set<string>();
  const added: Product[] = [];

  for (const candidate of incoming || []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = String(candidate.id ?? '');
    const barcode = String(candidate.barcode ?? '');
    if (!id) continue;
    if (liveIds.has(id) || seenIds.has(id)) continue;
    if (barcode && (liveBarcodes.has(barcode) || seenBarcodes.has(barcode))) continue;

    seenIds.add(id);
    if (barcode) seenBarcodes.add(barcode);
    added.push(candidate as Product);
  }

  return { products: added.length > 0 ? [...live, ...added] : live, added };
}
