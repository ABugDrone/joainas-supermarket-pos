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
  if (!isTauriRuntime()) return 'sqlite:senior_citizen_accessories.db';
  const info = await getDbInfo();
  return info ? info.url : 'sqlite:senior_citizen_accessories.db';
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
  try {
    await next.execute('PRAGMA busy_timeout = 5000');
  } catch (e) {
    console.error('Failed to set busy timeout', e);
  }
  // The schema is bootstrapped idempotently on every connection instead of via
  // sqlx migrations — older builds edited migration v1's SQL which broke the
  // checksum/dirty checks on existing databases and even on fresh installs.
  // Running it here keeps old databases working and existing data safe.
  await bootstrapSchema(next);
  return next;
}

// Keep the write-ahead log from growing without bound. The old build rewrote
// every table on a 15s timer, which inflated the WAL to many times the size of
// the database itself; incremental writes plus this periodic truncate keep the
// on-disk footprint proportional to what actually changed.
export async function dbCheckpointWal(): Promise<void> {
  const d = await getDb();
  if (!d) return;
  try {
    await d.execute('PRAGMA wal_checkpoint(TRUNCATE)', []);
  } catch (e) {
    console.warn('WAL checkpoint skipped', e);
  }
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
    kind TEXT NOT NULL DEFAULT 'product',
    unit TEXT NOT NULL DEFAULT 'piece',
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
    logo_data_url TEXT,
    business_name TEXT,
    paper_width TEXT CHECK(paper_width IN ('80mm', '58mm')) NOT NULL DEFAULT '80mm',
    auto_print_on_sale BOOLEAN NOT NULL DEFAULT 1,
    point_rate INTEGER NOT NULL DEFAULT 2,
    print_density TEXT CHECK(print_density IN ('Normal', 'High', 'Draft')) NOT NULL DEFAULT 'Normal',
    printer_name TEXT NOT NULL DEFAULT 'XP-80C',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT NOT NULL,
    contract_code TEXT UNIQUE NOT NULL,
    product_label TEXT NOT NULL DEFAULT '',
    purchase_date TEXT NOT NULL,
    total_price REAL NOT NULL DEFAULT 0.0,
    down_payment REAL NOT NULL DEFAULT 0.0,
    total_paid REAL NOT NULL DEFAULT 0.0,
    pending_balance REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'INSTALLMENT_ACTIVE',
    due_date TEXT,
    down_remitted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    currency TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS micro_payments (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0.0,
    collected_at INTEGER NOT NULL,
    receipt_note TEXT,
    remitted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
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
  'CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)',
  'CREATE INDEX IF NOT EXISTS idx_payments_contract ON micro_payments(contract_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_customer ON micro_payments(customer_id)',
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

  // 2b. Products unit CHECK normalization (v2.0.0): legacy tables restrict
  // unit to 6 goods values, which rejects service units (hour/job/...).
  // Rebuild once without the restrictive CHECK; data preserved.
  try {
    const prodSql: any[] = await d.select(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='products'`
    );
    const ddl: string = prodSql?.[0]?.sql || '';
    if (ddl.includes(`'kg', 'pack'`) || ddl.includes(`"kg", "pack"`)) {
      await d.execute('ALTER TABLE products RENAME TO products_old', []);
      await d.execute(
        `CREATE TABLE products (
          id TEXT PRIMARY KEY NOT NULL,
          barcode TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          category_name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'product',
          unit TEXT NOT NULL DEFAULT 'piece',
          cost_price REAL NOT NULL DEFAULT 0.0,
          retail_price REAL NOT NULL DEFAULT 0.0,
          wholesale_price REAL NOT NULL DEFAULT 0.0,
          stock_qty INTEGER NOT NULL DEFAULT 0,
          reorder_level INTEGER NOT NULL DEFAULT 5,
          min_price REAL,
          price_tiers TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        []
      );
      await d.execute(
        `INSERT INTO products (id, barcode, name, category_name, kind, unit, cost_price, retail_price, wholesale_price, stock_qty, reorder_level, created_at, updated_at)
         SELECT id, barcode, name, category_name,
           CASE WHEN lower(category_name) = 'services' THEN 'service' ELSE 'product' END,
           unit, cost_price, retail_price, wholesale_price, stock_qty, reorder_level, created_at, updated_at FROM products_old`,
        []
      );
      await d.execute('DROP TABLE products_old', []);
      console.info('Normalized legacy products unit CHECK + kind');
    }
  } catch (e) {
    console.error('Failed to normalize products table', e);
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
  await ensureColumn(d, 'sales', 'currency', 'ALTER TABLE sales ADD COLUMN currency TEXT');
  await ensureColumn(d, 'customers', 'nin', 'ALTER TABLE customers ADD COLUMN nin TEXT');
  await ensureColumn(d, 'customers', 'bvn', 'ALTER TABLE customers ADD COLUMN bvn TEXT');
  await ensureColumn(d, 'products', 'kind', `ALTER TABLE products ADD COLUMN kind TEXT NOT NULL DEFAULT 'product'`);
  await ensureColumn(d, 'categories', 'kind', `ALTER TABLE categories ADD COLUMN kind TEXT`);
  await ensureColumn(d, 'categories', 'parent_root', `ALTER TABLE categories ADD COLUMN parent_root TEXT`);
  await ensureColumn(d, 'printer_configs', 'logo_data_url', 'ALTER TABLE printer_configs ADD COLUMN logo_data_url TEXT');
  await ensureColumn(d, 'printer_configs', 'business_name', 'ALTER TABLE printer_configs ADD COLUMN business_name TEXT');
  await ensureColumn(d, 'contracts', 'currency', 'ALTER TABLE contracts ADD COLUMN currency TEXT');
  await ensureColumn(d, 'expenditures', 'currency', 'ALTER TABLE expenditures ADD COLUMN currency TEXT');
  await ensureColumn(d, 'products', 'min_price', 'ALTER TABLE products ADD COLUMN min_price REAL');
  await ensureColumn(d, 'products', 'price_tiers', 'ALTER TABLE products ADD COLUMN price_tiers TEXT');

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
        1, 'Joainas Mart', '', '', '', '', '', 1, '80mm', 1, 2, 'Normal', 'XP-80C'
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
    kind: row.kind || undefined,
    parentRoot: row.parent_root || undefined,
    createdAt: row.created_at,
  };
}

export function mapProduct(row: any): Product {
  let parsedTiers: any[] | undefined;
  try {
    if (row.price_tiers) {
      const p = typeof row.price_tiers === 'string' ? JSON.parse(row.price_tiers) : row.price_tiers;
      if (Array.isArray(p)) parsedTiers = p;
    }
  } catch {}
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    category: row.category_name,
    kind: row.kind === 'service' ? 'service' : row.kind === 'edible' ? 'edible' : row.kind === 'product' ? 'product' : undefined,
    unit: row.unit,
    costPrice: row.cost_price,
    retailPrice: row.retail_price,
    wholesalePrice: row.wholesale_price,
    minPrice: row.min_price ?? undefined,
    priceTiers: parsedTiers as any,
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
    nin: row.nin || undefined,
    bvn: row.bvn || undefined,
    balance: row.balance,
    points: row.points,
    advancePayment: row.advance_payment,
    assignedCashier: row.assigned_cashier || undefined,
    createdAt: row.created_at,
  };
}

