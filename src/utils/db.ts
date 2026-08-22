import Database from '@tauri-apps/plugin-sql';
import {
  Product,
  Customer,
  SaleRecord,
  CartItem,
  Expenditure,
  ThermalPrinterConfig,
  User,
  AuditLog,
  Category,
} from '../types';

// Tauri runtime detection — the SQL plugin only exists inside the desktop shell.
export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let db: Database | null = null;
let dbPromise: Promise<Database | null> | null = null;

let cachedDbUrl: string | null = null;
let cachedDbInfo: { url: string; folder: string; migrated: boolean } | null = null;

export async function getDbInfo(): Promise<{ url: string; folder: string; migrated: boolean } | null> {
  if (!isTauriRuntime()) return null;
  if (cachedDbInfo) return cachedDbInfo;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedDbInfo = await invoke('get_db_info');
    return cachedDbInfo;
  } catch (e) {
    console.error('Failed to read database location', e);
    return null;
  }
}

export async function getDbUrl(): Promise<string> {
  if (!isTauriRuntime()) return 'sqlite:joainas_pos.db';
  const info = await getDbInfo();
  return info ? info.url : 'sqlite:joainas_pos.db';
}

export async function openDb(url: string): Promise<Database | null> {
  const next = await Database.load(url);
  try {
    await next.execute('PRAGMA journal_mode = WAL');
  } catch (e) {
    console.error('Failed to enable WAL mode', e);
  }
  try {
    await next.execute('PRAGMA foreign_keys = ON');
  } catch (e) {
    console.error('Failed to enable foreign keys', e);
  }
  // The schema is bootstrapped idempotently on every connection instead of via
  // sqlx migrations — older builds edited migration v1's SQL which broke the
  // checksum/dirty checks on existing databases and even on fresh installs.
  // Running it here keeps old databases working and existing data safe.
  await bootstrapSchema(next);
  return next;
}

// ============================================================
// IDEMPOTENT SCHEMA BOOTSTRAP
// Creates every table/index it needs and adds any columns that may be
// missing on databases created by older app versions. Safe to run on
// every connection — it never deletes or rewrites existing data.
// ============================================================

const SCHEMA_CREATES: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('System Admin', 'Store Manager', 'Cashier', 'Inventory Staff', 'Accountant')) NOT NULL DEFAULT 'Cashier',
    capabilities TEXT NOT NULL DEFAULT '[]',
    status TEXT CHECK(status IN ('active', 'suspended')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_name TEXT NOT NULL,
    unit TEXT CHECK(unit IN ('kg', 'pack', 'carton', 'bottle', 'piece', 'bag')) NOT NULL DEFAULT 'piece',
    cost_price REAL NOT NULL DEFAULT 0.0,
    retail_price REAL NOT NULL DEFAULT 0.0,
    wholesale_price REAL NOT NULL DEFAULT 0.0,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    account_type TEXT CHECK(account_type IN ('individual', 'company', 'ngo', 'government')) NOT NULL DEFAULT 'individual',
    phone TEXT,
    address TEXT,
    balance REAL NOT NULL DEFAULT 0.0,
    points INTEGER NOT NULL DEFAULT 0,
    advance_payment REAL NOT NULL DEFAULT 0.0,
    assigned_cashier TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_no TEXT UNIQUE NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0.0,
    total_amount REAL NOT NULL DEFAULT 0.0,
    advance_payment REAL NOT NULL DEFAULT 0.0,
    balance_due REAL NOT NULL DEFAULT 0.0,
    payment_method TEXT CHECK(payment_method IN ('Cash', 'Transfer', 'POS/Card', 'Cash + Transfer', 'Store Credit / Account', 'POS Transfer', 'Split Payment')) NOT NULL DEFAULT 'Cash',
    price_type TEXT CHECK(price_type IN ('retail', 'wholesale')) NOT NULL DEFAULT 'retail',
    customer_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    points_earned INTEGER NOT NULL DEFAULT 0,
    cash_amount REAL,
    transfer_amount REAL,
    payment_note TEXT,
    cashier_username TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    sale_time TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_type TEXT CHECK(price_type IN ('retail', 'wholesale')) NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenditures (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0.0,
    expense_date TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS printer_configs (
    id INTEGER PRIMARY KEY CHECK (id = 1) DEFAULT 1,
    store_name TEXT NOT NULL,
    tagline TEXT,
    address TEXT,
    phone TEXT,
    receipt_header_note TEXT,
    receipt_footer_note TEXT,
    show_logo BOOLEAN NOT NULL DEFAULT 1,
    paper_width TEXT CHECK(paper_width IN ('80mm', '58mm')) NOT NULL DEFAULT '80mm',
    auto_print_on_sale BOOLEAN NOT NULL DEFAULT 1,
    point_rate INTEGER NOT NULL DEFAULT 2,
    print_density TEXT CHECK(print_density IN ('Normal', 'High', 'Draft')) NOT NULL DEFAULT 'Normal',
    printer_name TEXT NOT NULL DEFAULT 'XP-80C',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    log_timestamp INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    log_time TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    adjustment_type TEXT NOT NULL,
    quantity_changed INTEGER NOT NULL,
    reason TEXT,
    adjusted_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
];

const SCHEMA_INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name)',
  'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
  'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_name)',
  'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
  'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name)',
  'CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_no)',
  'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)',
  'CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_username)',
  'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)',
  'CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_expenditures_date ON expenditures(expense_date)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(log_timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username)',
];

