export type PriceType = 'retail' | 'wholesale';

export type UserRole = 'System Admin' | 'Store Manager' | 'Cashier' | 'Inventory Staff' | 'Accountant';

// Granular access capabilities granted per account. Admin can tick any
// combination for each staff user; nav items and actions are gated by these.
export type Capability =
  | 'sell'
  | 'inventory'
  | 'view_sales'
  | 'customers'
  | 'view_reports'
  | 'expenses'
  | 'printer_settings'
  | 'receipts'
  | 'admin';

// Preset bundles so the admin can quickly assign sensible role combinations.
export const CAPABILITY_PRESETS: Record<string, Capability[]> = {
  'System Admin': [
    'sell',
    'inventory',
    'view_sales',
    'customers',
    'view_reports',
    'expenses',
    'printer_settings',
    'receipts',
    'admin',
  ],
  'Store Manager': [
    'sell',
    'inventory',
    'view_sales',
    'customers',
    'view_reports',
    'expenses',
    'printer_settings',
    'receipts',
  ],
  Cashier: ['sell', 'view_sales', 'customers', 'receipts', 'printer_settings'],
  'Inventory Staff': ['inventory', 'customers', 'receipts'],
  Accountant: ['view_sales', 'view_reports', 'expenses', 'receipts'],
};

export interface User {
  id: string;
  fullName: string;
  username: string;
  password?: string;
  role: UserRole;
  capabilities: Capability[];
  status: 'active' | 'suspended';
  createdAt: string;
  lastLogin?: string;
}

export interface AuditLog {
  id: string;
  username: string;
  userRole: UserRole;
  action: string;
  details: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
}

export interface Category {
  id: string;
  name: string;
  color: string; // hex color for grid classification, e.g. '#14b8a6'
  description?: string;
  kind?: ProductKind; // groups every sub-category under Products | Services | Edibles
  parentRoot?: 'Products' | 'Services' | 'Edibles';
  createdAt?: string;
}

export interface PriceTier {
  id: string;
  minQty: number;
  maxQty: number | null; // null = no upper limit
  ceiling: number; // max allowed unit price for this quantity
  floor?: number;
  label?: string;
}

export type ProductUnit =
  | 'kg' | 'pack' | 'carton' | 'bottle' | 'piece' | 'bag'
  | 'plate' | 'page' | 'hour' | 'day' | 'week' | 'month' | 'year'
  | 'job' | 'contract' | 'measure' | 'yard' | 'litre' | 'gallon'
  | 'design' | 'portion' | 'serving' | 'bowl' | 'wrap';

export const GOODS_UNITS: ProductUnit[] = ['kg', 'pack', 'carton', 'bottle', 'piece', 'bag', 'litre', 'gallon', 'yard', 'plate'];
export const SERVICE_UNITS: ProductUnit[] = ['design', 'job', 'contract', 'hour', 'day', 'week', 'month', 'year', 'page', 'measure', 'piece'];
export const EDIBLE_UNITS: ProductUnit[] = ['plate', 'portion', 'serving', 'bowl', 'wrap'];

export type ProductKind = 'product' | 'service' | 'edible';

export const isServiceKind = (p: { kind?: ProductKind; category?: string }): boolean =>
  p.kind !== undefined && p.kind !== null
    ? p.kind === 'service'
    : (p.category || '').toLowerCase() === 'services';

// Edibles (restaurant plates & servings): semi-tangible, perishable, consumed
// on the spot — treated exactly like services everywhere stock matters
// (never low/out of stock, uncounted, asset value = highest price × 1).
export const isEdibleKind = (p: { kind?: ProductKind; category?: string }): boolean =>
  p.kind !== undefined && p.kind !== null
    ? p.kind === 'edible'
    : (p.category || '').toLowerCase() === 'edibles';

// Anything the shop never counts: services + edibles.
export const isUncountedKind = (p: { kind?: ProductKind; category?: string }): boolean =>
  isServiceKind(p) || isEdibleKind(p);

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string; // Dynamic store categories managed by Admin
  kind?: ProductKind; // product (stock-tracked) vs service/edible (never low/out of stock)
  unit: ProductUnit;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  minPrice?: number; // floor for single unit — when unset, 0
  priceTiers?: PriceTier[]; // quantity-dependent ceilings; empty = single range mode
  stockQty: number;
  reorderLevel: number;
  /**
   * v2.0.8 — Wholesale carton/pack support.
   * piecesPerCarton > 0 means this product is stocked in cartons/packs.
   * stockQty is then the number of whole cartons and loosePieces is the
   * remainder. Total sellable pieces = stockQty * piecesPerCarton + loosePieces.
   */
  piecesPerCarton?: number;
  loosePieces?: number;
  /**
   * v2.0.8 dual-ladder pricing. The fields above describe the WHOLE
   * carton/pack; these describe ONE loose piece. When unset, POS falls back
   * to the carton price divided by piecesPerCarton so old catalogues still
   * sell correctly.
   */
  pieceCostPrice?: number;
  pieceMinPrice?: number;
  pieceRetailPrice?: number;
  piecePriceTiers?: PriceTier[];
}

