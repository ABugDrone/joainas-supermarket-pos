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
import { INITIAL_PRINTER_CONFIG, DEFAULT_CATEGORIES } from '../data/initialData';
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
  dbClearTable,
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

// Wait until every queued SQLite write has completed. Critical before
// transitioning out of first-time setup: it guarantees the admin account
// (and the setup flag) are durable on disk, so closing the app right after
// setup can never lose the account and strand the user at a login screen
// with no users to sign in with. A generous timeout keeps a stuck write from
// ever freezing the UI — if it times out we continue with the in-memory cache
// (the app still works for the session and recovers on the next launch).
export async function flushWrites(timeoutMs: number = 15000): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await Promise.race([
      writeQueue,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (e) {
    console.error('Failed to flush queued SQLite writes', e);
  }
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
    // The setup-completed flag is mirrored to localStorage as a safety net so
    // a freshly-upgraded database can never bounce the user back into the
    // first-time setup wizard. If the SQLite read fails for any reason the
    // app still lands on the login gate instead of the setup screen.
    cacheAdminSetupDone = setupDone === 'true' || lsGet<boolean>(LKEYS.ADMIN_SETUP_DONE, false);
    // Restore any still-valid session from sessionStorage — this is what
    // lets a browser refresh keep the user logged in while a full close
    // clears it (sessionStorage is per-tab and dies with the window).
    cacheActiveUser = readSessionUser();

    // Seed default category colors on a fresh database so the POS grid has
    // color-coded classification from the first launch. Existing data is kept.
    if (categories.length === 0) {
      saveCategories(DEFAULT_CATEGORIES);
    }
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
    cacheActiveUser = readSessionUser() ?? lsGet<User | null>(LKEYS.ACTIVE_USER, null);

    if (cacheCategories.length === 0) {
      saveCategories(DEFAULT_CATEGORIES);
    }
  }
}

export const isStorageInitialized = (): boolean => initialized;

// ============================================================
// PRODUCTS
// ============================================================

export const loadProducts = (): Product[] => cacheProducts;

export const saveProducts = (products: Product[]) => {
  // Guard: transient load failures that left the cache empty (or stale)
  // must never let an empty write silently wipe a populated catalog.
  // Intentional full clears go through resetAllSystemData() which calls
  // the DB layer directly and bypasses this guard. The single-item
  // delete case (1 → 0) is allowed so the last product can still be
  // removed; wiping dozens of rows by accident is blocked.
  if (products.length === 0 && cacheProducts.length > 1) {
    console.warn('Blocked accidental empty product save — keeping existing catalog.');
    return;
  }
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
  if (customers.length === 0 && cacheCustomers.length > 1) {
    console.warn('Blocked accidental empty customer save.');
    return;
  }
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
  if (sales.length === 0 && cacheSales.length > 1) {
    console.warn('Blocked accidental empty sales save.');
    return;
  }
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
  if (expenditures.length === 0 && cacheExpenditures.length > 1) {
    console.warn('Blocked accidental empty expenditure save.');
    return;
  }
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
  if (users.length === 0 && cacheUsers.length > 0) {
    console.warn('Blocked accidental empty user save — accounts would be lost.');
    return;
  }
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

// ============================================================
// WINDOW-CLOSE FLUSH — prevents data loss when the user
// closes the app before queued SQLite writes have finished.
// Tauri intercepts the window close, flushes every pending write,
// then allows the close to proceed. A pagehide fallback covers
// browser quits and hard kills.
// ============================================================

let closeFlushRegistered = false;

export async function registerCloseFlush(): Promise<void> {
  if (closeFlushRegistered) return;
  closeFlushRegistered = true;

  // Best-effort flush on pagehide / beforeunload (browser + WebView fallback).
  const bestEffortFlush = () => {
    void flushWrites(3000);
  };
  window.addEventListener('pagehide', bestEffortFlush);
  window.addEventListener('beforeunload', bestEffortFlush);

  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    let allowClose = false;
    await win.onCloseRequested(async (event) => {
      if (allowClose) return;
      event.preventDefault();
      try {
        await flushWrites(15000);
      } catch (e) {
        console.error('Flush on close failed', e);
      } finally {
        allowClose = true;
        await win.close();
      }
    });
  } catch (e) {
    console.error('Failed to register Tauri close handler', e);
  }
}

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
  // Mirror to localStorage too (belt-and-suspenders) so the flag survives even
  // if a queued SQLite write is interrupted by the app closing.
  lsSet(LKEYS.ADMIN_SETUP_DONE, done);
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSetSetting('admin_setup_done', String(done)));
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
// ACTIVE USER SESSION — survives refresh, cleared only on close
// ============================================================
// Browser preview: the user asked that "refresh should not lead to log
// out only close of app can automatically log out".  The old code kept
// the active user only in memory, so any reload (F5 / browser refresh
// button) wiped the session and forced a re-login.  We now mirror the
// session into sessionStorage — it survives reloads/re-renders but is
// automatically cleared when the tab/window (or Tauri WebView) is closed,
// which is exactly the requested semantics.  Tauri desktop also gets this
// behaviour; closing the app destroys the WebView and its sessionStorage.