async function tableColumnNames(d: Database, table: string): Promise<string[]> {
  try {
    const rows = await d.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
    return rows.map((r) => r.name);
  } catch (e) {
    console.error(`Failed to inspect table "${table}"`, e);
    return [];
  }
}

async function ensureColumn(
  d: Database,
  table: string,
  column: string,
  ddl: string
): Promise<void> {
  const cols = await tableColumnNames(d, table);
  if (!cols.includes(column)) {
    try {
      await d.execute(ddl, []);
      console.info(`Added missing column "${table}.${column}"`);
    } catch (e) {
      console.error(`Failed to add column "${table}.${column}"`, e);
    }
  }
}

export async function bootstrapSchema(d: Database): Promise<void> {
  // 1. Create any missing tables (never alters existing ones).
  for (const sql of SCHEMA_CREATES) {
    try {
      await d.execute(sql, []);
    } catch (e) {
      console.error('Schema create failed', sql, e);
    }
  }

  // 2. Customers table normalization. Databases created before v1.3.0 have a
  //    `phone NOT NULL` column and no `account_type`/`assigned_cashier`. We
  //    rebuild the table once (copying all rows) so old and new databases
  //    end up with the exact same structure. Data is preserved.
  const custCols = await tableColumnNames(d, 'customers');
  if (!custCols.includes('account_type')) {
    try {
      await d.execute('ALTER TABLE customers RENAME TO customers_old', []);
      await d.execute(
        `CREATE TABLE customers (
          id TEXT PRIMARY KEY NOT NULL,
          full_name TEXT NOT NULL,
          account_type TEXT CHECK(account_type IN ('individual', 'company', 'ngo', 'government')) NOT NULL DEFAULT 'individual',
          phone TEXT,
          address TEXT,
          balance REAL NOT NULL DEFAULT 0.0,
          points INTEGER NOT NULL DEFAULT 0,
          advance_payment REAL NOT NULL DEFAULT 0.0,
          assigned_cashier TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        []
      );
      await d.execute(
        `INSERT INTO customers (id, full_name, account_type, phone, address, balance, points, advance_payment, assigned_cashier, created_at)
         SELECT id, full_name, 'individual', phone, address, balance, points, advance_payment, NULL, created_at FROM customers_old`,
        []
      );
      await d.execute('DROP TABLE customers_old', []);
      console.info('Normalized legacy customers table');
    } catch (e) {
      console.error('Failed to normalize customers table', e);
    }
  } else {
    await ensureColumn(
      d,
      'customers',
      'assigned_cashier',
      'ALTER TABLE customers ADD COLUMN assigned_cashier TEXT'
    );
  }

  // 3. Add columns introduced after the original schema.
  await ensureColumn(
    d,
    'users',
    'capabilities',
    `ALTER TABLE users ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'`
  );
  await ensureColumn(
    d,
    'categories',
    'color',
    `ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#6366f1'`
  );
  await ensureColumn(
    d,
    'printer_configs',
    'printer_name',
    `ALTER TABLE printer_configs ADD COLUMN printer_name TEXT NOT NULL DEFAULT 'XP-80C'`
  );
  await ensureColumn(d, 'sales', 'cash_amount', 'ALTER TABLE sales ADD COLUMN cash_amount REAL');
  await ensureColumn(d, 'sales', 'transfer_amount', 'ALTER TABLE sales ADD COLUMN transfer_amount REAL');
  await ensureColumn(d, 'sales', 'payment_note', 'ALTER TABLE sales ADD COLUMN payment_note TEXT');

  // 4. Indexes (idempotent).
  for (const sql of SCHEMA_INDEXES) {
    try {
      await d.execute(sql, []);
    } catch (e) {
      console.error('Index create failed', sql, e);
    }
  }

  // 5. Seed the single printer-config row when missing.
  try {
    await d.execute(
      `INSERT INTO printer_configs (
        id, store_name, tagline, address, phone,
        receipt_header_note, receipt_footer_note, show_logo,
        paper_width, auto_print_on_sale, point_rate, print_density, printer_name
      ) VALUES (
        1, 'Joainas Supermarket & Coldstore', '', '', '', '', '', 1, '80mm', 1, 2, 'Normal', 'XP-80C'
      )
      ON CONFLICT(id) DO NOTHING`,
      []
    );
  } catch (e) {
    console.error('Failed to seed printer config', e);
  }
}

export function getDb(): Promise<Database | null> {
  if (!isTauriRuntime()) return Promise.resolve(null);
  if (db) return Promise.resolve(db);
  // Share a single in-flight connection promise so concurrent loads (e.g.
  // initStorage's Promise.all) reuse one SQLite pool instead of each opening
  // their own — this avoids migration races and drastically speeds up startup.
  if (!dbPromise) {
    dbPromise = (async () => {
      const url = await getDbUrl();
      cachedDbUrl = url;
      const inst = await openDb(url);
      db = inst;
      return inst;
    })().finally(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// Move the live database to a new folder (native folder picker path) and
// reconnect to the new location. Returns the new URL or null on failure.
export async function relocateDatabaseTo(newDir: string): Promise<{ url: string; folder: string } | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    // Release the open pool so the file copy is safe (WAL gets checkpointed).
    if (db) {
      try {
        await db.close();
      } catch (e) {
        console.error('Failed to close old DB pool', e);
      }
      db = null;
    }
    const url = await invoke<string>('relocate_database', { dir: newDir });
    cachedDbInfo = null;
    const freshInfo = await getDbInfo();
    cachedDbUrl = url;
    db = await openDb(url);
    return { url, folder: freshInfo ? freshInfo.folder : newDir };
  } catch (e) {
    console.error('Failed to relocate database', e);
    return null;
  }
}

// ============================================================
// ROW MAPPERS (snake_case columns  ->  camelCase entities)
// ============================================================

export function mapUser(row: any): User {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    password: row.password_hash,
    role: row.role,
    capabilities: (() => {
      try {
        const parsed = JSON.parse(row.capabilities || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    status: row.status,
    createdAt: row.created_at,
    lastLogin: row.last_login || undefined,
  };
}

export function mapCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#6366f1',
    description: row.description || undefined,
    createdAt: row.created_at,
  };
}

export function mapProduct(row: any): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    category: row.category_name,
    unit: row.unit,
    costPrice: row.cost_price,
    retailPrice: row.retail_price,
    wholesalePrice: row.wholesale_price,
    stockQty: row.stock_qty,
    reorderLevel: row.reorder_level,
  };
}

export function mapCustomer(row: any): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    accountType: row.account_type || 'individual',
    phone: row.phone || undefined,
    address: row.address || '',
    balance: row.balance,
    points: row.points,
    advancePayment: row.advance_payment,
    assignedCashier: row.assigned_cashier || undefined,
    createdAt: row.created_at,
  };
}