export function mapContract(row: any): any {
  return {
    id: row.id,
    customerId: row.customer_id,
    contractCode: row.contract_code,
    productLabel: row.product_label || '',
    purchaseDate: row.purchase_date,
    totalPrice: row.total_price,
    downPayment: row.down_payment,
    totalPaid: row.total_paid,
    pendingBalance: row.pending_balance,
    status: row.status === 'COMPLETED' ? 'COMPLETED' : 'INSTALLMENT_ACTIVE',
    dueDate: row.due_date || undefined,
    downRemitted: !!row.down_remitted,
    createdBy: row.created_by || undefined,
    currency: row.currency || undefined,
    createdAt: row.created_at,
  };
}

export function mapMicroPayment(row: any): any {
  return {
    id: row.id,
    contractId: row.contract_id,
    customerId: row.customer_id,
    amount: row.amount,
    collectedAt: row.collected_at,
    receiptNote: row.receipt_note || undefined,
    remitted: !!row.remitted,
    createdBy: row.created_by || undefined,
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
    currency: row.currency || undefined,
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
    logoDataUrl: row.logo_data_url || undefined,
    businessName: row.business_name || undefined,
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
      // Past records are regarded as minimum prices: floor snapshot = rate.
      ceilingAtSale: it.rate,
      floorAtSale: it.rate,
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
    currency: row.currency || undefined,
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
  // Single atomic statement via json_each — avoids the chunked NOT IN wipe
  // bug where 800 keepIds split into 20 chunks would delete 760 rows after
  // the first chunk (everything not in that 40). json_each is available in
  // SQLite 3.38+ (bundled with Tauri) and is unbounded.
  await d.execute(
    `DELETE FROM ${table} WHERE ${idColumn} NOT IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(keepIds)]
  );
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
    { col: 'kind', value: (c) => (c as any).kind || null },
    { col: 'parent_root', value: (c) => (c as any).parentRoot || null },
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

const PRODUCT_COLUMNS: ColumnSpec[] = [
  { col: 'barcode', value: (p) => p.barcode },
  { col: 'name', value: (p) => p.name },
  { col: 'category_name', value: (p) => p.category },
  {
    col: 'kind',
    value: (p) => {
      if (p.kind === 'service' || p.kind === 'edible' || p.kind === 'product') return p.kind;
      const cat = ((p as any).category || '').toLowerCase();
      return cat === 'services' ? 'service' : cat === 'edibles' ? 'edible' : 'product';
    },
  },
  { col: 'unit', value: (p) => p.unit },
  { col: 'cost_price', value: (p) => p.costPrice },
  { col: 'retail_price', value: (p) => p.retailPrice },
  { col: 'wholesale_price', value: (p) => p.wholesalePrice ?? p.retailPrice },
  { col: 'min_price', value: (p) => (p as any).minPrice ?? null },
  { col: 'price_tiers', value: (p) => JSON.stringify((p as any).priceTiers || []) },
  { col: 'stock_qty', value: (p) => p.stockQty },
  { col: 'reorder_level', value: (p) => p.reorderLevel },
];

export async function dbSaveProducts(products: Product[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'products', 'id', PRODUCT_COLUMNS, products);
  await deleteIdsNotIn(d, 'products', 'id', products.map((p) => p.id));
}

// Incremental (live) writes: upsert ONLY the rows that changed. No table-wide
// prune — the caller supplies explicit ids to delete. This is what keeps a
// 1000+ item catalog cheap to save on every edit.
export async function dbUpsertProducts(products: Product[]): Promise<void> {
  if (products.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'products', 'id', PRODUCT_COLUMNS, products);
}

export async function dbDeleteProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await d.execute(`DELETE FROM products WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
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

const CUSTOMER_COLUMNS: ColumnSpec[] = [
  { col: 'full_name', value: (c) => c.fullName },
  { col: 'account_type', value: (c) => c.accountType || 'individual' },
  { col: 'phone', value: (c) => c.phone || null },
  { col: 'address', value: (c) => c.address || '' },
  { col: 'nin', value: (c) => (c as any).nin || null },
  { col: 'bvn', value: (c) => (c as any).bvn || null },
  { col: 'balance', value: (c) => c.balance },
  { col: 'points', value: (c) => c.points ?? 0 },
  { col: 'advance_payment', value: (c) => c.advancePayment ?? 0 },
  { col: 'assigned_cashier', value: (c) => c.assignedCashier || null },
  { col: 'created_at', value: (c) => c.createdAt },
];

export async function dbSaveCustomers(customers: Customer[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'customers', 'id', CUSTOMER_COLUMNS, customers);
  await deleteIdsNotIn(d, 'customers', 'id', customers.map((c) => c.id));
}

export async function dbUpsertCustomers(customers: Customer[]): Promise<void> {
  if (customers.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'customers', 'id', CUSTOMER_COLUMNS, customers);
}

export async function dbDeleteCustomers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await d.execute(`DELETE FROM customers WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
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

const SALE_COLUMNS: ColumnSpec[] = [
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
  { col: 'currency', value: (s) => s.currency || null },
];

const SALE_ITEM_COLUMNS: ColumnSpec[] = [
  { col: 'sale_id', value: (it) => it.saleId },
  { col: 'product_id', value: (it) => it.productId },
  { col: 'product_name', value: (it) => it.productName },
  { col: 'quantity', value: (it) => it.quantity },
  { col: 'price_type', value: (it) => it.priceType },
  { col: 'rate', value: (it) => it.rate },
  { col: 'amount', value: (it) => it.amount },
];

function saleItemRows(sales: SaleRecord[]): Array<{ id: string }> {
  const itemRows: Array<{ id: string }> = [];
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
  return itemRows;
}

async function upsertSalesRows(d: Database, sales: SaleRecord[]): Promise<void> {
  await upsertRows(d, 'sales', 'id', SALE_COLUMNS, sales);
  await upsertRows(d, 'sale_items', 'id', SALE_ITEM_COLUMNS, saleItemRows(sales));
}

export async function dbSaveSales(sales: SaleRecord[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertSalesRows(d, sales);
  // Only NOW prune receipts/items that no longer exist in the list.
  await deleteIdsNotIn(d, 'sales', 'id', sales.map((s) => s.id));
  await deleteIdsNotIn(d, 'sale_items', 'sale_id', sales.map((s) => s.id));
}

// Incremental sale write: upsert the receipt + its items, never prune.
export async function dbUpsertSales(sales: SaleRecord[]): Promise<void> {
  if (sales.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await upsertSalesRows(d, sales);
}

export async function dbDeleteSales(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await d.execute(`DELETE FROM sale_items WHERE sale_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
  await d.execute(`DELETE FROM sales WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
}

// ============================================================
// ATOMIC SALE + STOCK UPDATE
// Records a single sale and decrements stock in one sequential DB call
// using `stock_qty - qty` so an intentional depleted-stock sale can go
// negative. This replaces the old dual-write (saveSales + saveProducts full table rewrite) that
// could revert if the second write was lost on close.
// ============================================================

export async function dbRecordSaleWithStockUpdate(sale: SaleRecord): Promise<void> {
  const d = await getDb();
  if (!d) return;

  // 1. Insert sale header
  await d.execute(
    `INSERT INTO sales (id, receipt_no, subtotal, total_amount, advance_payment, balance_due, payment_method, price_type, customer_id, customer_name, customer_phone, points_earned, cash_amount, transfer_amount, payment_note, cashier_username, sale_date, sale_time, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       receipt_no=excluded.receipt_no, subtotal=excluded.subtotal, total_amount=excluded.total_amount, advance_payment=excluded.advance_payment, balance_due=excluded.balance_due, payment_method=excluded.payment_method, price_type=excluded.price_type, customer_id=excluded.customer_id, customer_name=excluded.customer_name, customer_phone=excluded.customer_phone, points_earned=excluded.points_earned, cash_amount=excluded.cash_amount, transfer_amount=excluded.transfer_amount, payment_note=excluded.payment_note, cashier_username=excluded.cashier_username, sale_date=excluded.sale_date, sale_time=excluded.sale_time, currency=excluded.currency`,
    [
      sale.id,
      sale.receiptNo,
      sale.subtotal,
      sale.totalAmount,
      sale.advancePayment,
      sale.balanceDue,
      sale.paymentMethod,
      sale.priceType,
      sale.customerId || null,
      sale.customerName || null,
      sale.customerPhone || null,
      sale.pointsEarned || 0,
      (sale as any).cashAmount ?? null,
      (sale as any).transferAmount ?? null,
      (sale as any).paymentNote || null,
      sale.cashier,
      sale.date,
      sale.time,
      sale.currency || null,
    ]
  );

  // 2. Insert sale items
  for (const item of sale.items) {
    await d.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, price_type, rate, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET sale_id=excluded.sale_id, product_id=excluded.product_id, product_name=excluded.product_name, quantity=excluded.quantity, price_type=excluded.price_type, rate=excluded.rate, amount=excluded.amount`,
      [
        `item-${sale.id}-${item.product.id}`,
        sale.id,
        item.product.id,
        item.product.name,
        item.quantity,
        item.priceType,
        item.rate,
        item.amount,
      ]
    );
  }

  // 3. Decrement stock atomically per item (services & edibles are uncounted — skip)
  for (const item of sale.items) {
    const kind = (item.product as any).kind;
    const cat = String((item.product as any).category || '').toLowerCase();
    if (kind === 'service' || kind === 'edible' || cat === 'services' || cat === 'edibles') continue;
    await d.execute(
      `UPDATE products SET stock_qty = stock_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [item.quantity, item.product.id]
    );
  }
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

const EXPENDITURE_COLUMNS: ColumnSpec[] = [
  { col: 'description', value: (e) => e.description },
  { col: 'category', value: (e) => e.category },
  { col: 'amount', value: (e) => e.amount },
  { col: 'expense_date', value: (e) => e.date },
  { col: 'created_by', value: (e) => e.createdBy },
  { col: 'currency', value: (e) => e.currency || null },
];

export async function dbSaveExpenditures(expenditures: Expenditure[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'expenditures', 'id', EXPENDITURE_COLUMNS, expenditures);
  await deleteIdsNotIn(d, 'expenditures', 'id', expenditures.map((e) => e.id));
}

export async function dbUpsertExpenditures(expenditures: Expenditure[]): Promise<void> {
  if (expenditures.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'expenditures', 'id', EXPENDITURE_COLUMNS, expenditures);
}

export async function dbDeleteExpenditures(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await d.execute(`DELETE FROM expenditures WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
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
      show_logo, logo_data_url, business_name, paper_width, auto_print_on_sale, point_rate, print_density, printer_name)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
        store_name = excluded.store_name,
        tagline = excluded.tagline,
        address = excluded.address,
        phone = excluded.phone,
        receipt_header_note = excluded.receipt_header_note,
        receipt_footer_note = excluded.receipt_footer_note,
        show_logo = excluded.show_logo,
        logo_data_url = excluded.logo_data_url,
        business_name = excluded.business_name,
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
      (config as any).logoDataUrl || null,
      (config as any).businessName || null,
      config.paperWidth,
      config.autoPrintOnSale ? 1 : 0,
      config.pointRate,
      config.printDensity,
      config.printerName || 'XP-80C',
    ]
  );
}

// ============================================================
// INSTALLMENT CONTRACTS + MICRO-PAYMENTS (StoreBox PRO ledger)
// ============================================================

export async function dbLoadContracts(): Promise<any[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM contracts ORDER BY created_at DESC');
  return rows.map(mapContract);
}

export async function dbSaveContracts(contracts: any[]): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'contracts', 'id', [
    { col: 'customer_id', value: (c) => c.customerId },
    { col: 'contract_code', value: (c) => c.contractCode },
    { col: 'product_label', value: (c) => c.productLabel || '' },
    { col: 'purchase_date', value: (c) => c.purchaseDate },
    { col: 'total_price', value: (c) => c.totalPrice },
    { col: 'down_payment', value: (c) => c.downPayment ?? 0 },
    { col: 'total_paid', value: (c) => c.totalPaid ?? 0 },
    { col: 'pending_balance', value: (c) => c.pendingBalance ?? 0 },
    { col: 'status', value: (c) => c.status || 'INSTALLMENT_ACTIVE' },
    { col: 'due_date', value: (c) => c.dueDate || null },
    { col: 'down_remitted', value: (c) => (c.downRemitted ? 1 : 0) },
    { col: 'created_by', value: (c) => c.createdBy || null },
    { col: 'currency', value: (c) => c.currency || null },
    { col: 'created_at', value: (c) => c.createdAt || null },
  ], contracts);
  await deleteIdsNotIn(d, 'contracts', 'id', contracts.map((c) => c.id));
}

