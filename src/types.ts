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
  description?: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string; // Dynamic store categories managed by Admin
  unit: 'kg' | 'pack' | 'carton' | 'bottle' | 'piece' | 'bag';
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  stockQty: number;
  reorderLevel: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  priceType: PriceType;
  rate: number;
  amount: number;
}

export type CustomerAccountType = 'individual' | 'company' | 'ngo' | 'government';

export interface Customer {
  id: string;
  fullName: string;
  accountType: CustomerAccountType;
  phone?: string;
  address: string;
  balance: number; // positive = customer owes store, negative = advance store credit
  points: number;
  advancePayment: number;
  assignedCashier?: string; // staff who registered/serves this customer
  createdAt: string;
}

export interface SaleRecord {
  id: string;
  receiptNo: string;
  items: CartItem[];
  subtotal: number;
  totalAmount: number;
  advancePayment: number; // amount paid by cash/transfer
  balanceDue: number; // totalAmount - advancePayment
  paymentMethod: 'Cash' | 'POS Transfer' | 'Store Credit / Account' | 'Split Payment';
  priceType: PriceType;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  pointsEarned: number;
  cashier: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
}

export interface Expenditure {
  id: string;
  description: string;
  category: 'Cold Room & Power' | 'Transport & Freight' | 'Salaries & Staff' | 'Packaging & Bags' | 'Maintenance' | 'Miscellaneous';
  amount: number;
  date: string; // YYYY-MM-DD
  createdBy: string;
}

export interface ThermalPrinterConfig {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  receiptHeaderNote: string;
  receiptFooterNote: string;
  showLogo: boolean;
  paperWidth: '80mm' | '58mm';
  autoPrintOnSale: boolean;
  pointRate: number; // e.g. 2 points per 1000 Naira
  printDensity: 'Normal' | 'High' | 'Draft';
}

export interface StoreDeveloperInfo {
  company: string;
  email: string;
  phone: string;
  appVersion: string;
}