export function mapExpenditure(row: any): Expenditure {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    amount: row.amount,
    date: row.expense_date,
    createdBy: row.created_by,
  };
}

export function mapPrinterConfig(row: any): ThermalPrinterConfig {
  return {
    storeName: row.store_name,
    tagline: row.tagline || '',
    address: row.address || '',
    phone: row.phone || '',
    receiptHeaderNote: row.receipt_header_note || '',
    receiptFooterNote: row.receipt_footer_note || '',
    showLogo: !!row.show_logo,
    paperWidth: row.paper_width,
    autoPrintOnSale: !!row.auto_print_on_sale,
    pointRate: row.point_rate,
    printDensity: row.print_density,
    printerName: row.printer_name || 'XP-80C',
  };
}

export function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    username: row.username,
    userRole: row.user_role,
    action: row.action,
    details: row.details,
    timestamp: row.log_timestamp,
    date: row.log_date,
    time: row.log_time,
  };
}

export function mapSale(row: any, productLookup: Map<string, Product>): SaleRecord {
  const items: CartItem[] = row.items.map((it: any) => {
    let product = productLookup.get(it.product_id);
    if (!product) {
      product = {
        id: it.product_id,
        barcode: '',
        name: it.product_name,
        category: '',
        unit: 'piece',
        costPrice: it.rate,
        retailPrice: it.rate,
        wholesalePrice: it.rate,
        stockQty: 0,
        reorderLevel: 0,
      };
    }
    return {
      product,
      quantity: it.quantity,
      priceType: it.price_type,
      rate: it.rate,
      amount: it.amount,
    };
  });

  return {
    id: row.id,
    receiptNo: row.receipt_no,
    items,
    subtotal: row.subtotal,
    totalAmount: row.total_amount,
    advancePayment: row.advance_payment,
    balanceDue: row.balance_due,
    paymentMethod: row.payment_method,
    cashAmount: row.cash_amount ?? undefined,
    transferAmount: row.transfer_amount ?? undefined,
    paymentNote: row.payment_note || undefined,
    priceType: row.price_type,
    customerId: row.customer_id || undefined,
    customerName: row.customer_name || undefined,
    customerPhone: row.customer_phone || undefined,
    pointsEarned: row.points_earned || 0,
    cashier: row.cashier_username,
    date: row.sale_date,
    time: row.sale_time,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// ============================================================
// GENERIC UPSERT HELPERS
// Saves used to "DELETE all rows, then re-insert row by row" over slow
// per-row IPC calls. If the window was closed mid-loop (or any INSERT
// failed, e.g. a duplicate barcode) the table stayed EMPTY — that is the
// "inventory vanished after restart" bug. The pattern below flips the
// order: rows are UPSERTED first (table always stays valid), and stale
// rows are deleted only AFTER every insert has succeeded. Closing the
// app at any instant can therefore never lose data.
//
// Multi-row VALUES statements are chunked to stay far below SQLite's
// bound-parameter limit.
// ============================================================

const MAX_PARAMS_PER_STATEMENT = 400;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

type ColumnSpec = { col: string; value: (row: any) => unknown };

async function upsertRows(
  d: Database,
  table: string,
  idColumn: string,
  columns: ColumnSpec[],
  rows: any[]
): Promise<void> {
  if (rows.length === 0) return;
  const colsPerRow = columns.length + 1; // id column + payload columns
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / colsPerRow));

  for (const group of chunk(rows, chunkSize)) {
    const placeholders = group.map(() => `(${Array(columns.length).fill('?').join(', ')}, ?)`).join(', ');
    const flat: unknown[] = [];
    for (const row of group) {
      for (const c of columns) flat.push(c.value(row));
      flat.push(row[idColumn]);
    }
    // Column order: payload cols first, id last — placeholders mirror that.
    const sql =
      `INSERT INTO ${table} (${columns.map((c) => c.col).join(', ')}, ${idColumn}) ` +
      `VALUES ${placeholders} ` +
      `ON CONFLICT(${idColumn}) DO UPDATE SET ${columns
        .map((c) => `${c.col} = excluded.${c.col}`)
        .join(', ')}`;
    await d.execute(sql, flat as any[]);
  }
}