export async function dbLoadMicroPayments(): Promise<any[]> {
  const d = await getDb();
  if (!d) return [];
  const rows = await d.select<any[]>('SELECT * FROM micro_payments ORDER BY collected_at ASC');
  return rows.map(mapMicroPayment);
}

function recalcContract(totalPrice: number, downPayment: number, micros: number): { totalPaid: number; pending: number; status: string } {
  const totalPaid = (downPayment || 0) + (micros || 0);
  const pending = Math.max(0, (totalPrice || 0) - totalPaid);
  return { totalPaid, pending, status: pending <= 0.005 ? 'COMPLETED' : 'INSTALLMENT_ACTIVE' };
}

export async function dbRecordMicroPayment(p: { contractId: string; customerId: string; amount: number; receiptNote?: string; remitted?: boolean; createdBy?: string }): Promise<any | null> {
  const d = await getDb();
  if (!d) return null;
  const id = `mpay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const collectedAt = Date.now();
  await d.execute(
    `INSERT INTO micro_payments (id, contract_id, customer_id, amount, collected_at, receipt_note, remitted, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, p.contractId, p.customerId, p.amount, collectedAt, p.receiptNote || null, p.remitted ? 1 : 0, p.createdBy || null]
  );
  const crows: any[] = await d.select('SELECT * FROM contracts WHERE id = ?', [p.contractId]);
  if (!crows.length) return { id, collectedAt };
  const c = crows[0];
  const sums: any[] = await d.select('SELECT COALESCE(SUM(amount),0) AS s FROM micro_payments WHERE contract_id = ?', [p.contractId]);
  const r = recalcContract(c.total_price, c.down_payment, sums?.[0]?.s ?? 0);
  await d.execute('UPDATE contracts SET total_paid = ?, pending_balance = ?, status = ? WHERE id = ?', [r.totalPaid, r.pending, r.status, p.contractId]);
  // Mirror onto legacy customer balance (sum of pending across contracts)
  try {
    const all: any[] = await d.select('SELECT COALESCE(SUM(pending_balance),0) AS s FROM contracts WHERE customer_id = ?', [p.customerId]);
    await d.execute('UPDATE customers SET balance = ? WHERE id = ?', [all?.[0]?.s ?? 0, p.customerId]);
  } catch {}
  return { id, collectedAt, ...r };
}