const readSessionUser = (): User | null => {
  try {
    const raw = sessionStorage.getItem(LKEYS.ACTIVE_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const getActiveUser = (): User | null => cacheActiveUser ?? readSessionUser();

export const setActiveUserStorage = (user: User | null) => {
  cacheActiveUser = user;
  try {
    if (user) {
      sessionStorage.setItem(LKEYS.ACTIVE_USER, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(LKEYS.ACTIVE_USER);
    }
  } catch {}
};

// ============================================================
// CATEGORIES
// ============================================================

export const loadCategories = (): Category[] => cacheCategories;

export const saveCategories = (categories: Category[]) => {
  if (categories.length === 0 && cacheCategories.length > 1) {
    console.warn('Blocked accidental empty category save.');
    return;
  }
  cacheCategories = categories;
  if (isTauriRuntime()) {
    enqueueWrite(() => dbSaveCategories(categories));
  } else {
    lsSet(LKEYS.CATEGORIES, categories);
  }
};

// ============================================================
// ADMIN SYSTEM RESET (Backup & Restore panel)
// Wipes test/dummy business data so the store can start fresh WITHOUT
// losing user accounts, printer/hardware config, or the login gate.
// Admin-only access (the whole Admin module requires the 'admin'
// capability).
// ============================================================

// Enqueue a write task and wait for the whole queue (including any writes
// queued earlier, e.g. a sale that was just completed) to finish. Used by the
// admin reset actions so the cleared tables are durable on disk BEFORE the UI
// reloads or the user logs out — otherwise the old rows would come straight
// back on the next launch.
const enqueueAndFlush = async (task: () => Promise<void>): Promise<void> => {
  enqueueWrite(task);
  await flushWrites();
};

// Full factory reset: clears every business table, restores the default
// categories and starts fresh. User accounts, the printer/hardware config
// and the completed-setup flag are kept, so the app returns to the LOGIN
// gate (never back to the first-time setup wizard). Returns a promise that
// resolves once the changes are durable on disk.
export const resetAllSystemData = async (): Promise<void> => {
  cacheProducts = [];
  cacheSales = [];
  cacheCustomers = [];
  cacheExpenditures = [];
  cacheCategories = [...DEFAULT_CATEGORIES];
  cacheAuditLogs = [];
  if (isTauriRuntime()) {
    await enqueueAndFlush(async () => {
      await dbSaveProducts([]);
      await dbSaveSales([]);
      await dbSaveCustomers([]);
      await dbSaveExpenditures([]);
      await dbSaveCategories(DEFAULT_CATEGORIES);
      await dbClearTable('inventory_adjustments');
    });
    return;
  }
  lsSet(LKEYS.PRODUCTS, []);
  lsSet(LKEYS.SALES, []);
  lsSet(LKEYS.CUSTOMERS, []);
  lsSet(LKEYS.EXPENDITURES, []);
  lsSet(LKEYS.CATEGORIES, DEFAULT_CATEGORIES);
  lsSet(LKEYS.AUDIT_LOGS, []);
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

// Open a file (e.g. a saved PDF) with the OS default application.
// In the desktop app this launches the default PDF viewer (Foxit Reader,
// Edge, etc.) so the user can print from there. No-op on the web preview.
export async function openInDefaultApp(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const shell = await import('@tauri-apps/plugin-shell');
    await shell.open(path);
  } catch (e) {
    console.error('Failed to open file with default app', e);
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

// Play a distinct low-stock alert tone (double beep) so the user notices
// the notification even without looking at the screen.
export const playLowStockAlert = () => {
  try {
    let AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let audioCtx = new AudioCtx();

    const tone = (freq: number, startAt: number, duration: number) => {
      let osc = audioCtx.createOscillator();
      let gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startAt);
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + startAt);
      osc.stop(audioCtx.currentTime + startAt + duration);
    };

    // Two short descending beeps — clearly distinguishable from the scanner beep.
    tone(880, 0, 0.18);
    tone(660, 0.22, 0.28);
  } catch (e) {
    console.log('Audio context not allowed or unsupported', e);
  }
};