async function deleteIdsNotIn(
  d: Database,
  table: string,
  idColumn: string,
  keepIds: string[]
): Promise<void> {
  if (keepIds.length === 0) {
    await d.execute(`DELETE FROM ${table}`, []);
    return;
  }
  // For large keep-lists SQLite has a bound-parameter limit — chunk the
  // NOT IN list and delete in passes. Each pass is individually atomic
  // and safe to interrupt mid-way (worst case leaves a few stale rows
  // that are pruned on the next save).
  for (const group of chunk(keepIds, MAX_PARAMS_PER_STATEMENT)) {
    await d.execute(`DELETE FROM ${table} WHERE ${idColumn} NOT IN (${group.map(() => '?').join(', ')})`, group);
  }
}

// ============================================================
// USERS
// ============================================================

export async function dbLoadUsers(): Promise<User[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM users ORDER BY created_at ASC');
  return rows.map(mapUser);
}

export async function dbSaveUsers(users: User[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'users', 'id', [
    { col: 'full_name', value: (u) => u.fullName },
    { col: 'username', value: (u) => u.username },
    { col: 'password_hash', value: (u) => u.password || '' },
    { col: 'role', value: (u) => u.role },
    { col: 'capabilities', value: (u) => JSON.stringify(u.capabilities || []) },
    { col: 'status', value: (u) => u.status },
    { col: 'created_at', value: (u) => u.createdAt },
    { col: 'last_login', value: (u) => u.lastLogin || null },
  ], users);
  await deleteIdsNotIn(d, 'users', 'id', users.map((u) => u.id));
}

