import {
  Product,
  Customer,
  SaleRecord,
  Expenditure,
  ThermalPrinterConfig,
  User,
  AuditLog,
  UserRole,
  Category,
} from '../types';
import { INITIAL_PRINTER_CONFIG } from '../data/initialData';
import {
  isTauriRuntime,
  dbLoadProducts,
  dbSaveProducts,
  dbLoadCustomers,
  dbSaveCustomers,
  dbLoadSales,
  dbSaveSales,
  dbLoadExpenditures,
  dbSaveExpenditures,
  dbLoadPrinterConfig,
  dbSavePrinterConfig,
  dbLoadUsers,
  dbSaveUsers,
  dbLoadAuditLogs,
  dbSaveAuditLogs,
  dbLoadCategories,
  dbSaveCategories,
  dbGetSetting,
  dbSetSetting,
  dbDeleteSetting,
  getDbInfo,
  relocateDatabaseTo,
} from './db';

// ============================================================
// IN-MEMORY CACHE — source of truth for the running session.
// Persisted to the internal SQLite database (Tauri) or
// localStorage (browser dev fallback).
// ============================================================

let initialized = false;

let cacheProducts: Product[] = [];
let cacheCustomers: Customer[] = [];
let cacheSales: SaleRecord[] = [];
let cacheExpenditures: Expenditure[] = [];
let cacheUsers: User[] = [];
let cacheAuditLogs: AuditLog[] = [];
let cacheCategories: Category[] = [];
let cachePrinterConfig: ThermalPrinterConfig | null = null;
let cacheAdminSetupDone = false;
let cacheActiveUser: User | null = null;

// Serialized write queue — keeps DB writes in order.
let writeQueue: Promise<void> = Promise.resolve();
function enqueueWrite(task: () => Promise<void>): void {
  writeQueue = writeQueue.then(task).catch((e) => console.error('SQLite write failed', e));
}