export async function dbDeleteMicroPayment(paymentId: string): Promise<boolean> {
  const d = await getDb();
  if (!d) return false;
  const rows: any[] = await d.select('SELECT * FROM micro_payments WHERE id = ?', [paymentId]);
  if (!rows.length) return false;
  const { contract_id, customer_id } = rows[0];
  await d.execute('DELETE FROM micro_payments WHERE id = ?', [paymentId]);
  const crows: any[] = await d.select('SELECT * FROM contracts WHERE id = ?', [contract_id]);
  if (crows.length) {
    const c = crows[0];
    const sums: any[] = await d.select('SELECT COALESCE(SUM(amount),0) AS s FROM micro_payments WHERE contract_id = ?', [contract_id]);
    const r = recalcContract(c.total_price, c.down_payment, sums?.[0]?.s ?? 0);
    await d.execute('UPDATE contracts SET total_paid = ?, pending_balance = ?, status = ? WHERE id = ?', [r.totalPaid, r.pending, r.status, contract_id]);
  }
  try {
    const all: any[] = await d.select('SELECT COALESCE(SUM(pending_balance),0) AS s FROM contracts WHERE customer_id = ?', [customer_id]);
    await d.execute('UPDATE customers SET balance = ? WHERE id = ?', [all?.[0]?.s ?? 0, customer_id]);
  } catch {}
  return true;
}