// ============================================================
// CATEGORIES
// ============================================================

export async function dbLoadCategories(): Promise<Category[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM categories ORDER BY created_at ASC');
  return rows.map(mapCategory);
}

export async function dbSaveCategories(categories: Category[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'categories', 'id', [
    { col: 'name', value: (c) => c.name },
    { col: 'color', value: (c) => c.color || '#6366f1' },
    { col: 'description', value: (c) => c.description || null },
    { col: 'created_at', value: (c) => c.createdAt || null },
  ], categories);
  await deleteIdsNotIn(d, 'categories', 'id', categories.map((c) => c.id));
}

// ============================================================
// PRODUCTS
// ============================================================

export async function dbLoadProducts(): Promise<Product[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM products ORDER BY created_at ASC');
  return rows.map(mapProduct);
}

export async function dbSaveProducts(products: Product[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'products', 'id', [
    { col: 'barcode', value: (p) => p.barcode },
    { col: 'name', value: (p) => p.name },
    { col: 'category_name', value: (p) => p.category },
    { col: 'unit', value: (p) => p.unit },
    { col: 'cost_price', value: (p) => p.costPrice },
    { col: 'retail_price', value: (p) => p.retailPrice },
    { col: 'wholesale_price', value: (p) => p.wholesalePrice ?? p.retailPrice },
    { col: 'stock_qty', value: (p) => p.stockQty },
    { col: 'reorder_level', value: (p) => p.reorderLevel },
  ], products);
  await deleteIdsNotIn(d, 'products', 'id', products.map((p) => p.id));
}

// ============================================================
// CUSTOMERS
// ============================================================

export async function dbLoadCustomers(): Promise<Customer[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM customers ORDER BY created_at ASC');
  return rows.map(mapCustomer);
}