// Browser fallback keys (only used when running outside Tauri).
const LKEYS = {
  PRODUCTS: 'joainas_products_v1',
  CUSTOMERS: 'joainas_customers_v1',
  SALES: 'joainas_sales_v1',
  EXPENDITURES: 'joainas_expenditures_v1',
  PRINTER_CONFIG: 'joainas_printer_config_v1',
  USERS: 'joainas_users_v1',
  AUDIT_LOGS: 'joainas_audit_logs_v1',
  CATEGORIES: 'joainas_categories_v1',
  ADMIN_SETUP_DONE: 'joainas_admin_setup_done_v1',
  ACTIVE_USER: 'joainas_active_user_v1',
  LICENSE_ACCEPTED: 'joainas_license_accepted_v1',
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage`, e);
  }
}

// ============================================================
// BOOTSTRAP — call once before rendering the app.
// Loads all persisted data from the internal SQLite DB.
// ============================================================

export async function initStorage(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (isTauriRuntime()) {
    const [
      products,
      customers,
      sales,
      expenditures,
      users,
      auditLogs,
      categories,
      printerConfig,
      setupDone,
    ] = await Promise.all([
      dbLoadProducts(),
      dbLoadCustomers(),
      dbLoadSales(),
      dbLoadExpenditures(),
      dbLoadUsers(),
      dbLoadAuditLogs(),
      dbLoadCategories(),
      dbLoadPrinterConfig(),
      dbGetSetting('admin_setup_done'),
    ]);

    cacheProducts = products;
    cacheCustomers = customers;
    cacheSales = sales;
    cacheExpenditures = expenditures;
    cacheUsers = users;
    cacheAuditLogs = auditLogs;
    cacheCategories = categories;
    cachePrinterConfig = printerConfig;
    cacheAdminSetupDone = setupDone === 'true';
    // No persisted active-user session: signing out or closing the app
    // always requires a fresh login (per-process session).
    cacheActiveUser = null;
  } else {
    cacheProducts = lsGet<Product[]>(LKEYS.PRODUCTS, []);
    cacheCustomers = lsGet<Customer[]>(LKEYS.CUSTOMERS, []);
    cacheSales = lsGet<SaleRecord[]>(LKEYS.SALES, []);
    cacheExpenditures = lsGet<Expenditure[]>(LKEYS.EXPENDITURES, []);
    cacheUsers = lsGet<User[]>(LKEYS.USERS, []);
    cacheAuditLogs = lsGet<AuditLog[]>(LKEYS.AUDIT_LOGS, []);
    cacheCategories = lsGet<Category[]>(LKEYS.CATEGORIES, []);
    cachePrinterConfig = lsGet<ThermalPrinterConfig | null>(LKEYS.PRINTER_CONFIG, null);
    cacheAdminSetupDone = lsGet<boolean>(LKEYS.ADMIN_SETUP_DONE, false);
    cacheActiveUser = lsGet<User | null>(LKEYS.ACTIVE_USER, null);
  }
}

export const isStorageInitialized = (): boolean => initialized;

// ============================================================
// PRODUCTS
// ============================================================

export const loadProducts = (): Product[] => cacheProducts;

export const saveProducts = (products: Product[]) => {
  cacheProducts = products;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveProducts(products));
  } else {
    lsSet(LKEYS.PRODUCTS, products);
  }
};

// ============================================================
// CUSTOMERS
// ============================================================

export const loadCustomers = (): Customer[] => cacheCustomers;

export const saveCustomers = (customers: Customer[]) => {
  cacheCustomers = customers;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveCustomers(customers));
  } else {
    lsSet(LKEYS.CUSTOMERS, customers);
  }
};

// ============================================================
// SALES
// ============================================================

export const loadSales = (): SaleRecord[] => cacheSales;

export const saveSales = (sales: SaleRecord[]) => {
  cacheSales = sales;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveSales(sales));
  } else {
    lsSet(LKEYS.SALES, sales);
  }
};

// ============================================================
// EXPENDITURES
// ============================================================

export const loadExpenditures = (): Expenditure[] => cacheExpenditures;

export const saveExpenditures = (expenditures: Expenditure[]) => {
  cacheExpenditures = expenditures;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveExpenditures(expenditures));
  } else {
    lsSet(LKEYS.EXPENDITURES, expenditures);
  }
};

// ============================================================
// PRINTER CONFIG
// ============================================================

export const loadPrinterConfig = (): ThermalPrinterConfig =>
  cachePrinterConfig || INITIAL_PRINTER_CONFIG;

export const savePrinterConfig = (config: ThermalPrinterConfig) => {
  cachePrinterConfig = config;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSavePrinterConfig(config));
  } else {
    lsSet(LKEYS.PRINTER_CONFIG, config);
  }
};

// ============================================================
// USERS
// ============================================================

export const loadUsers = (): User[] => cacheUsers;

export const saveUsers = (users: User[]) => {
  cacheUsers = users;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveUsers(users));
  } else {
    lsSet(LKEYS.USERS, users);
  }
};

// ============================================================
// AUDIT TRAIL
// ============================================================

export const loadAuditLogs = (): AuditLog[] => cacheAuditLogs;

export const saveAuditLogs = (logs: AuditLog[]) => {
  cacheAuditLogs = logs;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveAuditLogs(logs));
  } else {
    lsSet(LKEYS.AUDIT_LOGS, logs);
  }
};

export const recordAuditLog = (
  username: string,
  userRole: UserRole,
  action: string,
  details: string
): AuditLog => {
  let now = new Date();
  let dateStr = now.toISOString().split('T')[0];
  let timeStr = now.toTimeString().split(' ')[0];

  let newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    username: username || 'System',
    userRole: userRole || 'Cashier',
    action,
    details,
    timestamp: Date.now(),
    date: dateStr,
    time: timeStr,
  };

  cacheAuditLogs = [newLog, ...cacheAuditLogs];
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveAuditLogs(cacheAuditLogs));
  } else {
    lsSet(LKEYS.AUDIT_LOGS, cacheAuditLogs);
  }
  return newLog;
};

// ============================================================
// FIRST-TIME ADMIN SETUP FLAG
// ============================================================

export const isAdminSetupCompleted = (): boolean => cacheAdminSetupDone;

export const setAdminSetupCompleted = (done: boolean = true) => {
  cacheAdminSetupDone = done;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSetSetting('admin_setup_done', String(done)));
  } else {
    lsSet(LKEYS.ADMIN_SETUP_DONE, done);
  }
};

// ============================================================
// LICENSE AGREEMENT
// ============================================================

export const isLicenseAccepted = (): boolean => {
  if (isTauriRuntime()) {
    return lsGet<boolean>(LKEYS.LICENSE_ACCEPTED, false);
  }
  return lsGet<boolean>(LKEYS.LICENSE_ACCEPTED, false);
};

export const setLicenseAccepted = (accepted: boolean = true) => {
  lsSet(LKEYS.LICENSE_ACCEPTED, accepted);
};

// ============================================================
// ACTIVE USER SESSION
// ============================================================

export const getActiveUser = (): User | null => cacheActiveUser;

// Per-process session: the signed-in user is kept only in memory. Signing
// out or closing the app clears it, so every launch requires a fresh login.
export const setActiveUserStorage = (user: User | null) => {
  cacheActiveUser = user;
};

// ============================================================
// CATEGORIES
// ============================================================

export const loadCategories = (): Category[] => cacheCategories;

export const saveCategories = (categories: Category[]) => {
  cacheCategories = categories;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveCategories(categories));
  } else {
    lsSet(LKEYS.CATEGORIES, categories);
  }
};

// ============================================================
// BACKUP FOLDER CONFIGURATION
// ============================================================

export const getBackupFolderPath = (): string | null => {
  try {
    return localStorage.getItem('joainas_backup_folder_path');
  } catch (e) {
    console.error('Failed to get backup folder path', e);
    return null;
  }
};

export const setBackupFolderPath = (path: string): void => {
  try {
    localStorage.setItem('joainas_backup_folder_path', path);
  } catch (e) {
    console.error('Failed to save backup folder path', e);
  }
};

// ============================================================
// NATIVE FILE DIALOGS (Tauri) — pick where backups are saved,
// just like the restore flow lets you pick the file to import.
// Falls back to null on browser so callers keep web behavior.
// ============================================================

async function loadDialogPlugin(): Promise<typeof import('@tauri-apps/plugin-dialog') | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await import('@tauri-apps/plugin-dialog');
  } catch (e) {
    console.error('Dialog plugin unavailable', e);
    return null;
  }
}

async function loadFsPlugin(): Promise<typeof import('@tauri-apps/plugin-fs') | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await import('@tauri-apps/plugin-fs');
  } catch (e) {
    console.error('FS plugin unavailable', e);
    return null;
  }
}

// Open a native folder picker. Returns the selected folder path or null.
export async function pickBackupFolder(): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const selected = await dialog.open({
      title: 'Select BACKUP Folder',
      directory: true,
      multiple: false,
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick backup folder', e);
    return null;
  }
}

// Open a native save dialog for the backup file. Returns chosen path or null.
export async function pickBackupSavePath(defaultFileName: string): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const selected = await dialog.save({
      title: 'Save System Backup',
      defaultPath: defaultFileName,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick backup save path', e);
    return null;
  }
}

// Open a native save dialog for a receipt export (PNG/PDF). Returns chosen path or null.
export async function pickReceiptSavePath(defaultFileName: string, extension: string): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const selected = await dialog.save({
      title: 'Save Receipt Export',
      defaultPath: defaultFileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick receipt save path', e);
    return null;
  }
}

// Write the JSON backup payload to the chosen file path on disk.
export async function writeBackupFile(path: string, contents: string): Promise<void> {
  const fs = await loadFsPlugin();
  if (!fs) return;
  try {
    await fs.writeTextFile(path, contents);
  } catch (e) {
    console.error('Failed to write backup file', e);
    throw e;
  }
}

// Write a binary file (e.g. a generated receipt PNG/PDF) to a chosen path.
export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  const fs = await loadFsPlugin();
  if (!fs) return;
  try {
    await fs.writeFile(path, data);
  } catch (e) {
    console.error('Failed to write binary file', e);
    throw e;
  }
}

// Open a native file picker to locate an existing backup file. Returns its path or null.
export async function pickBackupFile(): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const selected = await dialog.open({
      title: 'Select Backup File to Restore',
      multiple: false,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick backup file', e);
    return null;
  }
}

// Read the JSON contents of a backup file picked earlier (or its raw text).
export async function readBackupFile(path: string): Promise<string> {
  const fs = await loadFsPlugin();
  if (!fs) throw new Error('FS plugin unavailable');
  try {
    return await fs.readTextFile(path);
  } catch (e) {
    console.error('Failed to read backup file', e);
    throw e;
  }
}

// ============================================================
// LIVE DATABASE LOCATION
// The database file itself lives in Documents\Backup by default,
// or the folder the admin picks. This is a one-time note shown to
// the admin if a legacy database was moved into place at startup.
// ============================================================

// Returns a human-friendly note if the live database was migrated to the
// new Documents\Backup location on this startup, otherwise null.
export async function getDatabaseMigrationNote(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const info = await getDbInfo();
    if (info && info.migrated) {
      return `Your database was found in the old app-data folder and has been moved to ${info.folder} for easy access. All your data is safe.`;
    }
    return null;
  } catch (e) {
    console.error('Failed to check database migration note', e);
    return null;
  }
}

// Pick a new folder for the live database and relocate the DB file there.
// Returns the new folder path on success, or null if cancelled/failed.
export async function relocateDatabaseFolder(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const picked = await pickBackupFolder();
  if (!picked) return null;
  try {
    const result = await relocateDatabaseTo(picked);
    if (!result) {
      console.error('Database relocation returned no result');
      return null;
    }
    setBackupFolderPath(result.folder);
    return result.folder;
  } catch (e) {
    console.error('Failed to relocate database folder', e);
    return null;
  }
}

// ============================================================
// MISC UTILITIES
// ============================================================

export const formatNaira = (amount: number): string => {
  let num = Math.abs(amount);
  let formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num).replace('NGN', '₦');

  return amount < 0 ? `-${formatted}` : formatted;
};

// Play POS scanner beep sound using Web Audio API
export const playPOSBeep = () => {
  try {
    let AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let audioCtx = new AudioCtx();
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    console.log('Audio context not allowed or unsupported', e);
  }
};
