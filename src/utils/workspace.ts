import { CartItem, PriceTier, Product } from '../types';
import { getCeilingFor, getFloorFor } from './pricing';

// ============================================================
// PER-USER WORKSPACE CONTINUITY (v1.4.7)
// When sleep (or manual sign-out) logs an account out, any ongoing work —
// sell-service bill, inventory draft, active module — is snapshotted PER
// USER. A different user can log in and work cleanly; when the first user
// returns, their workspace is restored exactly where they left it.
//
// Storage: synchronous per-user localStorage keys (fast enough for logout
// and sleep paths). Cart lines reference products by id and are reconciled
// against the CURRENT catalog on restore (deleted → dropped, qty → clamped
// to stock, rate → kept when still inside min–max else clamped to max).
// ============================================================

export interface WorkspaceCartLine {
  productId: string;
  quantity: number;
  rate: number;
  priceType: 'retail' | 'wholesale';
  ceilingAtSale?: number;
  floorAtSale?: number;
  allowNegativeStock?: boolean;
}

export interface PosWorkspace {
  cart: WorkspaceCartLine[];
  customerId?: string;
  paymentMethod?: string;
  cashAmount?: number;
  transferAmount?: number;
  paymentNote?: string;
}

export interface InventoryDraft {
  modalOpen: boolean;
  editingProductId: string | null;
  formData: {
    barcode?: string;
    name?: string;
    category?: string;
    unit?: Product['unit'];
    costPrice?: number;
    retailPrice?: number;
    minPrice?: number;
    wholesalePrice?: number;
    priceTiers?: PriceTier[];
    stockQty?: number;
    reorderLevel?: number;
  };
}

export interface WorkspaceSnapshot {
  version: 1;
  userId: string;
  username: string;
  savedAt: number;
  activeTab?: string;
  pos?: PosWorkspace | null;
  inventoryDraft?: InventoryDraft | null;
}

const WS_PREFIX = 'senior_citizen_accessories_workspace_v1_';

const wsKey = (userId: string): string => `${WS_PREFIX}${userId}`;

export function saveWorkspace(userId: string, ws: WorkspaceSnapshot): void {
  if (!userId) return;
  try {
    localStorage.setItem(wsKey(userId), JSON.stringify({ ...ws, savedAt: Date.now(), version: 1 }));
  } catch (e) {
    console.error('Workspace save failed', e);
  }
}

export function loadWorkspace(userId: string): WorkspaceSnapshot | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(wsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    if (!parsed || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkspace(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(wsKey(userId));
  } catch {}
}

export function cartToLines(cart: CartItem[]): WorkspaceCartLine[] {
  return cart.map((it) => ({
    productId: it.product.id,
    quantity: it.quantity,
    rate: it.rate,
    priceType: it.priceType,
    ceilingAtSale: it.ceilingAtSale,
    floorAtSale: it.floorAtSale,
    allowNegativeStock: it.allowNegativeStock,
  }));
}

// Rebuild live CartItems from saved lines against the current catalog.
// Policy (confirmed): keep the saved rate when still inside the CURRENT
// min–max for that quantity, otherwise clamp to the current max.
export function reconcileCart(
  lines: WorkspaceCartLine[],
  products: Product[]
): { items: CartItem[]; notes: string[] } {
  const items: CartItem[] = [];
  const notes: string[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const ln of lines || []) {
    const prod = byId.get(ln.productId);
    if (!prod) {
      notes.push('One saved bill line was removed (product no longer exists).');
      continue;
    }
    if (prod.stockQty <= 0 && !ln.allowNegativeStock) {
      notes.push(`"${prod.name}" is now out of stock — removed from the restored bill.`);
      continue;
    }
    const maxQty = ln.allowNegativeStock ? Number.MAX_SAFE_INTEGER : prod.stockQty;
    const qty = Math.max(1, Math.min(Math.trunc(ln.quantity) || 1, maxQty));
    if (qty !== ln.quantity) {
      notes.push(`"${prod.name}" qty adjusted to available stock (${qty}).`);
    }
    const ceiling = getCeilingFor(prod, qty);
    const floor = getFloorFor(prod, qty);
    let rate = Number.isFinite(ln.rate) && ln.rate > 0 ? ln.rate : ceiling;
    if (rate > ceiling) {
      rate = ceiling;
      notes.push(`"${prod.name}" price adjusted to current max ${ceiling.toLocaleString()}.`);
    } else if (floor > 0 && rate < floor) {
      rate = floor;
      notes.push(`"${prod.name}" price adjusted to current min ${floor.toLocaleString()}.`);
    }
    items.push({
      product: prod,
      quantity: qty,
      priceType: 'retail',
      rate,
      ceilingAtSale: ceiling,
      floorAtSale: floor,
      allowNegativeStock: ln.allowNegativeStock,
      amount: qty * rate,
    });
  }
  // De-dupe identical adjustment notes.
  return { items, notes: Array.from(new Set(notes)) };
}
