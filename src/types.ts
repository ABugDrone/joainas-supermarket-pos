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
}

export interface CartItem {
  product: Product;
  quantity: number;
  priceType: PriceType;
  rate: number;
  ceilingAtSale?: number; // snapshot of max allowed price at time of sale
  floorAtSale?: number;
  /** Explicitly allow this line to drive stock below zero (depleted-stock flow). */
  allowNegativeStock?: boolean;
  amount: number;
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
  printDensity: 'Normal' | 'High' | 'Draft';
  printerName: string;
}

export interface StoreDeveloperInfo {
  company: string;
  email: string;
  phone: string;
  appVersion: string;
}