/** Units that represent a bundle of pieces (carton / pack). */
export const PACK_UNITS: ProductUnit[] = ['carton', 'pack'];
export const isPackUnit = (unit?: ProductUnit): boolean =>
  !!unit && PACK_UNITS.includes(unit);

/** True when a product uses carton/pack + pieces accounting. */
export const isPackProduct = (p: { piecesPerCarton?: number }): boolean =>
  Number(p.piecesPerCarton || 0) > 0;

/** Total sellable pieces for a product (cartons converted + loose pieces). */
export const totalPieces = (p: {
  stockQty: number;
  piecesPerCarton?: number;
  loosePieces?: number;
}): number => {
  const per = Number(p.piecesPerCarton || 0);
  if (per <= 0) return Number(p.stockQty || 0);
  return Number(p.stockQty || 0) * per + Number(p.loosePieces || 0);
};

/**
 * v2.0.8 — low-stock test shared by Inventory, POS and the notification bell.
 * For pack products reorderLevel is in CARTONS; the comparison is done in
 * pieces so 0 cartons + a few loose pieces still counts as low.
 */
export const isLowStock = (p: {
  stockQty: number;
  reorderLevel: number;
  piecesPerCarton?: number;
  loosePieces?: number;
  kind?: ProductKind;
  category?: string;
}): boolean => {
  if (isUncountedKind(p)) return false;
  const per = Number(p.piecesPerCarton || 0);
  if (per > 0) return totalPieces(p) <= Number(p.reorderLevel || 0) * per;
  return Number(p.stockQty || 0) <= Number(p.reorderLevel || 0);
};

/** Human-readable stock breakdown, e.g. "97 cartons + 6 pieces". */
export const formatStock = (p: {
  stockQty: number;
  unit: ProductUnit;
  piecesPerCarton?: number;
  loosePieces?: number;
}): string => {
  const per = Number(p.piecesPerCarton || 0);
  if (per <= 0) return `${p.stockQty} ${p.unit}`;
  const loose = Number(p.loosePieces || 0);
  const cartonWord = p.unit === 'pack' ? 'pack' : 'carton';
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (loose <= 0) return plural(p.stockQty, cartonWord);
  if (Number(p.stockQty || 0) <= 0) return plural(loose, 'piece');
  return `${plural(p.stockQty, cartonWord)} + ${plural(loose, 'piece')}`;
};

export interface CartItem {
  product: Product;
  quantity: number; // total pieces (cartons converted + loose) for pack products
  priceType: PriceType;
  rate: number; // per-piece rate for pack products
  ceilingAtSale?: number; // snapshot of max allowed unit price at time of sale
  floorAtSale?: number;
  /** Explicitly allow this line to drive stock below zero (depleted-stock flow). */
  allowNegativeStock?: boolean;
  amount: number;
  /** v2.0.8 carton/pack breakdown */
  cartonQty?: number; // whole cartons/packs sold on this line
  pieceQty?: number; // loose pieces sold on this line
  piecesPerCarton?: number; // snapshot of pieces per carton at sale time
  saleUnitLabel?: string; // e.g. "2 cartons + 6 pieces" for the receipt
  /** v2.0.8 dual-ladder: which unit(s) this line was sold in */
  saleMode?: 'carton' | 'piece' | 'both';
  cartonRate?: number; // price of ONE carton/pack on this line
  pieceRate?: number; // price of ONE loose piece on this line
  cartonCeiling?: number;
  cartonFloor?: number;
  pieceCeiling?: number;
  pieceFloor?: number;
  /**
   * v2.1.0 — per-product percentage discount / seasonal coupon.
   * `amount` stays the GROSS line total; these fields are additive so every
   * sale saved before v2.1.0 still reads with zero discount.
   */
  discountPercent?: number; // 0–100, e.g. 10 for a festive 10% off
  couponCode?: string; // optional name/code, e.g. "XMAS10"
  lineDiscountAmount?: number; // money taken off THIS line
  netAmount?: number; // gross minus this line's discount
}

export type CustomerAccountType = 'individual' | 'company' | 'ngo' | 'government';

export interface Customer {
  id: string;
  fullName: string;
  accountType: CustomerAccountType;
  phone?: string;
  address: string;
  nin?: string; // optional identity verification
  bvn?: string; // optional identity verification
  balance: number; // positive = customer owes store, negative = advance store credit
  points: number;
  advancePayment: number;
  assignedCashier?: string; // staff who registered/serves this customer
  createdAt: string;
  /** v2.0.8 — optional date by which this customer's debt should be settled. */
  settlementDate?: string;
  /** v2.0.8 — the built-in walk-in customer cannot be deleted. */
  isGeneral?: boolean;
}