export async function dbSetMicroRemitted(paymentId: string, remitted: boolean): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute('UPDATE micro_payments SET remitted = ? WHERE id = ?', [remitted ? 1 : 0, paymentId]);
}

export async function dbSetContractDownRemitted(contractId: string, remitted: boolean): Promise<void> {
  const d = await getDb();
  if (!d) return;
  await d.execute('UPDATE contracts SET down_remitted = ? WHERE id = ?', [remitted ? 1 : 0, contractId]);
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

const AUDIT_COLUMNS: ColumnSpec[] = [
  { col: 'username', value: (l: AuditLog) => l.username },
  { col: 'user_role', value: (l: AuditLog) => l.userRole },
  { col: 'action', value: (l: AuditLog) => l.action },
  { col: 'details', value: (l: AuditLog) => l.details },
  { col: 'log_timestamp', value: (l: AuditLog) => l.timestamp },
  { col: 'log_date', value: (l: AuditLog) => l.date },
  { col: 'log_time', value: (l: AuditLog) => l.time },
];

// Audit rows are append-only: an upsert without a table-wide prune. Deleting
// "everything not in this list" here used to rewrite the whole table on every
// save, which is exactly the write amplification that filled the WAL.
export async function dbSaveAuditLogs(logs: AuditLog[]): Promise<void> {
  if (logs.length === 0) return;
  const d = await getDb();
  if (!d) return;
  await upsertRows(d, 'audit_logs', 'id', AUDIT_COLUMNS, logs);
}

export async function dbAppendAuditLogs(logs: AuditLog[]): Promise<void> {
  await dbSaveAuditLogs(logs);
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

// ============================================================
// SIBLING-DATABASE MERGE (v1.4.8)
// The install history left several database files behind (old Joainas
// identifier, rebrand renames, user-relocated folders, stale pointer
// files). Whichever file the pointer names is "live" — but the accounts
// and sales may sit in a sibling file, stranding the user at the setup
// wizard or hiding all history. This ATTACHes a sibling file and copies
// every row the live DB is missing (INSERT OR IGNORE by id — never
// overwrites, never duplicates). Column lists are intersected via PRAGMA
// so old schemas (missing min_price etc.) merge safely.
// Returns rows added per table (all zero when already united).
// ============================================================

const MERGE_TABLES = [
  'users',
  'categories',
  'products',
  'customers',
  'sales',
  'sale_items',
  'expenditures',
] as const;

function sqlEscapePath(p: string): string {
  return p.replace(/'/g, "''");
}

async function tableColumns(d: Database, qualified: string): Promise<string[]> {
  try {
    const rows = await d.select<{ name: string }[]>(`PRAGMA table_info(${qualified})`);
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

export async function dbMergeFromFile(absPath: string): Promise<Record<string, number>> {
  const added: Record<string, number> = {};
  const d = await getDb();
  if (!d) return added;
  // Attach under a fixed alias; detach in finally so one bad file can
  // never poison later merges.
  try {
    await d.execute(`ATTACH DATABASE '${sqlEscapePath(absPath)}' AS srcdb`, []);
  } catch (e) {
    console.error('Merge attach failed', absPath, e);
    return added;
  }
  try {
    for (const table of MERGE_TABLES) {
      try {
        const liveCols = await tableColumns(d, table);
        const srcCols = await tableColumns(d, `srcdb.${table}`);
        if (liveCols.length === 0 || srcCols.length === 0) continue;
        const common = liveCols.filter((c) => srcCols.includes(c));
        if (!common.includes('id')) continue;
        const list = common.join(', ');
        const before: any[] = await d.select(`SELECT COUNT(*) AS n FROM ${table}`);
        const beforeN = before?.[0]?.n ?? 0;
        await d.execute(
          `INSERT OR IGNORE INTO ${table} (${list}) SELECT ${list} FROM srcdb.${table}`,
          []
        );
        const after: any[] = await d.select(`SELECT COUNT(*) AS n FROM ${table}`);
        added[table] = (after?.[0]?.n ?? beforeN) - beforeN;
      } catch (e) {
        console.error(`Merge failed for table ${table} from`, absPath, e);
      }
    }
  } finally {
    try {
      await d.execute('DETACH DATABASE srcdb', []);
    } catch {}
  }
  return added;
}