export async function dbSaveCustomers(customers: Customer[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'customers', 'id', [
    { col: 'full_name', value: (c) => c.fullName },
    { col: 'account_type', value: (c) => c.accountType || 'individual' },
    { col: 'phone', value: (c) => c.phone || null },
    { col: 'address', value: (c) => c.address || '' },
    { col: 'balance', value: (c) => c.balance },
    { col: 'points', value: (c) => c.points ?? 0 },
    { col: 'advance_payment', value: (c) => c.advancePayment ?? 0 },
    { col: 'assigned_cashier', value: (c) => c.assignedCashier || null },
    { col: 'created_at', value: (c) => c.createdAt },
  ], customers);
  await deleteIdsNotIn(d, 'customers', 'id', customers.map((c) => c.id));
}

// ============================================================
// SALES + SALE ITEMS
// ============================================================

export async function dbLoadSales(): Promise<SaleRecord[]> {
  const d = await getDb();
  if (!d) return [];

  const [saleRows, itemRows, productRows] = await Promise.all([
    d.select<any[]>('SELECT * FROM sales ORDER BY created_at DESC'),
    d.select<any[]>('SELECT * FROM sale_items'),
    d.select<any[]>('SELECT * FROM products'),
  ]);

  const productLookup = new Map<string, Product>();
  productRows.forEach((pr: any) => productLookup.set(pr.id, mapProduct(pr)));

  const itemsBySale = new Map<string, any[]>();
  itemRows.forEach((it: any) => {
    const list = itemsBySale.get(it.sale_id) || [];
    list.push(it);
    itemsBySale.set(it.sale_id, list);
  });

  return saleRows.map((row: any) => mapSale({ ...row, items: itemsBySale.get(row.id) || [] }, productLookup));
}

export async function dbSaveSales(sales: SaleRecord[]): Promise<void> {
  const d = await getDb();
  if (!d) return;

  // 1. Upsert every sale header (never deletes first).
  await upsertRows(d, 'sales', 'id', [
    { col: 'receipt_no', value: (s) => s.receiptNo },
    { col: 'subtotal', value: (s) => s.subtotal },
    { col: 'total_amount', value: (s) => s.totalAmount },
    { col: 'advance_payment', value: (s) => s.advancePayment },
    { col: 'balance_due', value: (s) => s.balanceDue },
    { col: 'payment_method', value: (s) => s.paymentMethod },
    { col: 'price_type', value: (s) => s.priceType },
    { col: 'customer_id', value: (s) => s.customerId || null },
    { col: 'customer_name', value: (s) => s.customerName || null },
    { col: 'customer_phone', value: (s) => s.customerPhone || null },
    { col: 'points_earned', value: (s) => s.pointsEarned || 0 },
    { col: 'cash_amount', value: (s) => (s as any).cashAmount ?? null },
    { col: 'transfer_amount', value: (s) => (s as any).transferAmount ?? null },
    { col: 'payment_note', value: (s) => (s as any).paymentNote || null },
    { col: 'cashier_username', value: (s) => s.cashier },
    { col: 'sale_date', value: (s) => s.date },
    { col: 'sale_time', value: (s) => s.time },
  ], sales);

  // 2. Upsert sale items (stable ids keyed off sale+product so re-saves
  //    replace instead of duplicating).
  type ItemRow = { id: string };
  const itemRows: ItemRow[] = [];
  const itemColumns: ColumnSpec[] = [
    { col: 'sale_id', value: (it) => it.saleId },
    { col: 'product_id', value: (it) => it.productId },
    { col: 'product_name', value: (it) => it.productName },
    { col: 'quantity', value: (it) => it.quantity },
    { col: 'price_type', value: (it) => it.priceType },
    { col: 'rate', value: (it) => it.rate },
    { col: 'amount', value: (it) => it.amount },
  ];
  for (const s of sales) {
    for (const item of s.items) {
      itemRows.push({
        id: `item-${s.id}-${item.product.id}`,
        saleId: s.id,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        priceType: item.priceType,
        rate: item.rate,
        amount: item.amount,
      } as any);
    }
  }
  await upsertRows(d, 'sale_items', 'id', itemColumns, itemRows);

  // 3. Only NOW prune receipts/items that no longer exist in the list.
  await deleteIdsNotIn(d, 'sales', 'id', sales.map((s) => s.id));
  await deleteIdsNotIn(d, 'sale_items', 'sale_id', sales.map((s) => s.id));
}