export type ContractStatus = 'INSTALLMENT_ACTIVE' | 'COMPLETED';

export interface InstallmentContract {
  id: string;
  customerId: string;
  contractCode: string;
  productLabel: string; // device model / product or service description
  purchaseDate: string; // YYYY-MM-DD
  totalPrice: number; // agreed contract value
  downPayment: number; // initial payment
  totalPaid: number; // down payment + cumulative micro-payments
  pendingBalance: number; // totalPrice - totalPaid
  status: ContractStatus;
  dueDate?: string;
  downRemitted: boolean; // down payment remitted to office?
  createdBy?: string;
  createdAt: string;
  currency?: string;
}

export interface MicroPayment {
  id: string;
  contractId: string;
  customerId: string;
  amount: number;
  collectedAt: number; // epoch ms timestamp
  receiptNote?: string;
  remitted: boolean; // remitted to office vs pending office transfer
  createdBy?: string;
}

export type PaymentMethod = 'Cash' | 'Transfer' | 'POS/Card' | 'Cash + Transfer' | 'Store Credit / Account' | 'POS Transfer' | 'Split Payment';

export interface SaleRecord {
  id: string;
  receiptNo: string;
  items: CartItem[];
  subtotal: number;
  totalAmount: number;
  advancePayment: number; // amount paid by cash/transfer
  balanceDue: number; // totalAmount - advancePayment
  paymentMethod: PaymentMethod;
  // For Cash + Transfer split — manually entered by cashier
  cashAmount?: number;
  transferAmount?: number;
  paymentNote?: string; // mini report, e.g. "Over-transfer N2,000 given as cash change"
  priceType: PriceType;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  pointsEarned: number;
  cashier: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  /** ISO code stamped at creation (v1.6.0). Missing = NGN (pre-currency rows). */
  currency?: string;
  /**
   * v2.0.6: true when the sale was completed by a non-admin session under a
   * clock FLASHALERT. The ADMIN should reconcile this row against stock/cash
   * after verifying the trusted clock.
   */
  clockOverride?: boolean;
  /** v2.0.8 — cash sale discount (fixed amount subtracted from the total). */
  cashDiscount?: number;
  /** v2.0.8 — whether this sale was paid in full or put on the customer's credit. */
  paymentMode?: 'full' | 'credit';
  /**
   * v2.1.0 — percentage discount / seasonal coupon totals.
   * All optional and additive: legacy rows simply have no percentage fields.
   */
  grossSubtotal?: number; // sum of item.amount before ANY discount
  itemDiscountTotal?: number; // sum of the per-product % deductions
  billDiscountPercent?: number; // whole-bill % (0–100)
  billDiscountAmount?: number; // money taken off by the whole-bill %
  billCouponCode?: string; // optional coupon name/code for the whole bill
  totalDiscount?: number; // grossSubtotal - totalAmount
}

/** v2.0.8 — one line in the customer debt notebook. */
export interface DebtEntry {
  id: string;
  customerId: string;
  /** 'charge' = red + (debt added), 'payment' = green - (debt paid off). */
  kind: 'charge' | 'payment';
  amount: number;
  /** Where the debt/payment came from. */
  source: 'sale' | 'cash' | 'manual';
  note?: string;
  receiptNo?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  /** Optional settlement date — reminder starts the day before. */
  settlementDate?: string;
  /** True once the debt this entry represents has been settled. */
  settled?: boolean;
  createdBy?: string;
}

export interface Expenditure {
  id: string;
  description: string;
  category: 'Cold Room & Power' | 'Transport & Freight' | 'Salaries & Staff' | 'Packaging & Bags' | 'Maintenance' | 'Miscellaneous';
  amount: number;
  date: string; // YYYY-MM-DD
  createdBy: string;
  /** ISO code stamped at creation (v1.6.0). Missing = NGN (pre-currency rows). */
  currency?: string;
}

export const MANDATORY_RECEIPT_FOOTER =
  'Copyright of DroneBug Technologies & Services. All rights reserved 2026 (Contact: +2347035716349)';

export interface ThermalPrinterConfig {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  receiptHeaderNote: string;
  receiptFooterNote: string;
  showLogo: boolean;
  logoDataUrl?: string; // optional custom business logo; fallback /logo.png then storeName
  businessName?: string;
  paperWidth: '80mm' | '58mm';
  autoPrintOnSale: boolean;
  pointRate: number; // e.g. 2 points per 1000 Naira
  printerName: string;
}

export interface StoreDeveloperInfo {
  company: string;
  email: string;
  phone: string;
  appVersion: string;
}
