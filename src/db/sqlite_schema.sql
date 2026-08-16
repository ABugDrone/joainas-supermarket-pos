-- ====================================================================
-- JOAINAS SUPERMARKET & COLDSTORE - DESKTOP TAURI (GO + SQLITE) SCHEMA
-- Database Engine: SQLite 3 (WAL Mode Enabled at runtime by the app)
-- Full Admin Control: All tables support complete CRUD (Create, Read, Update, Delete)
-- ====================================================================

-- NOTE: `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` are
-- applied at application startup (db.ts initStorage), NOT inside this
-- migration, because sqlx executes migrations inside a transaction and
-- WAL mode cannot be changed from within a transaction.

-- --------------------------------------------------------------------
-- 1. STAFF USERS & AUTHENTICATION TABLE
-- Stores staff credentials, access roles, and terminal login status.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('System Admin', 'Store Manager', 'Cashier', 'Inventory Staff', 'Accountant')) NOT NULL DEFAULT 'Cashier',
    capabilities TEXT NOT NULL DEFAULT '[]',
    status TEXT CHECK(status IN ('active', 'suspended')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- --------------------------------------------------------------------
-- 2. DYNAMIC PRODUCT CATEGORIES TABLE
-- Allows ADMIN to freely create, update, or delete store categories.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- --------------------------------------------------------------------
-- 3. PRODUCTS & INVENTORY TABLE
-- Master product catalog with barcode indexing, dual pricing & stock.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
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
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_name);

-- --------------------------------------------------------------------
-- 4. CUSTOMER LEDGER & CREDIT DEBT ACCOUNTS
-- Tracks customer contacts, loyalty points, and credit debt balances.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    account_type TEXT CHECK(account_type IN ('individual', 'company', 'ngo', 'government')) NOT NULL DEFAULT 'individual',
    phone TEXT,
    address TEXT,
    balance REAL NOT NULL DEFAULT 0.0, -- Positive = Customer owes store (Debt), Negative = Store credit
    points INTEGER NOT NULL DEFAULT 0,
    advance_payment REAL NOT NULL DEFAULT 0.0,
    assigned_cashier TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);

-- --------------------------------------------------------------------
-- 5. SALES TRANSACTION HEADERS TABLE
-- Master receipt headers for POS transactions and customer billing.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_no TEXT UNIQUE NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0.0,
    total_amount REAL NOT NULL DEFAULT 0.0,
    advance_payment REAL NOT NULL DEFAULT 0.0,
    balance_due REAL NOT NULL DEFAULT 0.0,
    payment_method TEXT CHECK(payment_method IN ('Cash', 'POS Transfer', 'Store Credit / Account', 'Split Payment')) NOT NULL DEFAULT 'Cash',
    price_type TEXT CHECK(price_type IN ('retail', 'wholesale')) NOT NULL DEFAULT 'retail',
    customer_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    points_earned INTEGER NOT NULL DEFAULT 0,
    cashier_username TEXT NOT NULL,
    sale_date TEXT NOT NULL, -- YYYY-MM-DD
    sale_time TEXT NOT NULL, -- HH:mm:ss
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_username);

-- --------------------------------------------------------------------
-- 6. SALE LINE ITEMS TABLE
-- Individual items purchased within each transaction receipt.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_type TEXT CHECK(price_type IN ('retail', 'wholesale')) NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- --------------------------------------------------------------------
-- 7. STORE EXPENDITURES & ACCOUNTS TABLE
-- Tracks operational store expenses (Power, Freight, Salaries, etc.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenditures (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    category TEXT CHECK(category IN ('Cold Room & Power', 'Transport & Freight', 'Salaries & Staff', 'Packaging & Bags', 'Maintenance', 'Miscellaneous')) NOT NULL,
    amount REAL NOT NULL DEFAULT 0.0,
    expense_date TEXT NOT NULL, -- YYYY-MM-DD
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenditures_date ON expenditures(expense_date);

-- --------------------------------------------------------------------
-- 8. THERMAL PRINTER & STORE CONFIGURATION TABLE
-- Custom receipt header/footer settings, paper width, and printer configs.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS printer_configs (
    id INTEGER PRIMARY KEY CHECK (id = 1) DEFAULT 1, -- Single-row config table
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 9. AUDIT TRAIL LOGS TABLE
-- Complete security logs recording every admin, cashier & manager action.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    log_timestamp INTEGER NOT NULL,
    log_date TEXT NOT NULL, -- YYYY-MM-DD
    log_time TEXT NOT NULL  -- HH:mm:ss
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(log_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);

-- --------------------------------------------------------------------
-- 10. INVENTORY STOCK ADJUSTMENTS AUDIT TABLE
-- Tracks manual stock additions, reorders, and stock-takes by Admin.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    adjustment_type TEXT CHECK(adjustment_type IN ('ADD_STOCK', 'DAMAGE_WRITE_OFF', 'STOCK_TAKE_CORRECTION')) NOT NULL,
    quantity_changed INTEGER NOT NULL,
    reason TEXT,
    adjusted_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Automatic Timestamp Update Trigger for Products
CREATE TRIGGER IF NOT EXISTS update_products_timestamp 
AFTER UPDATE ON products 
BEGIN
    UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- --------------------------------------------------------------------
-- 11. APP SETTINGS / KEY-VALUE TABLE
-- Stores app-level flags (admin setup done, active user session, etc.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