// ============================================================
// EXPENDITURES
// ============================================================

export async function dbLoadExpenditures(): Promise<Expenditure[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM expenditures ORDER BY created_at DESC');
  return rows.map(mapExpenditure);
}

export async function dbSaveExpenditures(expenditures: Expenditure[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'expenditures', 'id', [
    { col: 'description', value: (e) => e.description },
    { col: 'category', value: (e) => e.category },
    { col: 'amount', value: (e) => e.amount },
    { col: 'expense_date', value: (e) => e.date },
    { col: 'created_by', value: (e) => e.createdBy },
  ], expenditures);
  await deleteIdsNotIn(d, 'expenditures', 'id', expenditures.map((e) => e.id));
}

// ============================================================
// PRINTER CONFIG (single-row)
// ============================================================

export async function dbLoadPrinterConfig(): Promise<ThermalPrinterConfig | null> {
  const d = await getDb();
  if (!d) return null;
  const rows = await d.select<any[]>('SELECT * FROM printer_configs WHERE id = 1');
  if (!rows.length) return null;
  return mapPrinterConfig(rows[0]);
}

export async function dbSavePrinterConfig(config: ThermalPrinterConfig): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute(
    `INSERT INTO printer_configs (id, store_name, tagline, address, phone, receipt_header_note, receipt_footer_note,
      show_logo, paper_width, auto_print_on_sale, point_rate, print_density, printer_name)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       store_name = excluded.store_name,
       tagline = excluded.tagline,
       address = excluded.address,
       phone = excluded.phone,
       receipt_header_note = excluded.receipt_header_note,
       receipt_footer_note = excluded.receipt_footer_note,
       show_logo = excluded.show_logo,
       paper_width = excluded.paper_width,
       auto_print_on_sale = excluded.auto_print_on_sale,
       point_rate = excluded.point_rate,
       print_density = excluded.print_density,
       printer_name = excluded.printer_name,
       updated_at = CURRENT_TIMESTAMP`,
    [
      config.storeName,
      config.tagline,
      config.address,
      config.phone,
      config.receiptHeaderNote,
      config.receiptFooterNote,
      config.showLogo ? 1 : 0,
      config.paperWidth,
      config.autoPrintOnSale ? 1 : 0,
      config.pointRate,
      config.printDensity,
      config.printerName || 'XP-80C',
    ]
  );
}

// ============================================================
// AUDIT LOGS
// ============================================================

export async function dbLoadAuditLogs(): Promise<AuditLog[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM audit_logs ORDER BY log_timestamp DESC');
  return rows.map(mapAuditLog);
}

export async function dbSaveAuditLogs(logs: AuditLog[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute('DELETE FROM audit_logs');
  for (const l of logs) {
    await d.execute(
      `INSERT INTO audit_logs (id, username, user_role, action, details, log_timestamp, log_date, log_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.id, l.username, l.userRole, l.action, l.details, l.timestamp, l.date, l.time]
    );
  }
}

// ============================================================
// APP SETTINGS (key-value)
// ============================================================

export async function dbGetSetting(key: string): Promise<string | null> {
  const d = await getDb();
  if (!d) return null;
  const rows = await d.select<any[]>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return rows.length ? rows[0].value : null;
}

export async function dbSetSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}

export async function dbDeleteSetting(key: string): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute('DELETE FROM app_settings WHERE key = ?', [key]);
}

// ============================================================
// ADMIN RESET HELPERS
// Used by the Backup & Restore panel to wipe test data. The table name
// is always a hard-coded identifier from the app (never user input), so
// there is no SQL injection risk.
// ============================================================

export async function dbClearTable(table: string): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute(`DELETE FROM ${table}`, []);
}
