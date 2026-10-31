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
import { INITIAL_PRINTER_CONFIG, DEFAULT_CATEGORIES, LEGACY_DEFAULT_CATEGORIES } from '../data/initialData';
import {
  isValidBackupPayload,
  mergeBackupProducts,
  normalizeLegacyBackup,
} from './backup';
import {
  isTauriRuntime,
  dbLoadProducts,
  dbSaveProducts,
  dbUpsertProducts,
  dbDeleteProducts,
  dbLoadCustomers,
  dbSaveCustomers,
  dbUpsertCustomers,
  dbDeleteCustomers,
  dbLoadContracts,
  dbSaveContracts,
  dbLoadMicroPayments,
  dbRecordMicroPayment,
  dbDeleteMicroPayment,
  dbSetMicroRemitted,
  dbSetContractDownRemitted,
  dbLoadSales,
  dbSaveSales,
  dbUpsertSales,
  dbDeleteSales,
  dbLoadExpenditures,
  dbSaveExpenditures,
  dbUpsertExpenditures,
  dbDeleteExpenditures,
  dbLoadPrinterConfig,
  dbSavePrinterConfig,
  dbLoadUsers,
  dbSaveUsers,
  dbLoadAuditLogs,
  dbSaveAuditLogs,
  dbAppendAuditLogs,
  dbCheckpointWal,
  dbLoadCategories,
  dbSaveCategories,
  dbGetSetting,
  dbSetSetting,
  dbDeleteSetting,
  dbClearTable,
  getDbInfo,
  getDbUrl,
  relocateDatabaseTo,
} from './db';
import {
  hydrateAnchor as hydrateTimeAnchor,
  checkWallClock,
  touchClock,
  validateNewSale,
  advanceForSale,
  reanchor as reanchorClockAnchor,
  getAnchor as getTimeAnchor,
  getEffectiveGate,
  validateStartupTime,
  reportStartupTamper,
  clearStartupTamper,
  refreshGate,
  acceptStartupTime,
  type ClockGate,
} from './trustedTime';
import { hasActiveClockOverride } from './clockOverride';
import { formatMoney, hydrateCurrency } from './currency';

// ============================================================
// IN-MEMORY CACHE — source of truth for the running session.
// Persisted to the internal SQLite database (Tauri) or
// localStorage (browser dev fallback).
// ============================================================

let initialized = false;

let cacheProducts: Product[] = [];
let cacheCustomers: Customer[] = [];
let cacheContracts: any[] = [];
let cacheMicroPayments: any[] = [];
let cacheSales: SaleRecord[] = [];
let cacheExpenditures: Expenditure[] = [];
let cacheUsers: User[] = [];
let cacheAuditLogs: AuditLog[] = [];
let cacheCategories: Category[] = [];
let cachePrinterConfig: ThermalPrinterConfig | null = null;
let cacheAdminSetupDone = false;
let cacheActiveUser: User | null = null;

// ============================================================
// ON-DEVICE DEBUG LOG (v1.4.9)
// Ring buffer (cap 200) mirrored to Documents\Backup\pos-debug.log (or the
// live DB folder) so startup mysteries are readable on the shop PC without
// devtools. Best-effort only — never throws.
// ============================================================

const DEBUG_RING: string[] = [];
let debugDir: string | null = null;

export function debugLog(msg: string): void {
  try {
    const line = `[${new Date().toISOString()}] ${msg}`;
    DEBUG_RING.push(line);
    if (DEBUG_RING.length > 200) DEBUG_RING.splice(0, DEBUG_RING.length - 200);
    console.info('[pos-debug]', msg);
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        if (!debugDir) {
          const info = await getDbInfo().catch(() => null);
          debugDir = info?.folder || null;
          if (!debugDir) return;
        }
        const fs = await loadFsPlugin().catch(() => null);
        if (!fs) return;
        await (fs as any).writeTextFile(
          `${debugDir.replace(/[/\\]+$/, '')}\\pos-debug.log`,
          DEBUG_RING.join('\n')
        );
      } catch {}
    })();
  } catch {}
}

// Serialized write queue — keeps DB writes in order.
let writeQueue: Promise<void> = Promise.resolve();
function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const withRetry = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await task();
        return;
      } catch (e) {
        console.error(`SQLite write failed attempt ${attempt + 1}`, e);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        } else {
          throw e;
        }
      }
    }
  };
  writeQueue = writeQueue.then(withRetry).catch((e) => console.error('SQLite write failed after retries', e));
  return writeQueue;
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
  PRODUCTS: 'senior_citizen_accessories_products_v1',
  CUSTOMERS: 'senior_citizen_accessories_customers_v1',
  SALES: 'senior_citizen_accessories_sales_v1',
  EXPENDITURES: 'senior_citizen_accessories_expenditures_v1',
  PRINTER_CONFIG: 'senior_citizen_accessories_printer_config_v1',
  USERS: 'senior_citizen_accessories_users_v1',
  AUDIT_LOGS: 'senior_citizen_accessories_audit_logs_v1',
  CATEGORIES: 'senior_citizen_accessories_categories_v1',
  CONTRACTS: 'senior_citizen_accessories_contracts_v1',
  MICRO_PAYMENTS: 'senior_citizen_accessories_micropayments_v1',
  ADMIN_SETUP_DONE: 'senior_citizen_accessories_admin_setup_done_v1',
  ACTIVE_USER: 'senior_citizen_accessories_active_user_v1',
  LICENSE_ACCEPTED: 'senior_citizen_accessories_license_accepted_v1',
};

// Legacy (pre-1.4.5, Joainas-branded) localStorage keys. The 1.4.5 rebrand
// renamed every key, which orphaned license/setup/vault/snapshot data on
// upgrade and made the app look wiped. Migrate once, then the new keys win.
const LEGACY_KEYS: Record<string, string> = {
  senior_citizen_accessories_products_v1: 'joainas_products_v1',
  senior_citizen_accessories_customers_v1: 'joainas_customers_v1',
  senior_citizen_accessories_sales_v1: 'joainas_sales_v1',
  senior_citizen_accessories_expenditures_v1: 'joainas_expenditures_v1',
  senior_citizen_accessories_printer_config_v1: 'joainas_printer_config_v1',
  senior_citizen_accessories_users_v1: 'joainas_users_v1',
  senior_citizen_accessories_audit_logs_v1: 'joainas_audit_logs_v1',
  senior_citizen_accessories_categories_v1: 'joainas_categories_v1',
  senior_citizen_accessories_admin_setup_done_v1: 'joainas_admin_setup_done_v1',
  senior_citizen_accessories_active_user_v1: 'joainas_active_user_v1',
  senior_citizen_accessories_license_accepted_v1: 'joainas_license_accepted_v1',
  senior_citizen_accessories_backup_folder_path: 'joainas_backup_folder_path',
  senior_citizen_accessories_admin_recovery_v1: 'joainas_admin_recovery_v1',
  senior_citizen_accessories_autosave_snapshot_v1: 'joainas_autosave_snapshot_v1',
  senior_citizen_accessories_app_theme_v2: 'joainas_app_theme_v2',
};
const LEGACY_THEME_IDS: Record<string, string> = {
  'joainas-light': 'emerald-fresh',
  'joainas-dark': 'SENIOR_CITIZEN-dark',
};

// ============================================================
// SIBLING-DATABASE UNITE (v1.4.8)
// Runs first in the Tauri branch, before any table is read: every known
// database location other than the live file is ATTACH-merged into it
// (see dbMergeFromFile — idempotent, never overwrites). This heals all
// strandings: stale pointers to empty files, rebrand orphans, relocated
// folders. A notice is surfaced when rows were actually recovered.
// ============================================================

function normDbPath(p: string): string {
  return String(p || '')
    .replace(/^sqlite:/i, '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase();
}

export async function tryMergeSiblingDatabases(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { dbMergeFromFile } = await import('./db');
    const url = await getDbUrl();
    const live = normDbPath(url);
    const fs = await loadFsPlugin();
    if (!fs) return null;
    const fmod = fs as any;
    const names = ['senior_citizen_accessories.db', 'joainas_pos.db'];
    const candidates = new Map<string, string>(); // norm -> display
    const pushCand = (p: string) => {
      if (!p) return;
      const n = normDbPath(p);
      if (!n || n === live || candidates.has(n)) return;
      candidates.set(n, p);
    };
    const stripFile = (p: string) => String(p || '').replace(/[/\\]+$/, '');
    // Live folder, its parent, and parent\Backup (covers Documents vs
    // Documents\Backup splits in either direction).
    try {
      const info = await getDbInfo();
      if (info?.folder) {
        const f = stripFile(info.folder);
        const parent = f.replace(/[/\\]+[^/\\]+$/, '');
        for (const n of names) pushCand(`${f}\\${n}`);
        if (parent && parent !== f) {
          for (const n of names) pushCand(`${parent}\\${n}`);
        }
        if (/backup$/i.test(f)) {
          for (const n of names) pushCand(`${parent}\\${n}`);
        } else {
          for (const n of names) pushCand(`${f}\\Backup\\${n}`);
        }
      }
    } catch {}
    // Legacy + current %APPDATA% pointer targets (old and new app ids) —
    // these often name the true previous home, including user-relocated DBs.
    try {
      const pathMod = await import('@tauri-apps/api/path').catch(() => null);
      if (pathMod?.appDataDir && fmod?.readTextFile) {
        const base = await pathMod.appDataDir().catch(() => '');
        if (base) {
          const thisDir = stripFile(String(base).replace(/[/\\]+$/, ''));
          const parentDir = thisDir.replace(/[/\\]+[^/\\]+$/, '');
          for (const appId of ['com.seniorcitizen.accessories.desktop', 'com.joainas.pos.desktop']) {
            const sibling = parentDir ? `${parentDir}\\${appId}` : '';
            if (sibling) {
              for (const n of names) pushCand(`${sibling}\\${n}`);
              try {
                const target = (await fmod.readTextFile(`${sibling}\\db_path.txt`).catch(() => '')).trim();
                if (target) pushCand(target);
              } catch {}
            }
          }
        }
      }
    } catch {}
    const recovered: Array<{ file: string; users: number; sales: number }> = [];
    for (const [, display] of candidates) {
      try {
        let exists = false;
        try {
          exists = await fmod.exists(display);
        } catch {
          exists = true; // blind attempt — ATTACH fails safe
        }
        if (!exists) continue;
        const added = await dbMergeFromFile(display);
        const u = added['users'] || 0;
        const s = added['sales'] || 0;
        if (u > 0 || s > 0 || Object.values(added).some((n) => n > 0)) {
          recovered.push({ file: display.split(/[/\\]/).pop() || display, users: u, sales: s });
        }
      } catch (e) {
        console.error('Sibling merge failed for', display, e);
      }
    }
    if (recovered.length > 0) {
      const parts = recovered.map((r) => {
        const bits: string[] = [];
        if (r.users > 0) bits.push(`${r.users} account${r.users === 1 ? '' : 's'}`);
        if (r.sales > 0) bits.push(`${r.sales} receipt${r.sales === 1 ? '' : 's'}`);
        return `${bits.join(' + ') || 'records'} from ${r.file}`;
      });
      const msg = `Recovered ${parts.join('; ')}. All databases are now united — please restart the app.`;
      recoveryNotice = msg;
      console.info(msg);
      return msg;
    }
  } catch (e) {
    console.error('Sibling database unite failed', e);
  }
  return null;
}

function migrateLegacyKeys(): void {
  try {
    for (const [next, prev] of Object.entries(LEGACY_KEYS)) {
      if (localStorage.getItem(next) == null) {
        const old = localStorage.getItem(prev);
        if (old != null) {
          localStorage.setItem(next, old);
        }
      }
    }
    // Remap a saved Joainas theme id to its Senior Citizen equivalent.
    try {
      const t = localStorage.getItem('senior_citizen_accessories_app_theme_v2');
      if (t && LEGACY_THEME_IDS[t]) {
        localStorage.setItem('senior_citizen_accessories_app_theme_v2', LEGACY_THEME_IDS[t]);
      }
    } catch {}
  } catch (e) {
    console.error('Legacy key migration failed', e);
  }
}

// Local calendar date (YYYY-MM-DD) — sales are recorded in LOCAL time, so
// every picker default and "today" comparison must use this (UTC via
// toISOString is off-by-one in WAT and hides today's records).
export const todayLocal = (): string => new Date().toLocaleDateString('en-CA');

// Historical-sale snapshot backfill. Products are NEVER given a minPrice here
// — a legacy single price is a maximum, not a floor. Past sale items without
// floor/ceiling snapshots are regarded as their own single price so old
// receipts stay readable.
function backfillMinPrices(): boolean {
  let changed = false;
  try {
    // Normalize stored dates to YYYY-MM-DD (older rows may carry time parts
    // that break picker/range comparisons).
    cacheSales = cacheSales.map((s) => {
      const d = typeof s.date === 'string' && s.date.length > 10 ? s.date.slice(0, 10) : s.date;
      return d === s.date ? s : { ...s, date: d };
    });

    let salesChanged = false;
    cacheSales = cacheSales.map((s) => {
      let dirty = false;
      const items = (s.items || []).map((it) => {
        if ((it.floorAtSale === undefined || it.floorAtSale === null) && Number.isFinite(it.rate)) {
          dirty = true;
          return { ...it, floorAtSale: it.rate, ceilingAtSale: it.ceilingAtSale ?? it.rate };
        }
        if ((it.ceilingAtSale === undefined || it.ceilingAtSale === null) && Number.isFinite(it.rate)) {
          dirty = true;
          return { ...it, ceilingAtSale: it.rate };
        }
        return it;
      });
      if (dirty) {
        salesChanged = true;
        return { ...s, items };
      }
      return s;
    });
    if (salesChanged) changed = true;
  } catch (e) {
    console.error('Sale snapshot backfill failed', e);
  }
  return changed;
}

// SINGLE-FILE localStorage cache (v1.4.8 architecture).
// Business data lives HERE first: every mutation updates the in-memory
// caches and REPLACES this one file (no pile-up, storage stays ~constant).
// SQLite is the durable vault, written ONLY at session boundaries
// (logout, window close, pagehide/shutdown, periodic dirty check) via
// persistAllToDatabase(). LocalStorage keeps business going; the vault
// catches up in one replace — no per-keystroke redundancies.
const AUTOSAVE_KEY = 'senior_citizen_accessories_autosave_snapshot_v1';

interface AutosaveSnapshot {
  products: Product[];
  sales: SaleRecord[];
  customers: Customer[];
  expenditures: Expenditure[];
  users?: User[];
  categories?: Category[];
  printerConfig?: ThermalPrinterConfig | null;
  timestamp: number;
  version: number;
  appName?: string;
  appVersion?: string;
}

const SNAPSHOT_MAX_SALES_TAURI = 1500;
const SNAPSHOT_DEBOUNCE_TAURI = 1500;
const SNAPSHOT_DEBOUNCE_BROWSER = 400;
const AUDIT_CACHE_CAP = 2000;

let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

function notifyStorageWarning(message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('storage-warning', { detail: message }));
  } catch {}
}

function buildAutosaveSnapshot(slim: boolean): AutosaveSnapshot {
  const sales =
    slim && cacheSales.length > SNAPSHOT_MAX_SALES_TAURI
      ? cacheSales.slice(0, SNAPSHOT_MAX_SALES_TAURI)
      : cacheSales;
  return {
    products: cacheProducts,
    sales,
    customers: cacheCustomers,
    expenditures: cacheExpenditures,
    users: cacheUsers,
    categories: cacheCategories,
    printerConfig: cachePrinterConfig,
    timestamp: Date.now(),
    version: 1,
    appName: 'Joainas Mart',
    appVersion: '2.0.6',
  };
}

function writeAutosaveSnapshotNow(): void {
  const slim = isTauriRuntime();
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildAutosaveSnapshot(slim)));
  } catch (e) {
    // Quota exceeded — retry with the smallest useful recovery copy, then
    // warn visibly. SQLite is the live store, so nothing is lost.
    try {
      const tiny: AutosaveSnapshot = {
        ...buildAutosaveSnapshot(true),
        sales: cacheSales.slice(0, 200),
        expenditures: [],
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(tiny));
      console.warn('Browser cache full — emergency snapshot trimmed.', e);
      notifyStorageWarning(
        'Browser cache is full — the emergency copy was trimmed. Your data is saved in the database.'
      );
    } catch {
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch {}
      console.error('Autosave snapshot failed (quota)', e);
      notifyStorageWarning(
        'Browser cache is full — the emergency copy was skipped. Your data is still saved in the database.'
      );
    }
  }
  markDirty();
}

/**
 * Write the emergency browser-storage copy. Debounced by default so a burst
 * of edits (or a 1000+ item save) never blocks the UI thread; pass
 * `immediate` at boundaries (logout, close, pagehide) where the process is
 * about to disappear.
 */
export function saveAutosaveSnapshot(immediate: boolean = false): void {
  markDirty();
  if (immediate) {
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
    writeAutosaveSnapshotNow();
    return;
  }
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(
    () => {
      snapshotTimer = null;
      writeAutosaveSnapshotNow();
    },
    isTauriRuntime() ? SNAPSHOT_DEBOUNCE_TAURI : SNAPSHOT_DEBOUNCE_BROWSER
  );
}

export function loadAutosaveSnapshot(): AutosaveSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutosaveSnapshot;
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) return null;
    if (parsed.customers && !Array.isArray(parsed.customers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutosaveSnapshot(): void {
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {}
}

// ============================================================
// DIRTY FLAG + VAULT FLUSH (v1.4.8)
// Every mutation marks the vault stale. persistAllToDatabase() writes ALL
// tables from the caches in one sequential pass and runs ONLY at session
// boundaries (logout, close, shutdown, periodic check) — or when forced.
// Skipped entirely when nothing changed, so idle boundaries cost nothing.
// ============================================================

let vaultDirty = false;
let persistRunning = false;

export function markDirty(): void {
  vaultDirty = true;
}

export function isVaultDirty(): boolean {
  return vaultDirty;
}

// ============================================================
// LIVE INCREMENTAL SAVE (v2.0.7)
// SQLite is the live store. Every mutation schedules a diff of the affected
// collection; 400 ms later ONLY the rows that actually changed are upserted
// (and removed ids deleted). A 1000-item catalog therefore costs one small
// write per edit instead of rewriting every table — no UI stalls, no
// localStorage quota blow-up, no lost deletions on the next launch.
// ============================================================

type PersistKind = 'products' | 'sales' | 'customers' | 'expenditures';

const PERSIST_KINDS: PersistKind[] = ['products', 'sales', 'customers', 'expenditures'];
const INCREMENTAL_DEBOUNCE_MS = 400;

const persistedSigs: Record<PersistKind, Map<string, string>> = {
  products: new Map(),
  sales: new Map(),
  customers: new Map(),
  expenditures: new Map(),
};

const pendingKinds = new Set<PersistKind>();
let incrementalTimer: ReturnType<typeof setTimeout> | null = null;
let incrementalChain: Promise<void> = Promise.resolve();

function rowsFor(kind: PersistKind): any[] {
  switch (kind) {
    case 'products':
      return cacheProducts;
    case 'sales':
      return cacheSales;
    case 'customers':
      return cacheCustomers;
    case 'expenditures':
      return cacheExpenditures;
  }
}

function rowSignature(row: any): string {
  try {
    return JSON.stringify(row);
  } catch {
    return `${Math.random()}`;
  }
}

/**
 * Record the rows currently on disk as "already saved". Called once after the
 * startup read (before any snapshot adoption/migration) so only genuine
 * changes are written afterwards.
 */
export function resetPersistedSignatures(): void {
  for (const kind of PERSIST_KINDS) {
    const map = new Map<string, string>();
    for (const row of rowsFor(kind)) {
      if (row && row.id) map.set(row.id, rowSignature(row));
    }
    persistedSigs[kind] = map;
  }
}

async function persistKind(kind: PersistKind): Promise<void> {
  const rows = rowsFor(kind);
  const prev = persistedSigs[kind];
  const next = new Map<string, string>();
  const changed: any[] = [];

  for (const row of rows) {
    if (!row || !row.id) continue;
    const sig = rowSignature(row);
    next.set(row.id, sig);
    if (prev.get(row.id) !== sig) changed.push(row);
  }

  const removed: string[] = [];
  prev.forEach((_sig, id) => {
    if (!next.has(id)) removed.push(id);
  });

  if (kind === 'products') {
    if (changed.length > 0) await dbUpsertProducts(changed);
    if (removed.length > 0) await dbDeleteProducts(removed);
  } else if (kind === 'sales') {
    if (changed.length > 0) await dbUpsertSales(changed);
    if (removed.length > 0) await dbDeleteSales(removed);
  } else if (kind === 'customers') {
    if (changed.length > 0) await dbUpsertCustomers(changed);
    if (removed.length > 0) await dbDeleteCustomers(removed);
  } else {
    if (changed.length > 0) await dbUpsertExpenditures(changed);
    if (removed.length > 0) await dbDeleteExpenditures(removed);
  }

  persistedSigs[kind] = next;
}

function scheduleIncremental(kind: PersistKind): void {
  markDirty();
  pendingKinds.add(kind);
  if (!isTauriRuntime()) return;
  if (incrementalTimer) return;
  incrementalTimer = setTimeout(() => {
    incrementalTimer = null;
    void flushIncremental();
  }, INCREMENTAL_DEBOUNCE_MS);
}

/** Write every pending change now (order preserved by the write queue). */
export function flushIncremental(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  if (pendingKinds.size === 0) return incrementalChain;
  const kinds = Array.from(pendingKinds);
  pendingKinds.clear();
  incrementalChain = incrementalChain
    .then(() =>
      enqueueWrite(async () => {
        for (const kind of kinds) {
          try {
            await persistKind(kind);
          } catch (e) {
            console.error(`Incremental save failed: ${kind}`, e);
          }
        }
      })
    )
    .catch((e) => console.error('Incremental save chain failed', e));
  return incrementalChain;
}

/** Diff-and-save every collection (startup migrations, logout, close). */
export async function flushAllIncremental(): Promise<void> {
  if (!isTauriRuntime()) return;
  for (const kind of PERSIST_KINDS) pendingKinds.add(kind);
  if (incrementalTimer) {
    clearTimeout(incrementalTimer);
    incrementalTimer = null;
  }
  await flushIncremental();
}

// Users, categories, printer config and the setup flag are small tables; write
// them directly at boundaries (never table-wide when the cache is empty — a
// failed read must not wipe real accounts).
export async function persistSmallConfig(): Promise<void> {
  if (!isTauriRuntime()) return;
  await enqueueWrite(async () => {
    if (cacheUsers.length > 0) await dbSaveUsers([...cacheUsers]);
    if (cacheCategories.length > 0) await dbSaveCategories([...cacheCategories]);
    if (cachePrinterConfig) await dbSavePrinterConfig({ ...cachePrinterConfig });
    await dbSetSetting('admin_setup_done', String(cacheAdminSetupDone));
  });
}

// Audit rows are append-only and batched: one small insert per burst instead
// of rewriting the whole trail (which used to grow without limit).
let auditAppendBuffer: AuditLog[] = [];
let auditAppendTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAuditAppend(log: AuditLog): void {
  if (!isTauriRuntime()) return;
  auditAppendBuffer.push(log);
  if (auditAppendTimer) return;
  auditAppendTimer = setTimeout(() => {
    auditAppendTimer = null;
    void flushAuditAppend();
  }, 800);
}

export function flushAuditAppend(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  if (auditAppendTimer) {
    clearTimeout(auditAppendTimer);
    auditAppendTimer = null;
  }
  const batch = auditAppendBuffer;
  auditAppendBuffer = [];
  if (batch.length === 0) return Promise.resolve();
  return enqueueWrite(() => dbAppendAuditLogs(batch));
}

export async function persistAllToDatabase(force: boolean = false, timeoutMs: number = 12000): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  if (!force && !vaultDirty) return true;
  if (persistRunning) return true; // a flush is already in flight — no stacking
  persistRunning = true;
  let ok = true;
  const step = async (label: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (e) {
      ok = false;
      console.error(`Vault flush failed: ${label}`, e);
    }
  };
  const run = (async () => {
    await step('products', () => dbSaveProducts([...cacheProducts]));
    await step('sales', () => dbSaveSales([...cacheSales]));
    await step('customers', () => dbSaveCustomers([...cacheCustomers]));
    await step('expenditures', () => dbSaveExpenditures([...cacheExpenditures]));
    await step('users', () => dbSaveUsers([...cacheUsers]));
    await step('categories', () => dbSaveCategories([...cacheCategories]));
    await step('audit', () => dbSaveAuditLogs([...cacheAuditLogs]));
    if (cachePrinterConfig) {
      await step('printer', () => dbSavePrinterConfig({ ...cachePrinterConfig as ThermalPrinterConfig }));
    }
    await step('setup-flag', () => dbSetSetting('admin_setup_done', String(cacheAdminSetupDone)));
    await flushWrites(3000);
  })();
  try {
    await Promise.race([
      run,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('vault flush timeout')), timeoutMs)),
    ]);
  } catch (e) {
    ok = false;
    console.error('Vault flush timed out', e);
  }
  persistRunning = false;
  if (ok) vaultDirty = false;
  return ok;
}

// Pending one-time notice for the UI (e.g. "Recovered 132 old receipts").
let recoveryNotice: string | null = null;
export function consumeRecoveryNotice(): string | null {
  const n = recoveryNotice;
  recoveryNotice = null;
  return n;
}

// ============================================================
// JSON BACKUP AUTO-RECOVERY (v1.4.7)
// The 1.4.5 rebrand orphaned data for shops whose only surviving copy is a
// JSON backup file (no legacy .db to copy). When the live database has NO
// sales at all, scan the live DB folder for *backup*.json files, validate
// the Joainas/Senior Citizen schema, and merge sales + items + missing
// products/customers (dedupe by id — never duplicates, never overwrites).
// Users are imported ONLY when the live DB has zero accounts, and then the
// setup flag is set so the shop is not forced through setup again.
// Runs at most once per backup file (marker in app_settings).
// ============================================================

// Merge a validated backup payload into the live caches (dedupe by id AND
// barcode, never overwrites). Returns genuinely-new counts. Legacy payloads
// are normalized first: every item becomes a Product, categories move under
// Products, and single prices become maximums. Live stock is never touched.
// Shared by auto-recovery and the manual login-screen recovery panel.
export function adoptBackupPayload(parsed: any): { sales: number; users: number; products: number } {
  let sales = 0;
  let users = 0;
  let products = 0;
  try {
    const payload = normalizeLegacyBackup(parsed);
    const bSales: SaleRecord[] = Array.isArray(payload.sales) ? payload.sales : [];
    const bProducts: Product[] = Array.isArray(payload.products) ? payload.products : [];
    const bCustomers: Customer[] = Array.isArray(payload.customers) ? payload.customers : [];
    const bExpenditures: Expenditure[] = Array.isArray(payload.expenditures) ? payload.expenditures : [];
    const bCategories: Category[] = Array.isArray(payload.categories) ? payload.categories : [];

    // Defensive snapshot: no existing product's stock may change.
    const liveStockBefore = new Map(cacheProducts.map((p) => [p.id, p.stockQty]));

    const mergedProducts = mergeBackupProducts(cacheProducts, bProducts);
    if (mergedProducts.added.length > 0) {
      cacheProducts = mergedProducts.products;
      products = mergedProducts.added.length;
    }

    const haveC = new Set(cacheCustomers.map((c) => c.id));
    const newCustomers = bCustomers.filter((c) => c && c.id && !haveC.has(c.id));
    if (newCustomers.length > 0) cacheCustomers = [...cacheCustomers, ...newCustomers];

    if (bExpenditures.length > 0 && cacheExpenditures.length === 0) {
      cacheExpenditures = bExpenditures;
    }

    const haveS = new Set(cacheSales.map((s) => s.id));
    const newSales = bSales.filter((s) => s && s.id && !haveS.has(s.id));
    if (newSales.length > 0) {
      cacheSales = [...newSales, ...cacheSales];
      sales = newSales.length;
    }

    // Categories are additive; never replace the live category list.
    if (bCategories.length > 0) {
      const catIds = new Set(cacheCategories.map((c) => c.id));
      const catNames = new Set(cacheCategories.map((c) => c.name.toLowerCase()));
      const newCategories = bCategories.filter(
        (c) => c && c.id && !catIds.has(c.id) && !catNames.has(String(c.name).toLowerCase())
      );
      if (newCategories.length > 0) cacheCategories = [...cacheCategories, ...newCategories];
    }

    const bUsers: User[] = Array.isArray(payload.users) ? payload.users : [];
    if (cacheUsers.length === 0 && bUsers.length > 0) {
      cacheUsers = bUsers;
      users = bUsers.length;
      cacheAdminSetupDone = true;
      lsSet(LKEYS.ADMIN_SETUP_DONE, true);
      markDirty();
    }
    if (payload.printerConfig && !cachePrinterConfig) {
      cachePrinterConfig = payload.printerConfig;
    }

    // Defensive assertion: merge must never modify live stock.
    for (const p of cacheProducts) {
      const before = liveStockBefore.get(p.id);
      if (before !== undefined && p.stockQty !== before) {
        console.error(`Backup merge altered live stock for ${p.id} (${before} → ${p.stockQty}); restoring.`);
        p.stockQty = before;
      }
    }
  } catch (e) {
    console.error('Backup payload adopt failed', e);
  }
  return { sales, users, products };
}

// Evidence of a prior installation on this machine/profile. Fresh installs
// have NONE of these; updates always have at least one — so the setup
// wizard (a one-way latch) can never reappear on an update.
export async function hasInstallEvidence(): Promise<boolean> {
  try {
    if (cacheAdminSetupDone) return true;
    if (lsGet<boolean>(LKEYS.ADMIN_SETUP_DONE, false)) return true;
    if (cacheUsers.length > 0) return true;
    if (loadUsers().length > 0) return true;
    const snap = loadAutosaveSnapshot();
    if (
      snap &&
      ((snap.users?.length ?? 0) > 0 || snap.sales.length > 0 || snap.products.length > 0)
    ) {
      return true;
    }
    try {
      if (localStorage.getItem('senior_citizen_accessories_admin_recovery_v1')) return true;
    } catch {}
    try {
      if (localStorage.getItem('senior_citizen_accessories_backup_folder_path')) return true;
    } catch {}
    if (isTauriRuntime()) {
      const fs = await loadFsPlugin().catch(() => null);
      if (fs) {
        const fmod = fs as any;
        // Any database, backup JSON, or pointer file on disk = prior install.
        const looksLikeData = (n: string) => {
          const l = n.toLowerCase();
          return l.endsWith('.db') || l.endsWith('.json') || l.endsWith('.txt');
        };
        const scanDir = async (dir: string): Promise<boolean> => {
          try {
            const entries = await fmod.readDir(dir);
            return (entries || []).some((e: any) => {
              const n = String(typeof e === 'string' ? e : e.name || e.path || '').split(/[/\\]/).pop() || '';
              return looksLikeData(n);
            });
          } catch {
            return false;
          }
        };
        try {
          const info = await getDbInfo().catch(() => null);
          if (info?.folder) {
            const f = info.folder.replace(/[/\\]+$/, '');
            if (await scanDir(f)) return true;
            const parent = f.replace(/[/\\]+[^/\\]+$/, '');
            if (parent && parent !== f && (await scanDir(parent))) return true;
            if (!/backup$/i.test(f) && (await scanDir(`${f}\\Backup`))) return true;
          }
        } catch {}
        try {
          const pathMod = await import('@tauri-apps/api/path').catch(() => null);
          if (pathMod?.appDataDir) {
            const base = await pathMod.appDataDir().catch(() => '');
            if (base) {
              const thisDir = String(base).replace(/[/\\]+$/, '');
              const parentDir = thisDir.replace(/[/\\]+[^/\\]+$/, '');
              for (const appId of ['com.dronebug.dirms.desktop', 'com.seniorcitizen.accessories.desktop', 'com.joainas.pos.desktop']) {
                if (await scanDir(`${parentDir}\\${appId}`)) return true;
              }
            }
          }
        } catch {}
      }
    }
  } catch {}
  return false;
}

export async function tryRecoverFromJsonBackup(force: boolean = false): Promise<{ sales: number; file: string } | null> {
  if (!isTauriRuntime()) return null;
  // Update rule: an existing installation must land on LOGIN, never setup.
  // Only skip when the live DB already has BOTH receipts and accounts.
  if (!force && cacheSales.length > 0 && cacheUsers.length > 0) return null;
  try {
    const info = await getDbInfo();
    const dir = info?.folder;
    if (!dir) return null;
    const fs = await loadFsPlugin();
    if (!fs) return null;
    let entries: any[] = [];
    try {
      entries = await (fs as any).readDir(dir);
    } catch {
      return null;
    }
    const candidates = (entries || [])
      .map((e: any) => (typeof e === 'string' ? e : e.name || e.path || ''))
      .map((n: string) => String(n).split(/[/\\]/).pop() || '')
      .filter((n: string) => n.toLowerCase().includes('backup') && n.toLowerCase().endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10);
    for (const file of candidates) {
      try {
        const marker = force ? null : await dbGetSetting(`json_auto_recovery_${file}`);
        if (marker) continue; // already attempted for this file
        const fullPath = `${dir.replace(/[/\\]+$/, '')}\\${file}`;
        const text: string = await (fs as any).readTextFile(fullPath);
        if (!text || text.length > 50 * 1024 * 1024) {
          await dbSetSetting(`json_auto_recovery_${file}`, 'skipped');
          continue;
        }
        const parsed = JSON.parse(text);
        if (!isValidBackupPayload(parsed)) {
          await dbSetSetting(`json_auto_recovery_${file}`, 'invalid');
          continue;
        }
        // Merge-only via the shared adopter (never replaces newer live rows).
        const adopted = adoptBackupPayload(parsed);
        // Single-file cache replaces old file; vault catches up at boundary.
        saveAutosaveSnapshot();
        await dbSetSetting(`json_auto_recovery_${file}`, new Date().toISOString());
        // Stop after the FIRST file that yields any data (sales, products or
        // users). Continuing through every backup caused stock corruption.
        const yielded = adopted.sales + adopted.products + adopted.users;
        if (yielded > 0) {
          const parts: string[] = [];
          if (adopted.sales > 0) parts.push(`${adopted.sales} receipt${adopted.sales === 1 ? '' : 's'}`);
          if (adopted.products > 0) parts.push(`${adopted.products} product${adopted.products === 1 ? '' : 's'}`);
          if (adopted.users > 0) parts.push(`${adopted.users} user${adopted.users === 1 ? '' : 's'}`);
          recoveryNotice = `Recovered ${parts.join(', ')} from backup ${file}. Past records (Sept 10 & earlier) show the single sold price.`;
          console.info(recoveryNotice);
          return { sales: adopted.sales, file };
        }
        // Valid file but nothing new — still marked so we don't rescan it.
      } catch (e) {
        console.error('JSON backup recovery failed for candidate', file, e);
      }
    }
  } catch (e) {
    console.error('JSON backup auto-recovery failed', e);
  }
  return null;
}

// Manual import of a backup JSON's text (login-screen recovery panel,
// Admin button). Validates, merges via the shared adopter, consolidates
// the snapshot, and flushes the vault when something was adopted.
export function importBackupText(text: string): { sales: number; users: number; products: number } | null {
  try {
    if (!text || text.length > 50 * 1024 * 1024) return null;
    const parsed = JSON.parse(text);
    if (!isValidBackupPayload(parsed)) return null;
    const res = adoptBackupPayload(parsed);
    saveAutosaveSnapshot();
    if (res.sales > 0 || res.users > 0 || res.products > 0) {
      void persistAllToDatabase(true);
    }
    return res;
  } catch {
    return null;
  }
}

let autosaveHooksRegistered = false;
function registerAutosaveHooks(): void {
  if (autosaveHooksRegistered) return;
  autosaveHooksRegistered = true;
  const doSave = () => {
    try {
      saveAutosaveSnapshot(true);
    } catch {}
    // The live store is already current within ~400 ms; these make sure the
    // last keystroke before a pagehide also reaches SQLite.
    void flushIncremental();
    void flushAuditAppend();
  };
  // Synchronous localStorage writes survive pagehide/beforeunload even when SQLite queue is lost
  window.addEventListener('beforeunload', doSave);
  window.addEventListener('pagehide', doSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') doSave();
  });
  // Also on sign-out explicit path calls saveAutosaveSnapshot directly
}

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

  // Migrate pre-1.4.5 Joainas keys BEFORE any read so upgrades keep data.
  migrateLegacyKeys();

  if (isTauriRuntime()) {
    // FIRST: unite sibling database files into the live one (stale pointer
    // to an empty file, rebrand orphans, relocated folders). Idempotent —
    // rows are only ever added, never overwritten. Must run before reads.
    try {
      const merged = await tryMergeSiblingDatabases();
      debugLog(`init: sibling unite done (${merged ? 'recovered: ' + merged : 'nothing new'})`);
    } catch (e) {
      debugLog(`init: sibling unite threw: ${e instanceof Error ? e.message : String(e)}`);
      console.error('Sibling unite hook failed', e);
    }

    debugLog('init: storage bootstrap begin');

    // Per-table guards: ONE bad table (locked file, partial schema, corrupt
    // row) must never empty every other cache — that failure mode parked the
    // app at the setup wizard with a full database on disk.
    const guarded = async <T,>(label: string, fallback: T, task: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      try {
        const v = await task();
        const n = Array.isArray(v) ? `${(v as unknown[]).length} rows` : v == null ? 'null' : 'value';
        debugLog(`init: ${label} ok (${n}, ${Date.now() - t0}ms)`);
        return v;
      } catch (e) {
        debugLog(`init: ${label} FAILED, fallback used: ${e instanceof Error ? e.message : String(e)}`);
        return fallback;
      }
    };

    const [
      products,
      customers,
      contracts,
      microPayments,
      sales,
      expenditures,
      users,
      auditLogs,
      categories,
      printerConfig,
      setupDone,
    ] = await Promise.all([
      guarded('products', [] as Product[], () => dbLoadProducts()),
      guarded('customers', [] as Customer[], () => dbLoadCustomers()),
      guarded('contracts', [] as any[], () => dbLoadContracts()),
      guarded('micro-payments', [] as any[], () => dbLoadMicroPayments()),
      guarded('sales', [] as SaleRecord[], () => dbLoadSales()),
      guarded('expenditures', [] as Expenditure[], () => dbLoadExpenditures()),
      guarded('users', [] as User[], () => dbLoadUsers()),
      guarded('auditLogs', [] as AuditLog[], () => dbLoadAuditLogs()),
      guarded('categories', [] as Category[], () => dbLoadCategories()),
      guarded('printerConfig', null as ThermalPrinterConfig | null, () => dbLoadPrinterConfig()),
      guarded('setup-flag', null as string | null, () => dbGetSetting('admin_setup_done')),
    ]);

    cacheProducts = products;
    cacheCustomers = customers;
    cacheContracts = contracts;
    cacheMicroPayments = microPayments;
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
    debugLog(
      `init: caches ready — products=${cacheProducts.length} sales=${cacheSales.length} ` +
      `users=${cacheUsers.length} setupFlag=${cacheAdminSetupDone} (db=${setupDone})`
    );
    // Everything currently in SQLite is already durable: record it so the
    // live incremental writer only sends genuine changes from here on.
    resetPersistedSignatures();
    // v2.0.6 trusted-clock anchor: merge the vault + local high-water mark,
    // then verify the OS clock. Only a BACKWARD rollback blocks; a forward
    // difference is normal downtime after a shutdown and is accepted (this
    // is what used to cause the false warning after every restart).
    // v1.6.0 display currency: hydrate alongside (vault wins, else mirror).
    try {
      await hydrateCurrency().catch(() => null);
    } catch {}
    try {
      const anchor = await hydrateTimeAnchor();
      const gate = checkWallClock(Date.now(), anchor);
      if (!gate.ok) {
        recordAuditLog(
          'System',
          'System Admin',
          'System Clock Tamper Detected',
          `OS clock appears to have moved backwards by more than 30 minutes at startup. Last verified: ${new Date(gate.lastGoodMs).toLocaleString()}; ` +
          `current system time: ${new Date(gate.nowMs).toLocaleString()}. Sign-in remains available; non-admin sessions carry a FLASHALERT and sales are tagged until an ADMIN verifies the clock.`
        );
      } else {
        // A forward gap is normal time passage while the app was closed.
        // Raise the high-water mark so the live monitor does not keep
        // comparing against a stale pre-shutdown time.
        if (gate.forwardJump) {
          debugLog(
            `init: clock is >24h ahead of the last anchor (normal after a long shutdown) — accepting ${new Date(gate.nowMs).toLocaleString()}`
          );
        }
        touchClock(Date.now());
      }
    } catch (e) {
      console.error('Trusted-clock boot check failed', e);
    }
    // v1.5.2 startup-time validation (Rust backend): catches OS-clock
    // rollbacks performed while the app was CLOSED — invisible to the anchor
    // above whenever the anchor stores were wiped or restored from an old
    // backup. Fail-open (null): a backend/disk error must never brick sales;
    // the anchor + live monitor still protect the session.
    try {
      const v = await validateStartupTime();
      if (v && !v.ok) {
        const lastGoodMs = v.last_trusted_unix > 0 ? v.last_trusted_unix * 1000 : 0;
        const nowMs = v.current_unix > 0 ? v.current_unix * 1000 : Date.now();
        recordAuditLog(
          'System',
          'System Admin',
          'System Clock Tamper Detected',
          `${v.reason} Last trusted boot: ${lastGoodMs > 0 ? new Date(lastGoodMs).toLocaleString() : 'unknown'}. ` +
          `Sign-in remains available; non-admin sessions carry a FLASHALERT and sales are tagged until an ADMIN verifies the clock.`
        );
        reportStartupTamper(
          `${v.reason} Sign-in remains available with a FLASHALERT; an ADMIN must verify the clock (or correct the date/time and restart).`,
          lastGoodMs,
          nowMs
        );
      } else if (v && v.reason) {
        // Backend self-healed (e.g. corrupt stamp file re-initialized) —
        // worth a forensic trail, but not a block.
        debugLog(`init: startup-time note: ${v.reason}`);
      }
    } catch (e) {
      console.error('Startup-time boot check failed', e);
    }
    // Restore any still-valid session from sessionStorage — this is what
    // lets a browser refresh keep the user logged in while a full close
    // clears it (sessionStorage is per-tab and dies with the window).
    cacheActiveUser = readSessionUser();

    // SQLite is the live store. The browser snapshot is used ONLY when the
    // database has no business data at all (fresh install / first launch after
    // an upgrade). It is never allowed to "win" by having more rows — that is
    // exactly what used to resurrect deleted items and undo stock reductions.
    try {
      const snap = loadAutosaveSnapshot();
      const fresh = snap && snap.timestamp && Date.now() - snap.timestamp < 7 * 24 * 3600 * 1000 ? snap : null;
      const dbHasBusinessData = cacheProducts.length > 0 || cacheSales.length > 0;

      if (!dbHasBusinessData && fresh) {
        if (fresh.products.length > 0) cacheProducts = fresh.products;
        if (fresh.sales.length > 0) cacheSales = fresh.sales;
        if (Array.isArray(fresh.customers) && fresh.customers.length > 0) cacheCustomers = fresh.customers;
        if (Array.isArray(fresh.expenditures) && fresh.expenditures.length > 0) cacheExpenditures = fresh.expenditures;
        if (Array.isArray(fresh.users) && fresh.users.length > 0) cacheUsers = fresh.users;
        if (Array.isArray(fresh.categories) && fresh.categories.length > 0) cacheCategories = fresh.categories;
        if (fresh.printerConfig && !cachePrinterConfig) cachePrinterConfig = fresh.printerConfig;
        debugLog('init: database empty — adopted the browser snapshot');
      } else if (dbHasBusinessData && fresh) {
        // Safe additive fallbacks only: a slice that is completely absent in
        // SQLite (accounts, categories, printer settings) may come from the
        // snapshot. Products/sales/customers/expenditures never do.
        if (cacheUsers.length === 0 && Array.isArray(fresh.users) && fresh.users.length > 0) {
          cacheUsers = fresh.users;
        }
        if (cacheCategories.length === 0 && Array.isArray(fresh.categories) && fresh.categories.length > 0) {
          cacheCategories = fresh.categories;
        }
        if (!cachePrinterConfig && fresh.printerConfig) cachePrinterConfig = fresh.printerConfig;
      }

      // Legacy per-table keys only fill a completely empty database.
      if (cacheProducts.length === 0 && cacheSales.length === 0) {
        const vProducts = lsGet<Product[]>(LKEYS.PRODUCTS, []);
        if (vProducts.length > 0) cacheProducts = vProducts;
        const vSales = lsGet<SaleRecord[]>(LKEYS.SALES, []);
        if (vSales.length > 0) cacheSales = vSales;
        const vCustomers = lsGet<Customer[]>(LKEYS.CUSTOMERS, []);
        if (vCustomers.length > 0) cacheCustomers = vCustomers;
        const vExpenditures = lsGet<Expenditure[]>(LKEYS.EXPENDITURES, []);
        if (vExpenditures.length > 0) cacheExpenditures = vExpenditures;
        if (cacheUsers.length === 0) {
          const vUsers = lsGet<User[]>(LKEYS.USERS, []);
          if (vUsers.length > 0) cacheUsers = vUsers;
        }
        if (cacheCategories.length === 0) {
          const vCategories = lsGet<Category[]>(LKEYS.CATEGORIES, []);
          if (vCategories.length > 0) cacheCategories = vCategories;
        }
        if (!cachePrinterConfig) {
          const vPrinter = lsGet<ThermalPrinterConfig | null>(LKEYS.PRINTER_CONFIG, null);
          if (vPrinter) cachePrinterConfig = vPrinter;
        }
      }

      const logs = lsGet<AuditLog[]>(LKEYS.AUDIT_LOGS, []);
      if (logs.length > cacheAuditLogs.length) cacheAuditLogs = logs.slice(0, AUDIT_CACHE_CAP);
      // Re-consolidate the (possibly adopted) state into the emergency copy.
      saveAutosaveSnapshot(true);
    } catch (e) {
      console.error('Local-first restore failed', e);
    }

    // Seed default category colors only after the restore attempt, so an
    // upgraded profile keeps the categories stored in its snapshot.
    if (cacheCategories.length === 0) {
      saveCategories(DEFAULT_CATEGORIES);
    }

    // JSON backup auto-recovery: if the live DB has no sales at all, merge
    // them back from a *backup*.json in the DB folder (the 1.4.5 rebrand
    // orphaned shops whose only surviving copy is JSON). Runs before the
    // backfill so recovered rows get min-price treatment too.
    try {
      await tryRecoverFromJsonBackup();
    } catch (e) {
      console.error('JSON recovery hook failed', e);
    }

    // v1.5.0: swap untouched legacy default categories for Products/Services
    // BEFORE the snapshot/vault consolidation below, so the fix persists.
    try {
      migrateLegacyDefaultCategories();
    } catch (e) {
      console.error('Category migration failed', e);
    }
    // v2.0.5: move legacy inventory categories under Products and convert
    // legacy single prices to maximums (safe, one-time).
    try {
      migrateLegacyInventoryToProducts();
    } catch (e) {
      console.error('Inventory migration failed', e);
    }
    // v1.5.0: replace the legacy frozen-foods receipt footer with the
    // generic default — but only if the user never customized it.
    try {
      migrateLegacyReceiptFooter();
    } catch (e) {
      console.error('Receipt footer migration failed', e);
    }
    // v2.0.6: replace untouched old-brand receipt identity with Joainas.
    try {
      migrateLegacyBusinessBranding();
    } catch (e) {
      console.error('Business branding migration failed', e);
    }
    // Existing inventory prices are assumed minimum prices; past sale records
    // are regarded as their own minimums. Backfill once per launch, then
    // consolidate + push the united state to the vault (startup boundary).
    try {
      backfillMinPrices();
    } catch (e) {
      console.error('Min-price backfill failed', e);
    }
    try {
      saveAutosaveSnapshot(true);
    } catch {}
    // Startup sync: diff against what was on disk and write ONLY the rows a
    // migration/restore actually changed (plus the small config tables).
    try {
      await flushAllIncremental();
      await persistSmallConfig();
      await flushWrites(3000);
    } catch (e) {
      console.error('Startup vault sync failed', e);
    }

    registerAutosaveHooks();
  } else {
    // Browser: snapshot file first, legacy per-table keys as fallback.
    const snap0 = loadAutosaveSnapshot();
    if (snap0 && Array.isArray(snap0.products) && Array.isArray(snap0.sales)) {
      cacheProducts = snap0.products;
      cacheSales = snap0.sales;
      if (Array.isArray(snap0.customers)) cacheCustomers = snap0.customers;
      if (Array.isArray(snap0.expenditures)) cacheExpenditures = snap0.expenditures;
      if (Array.isArray(snap0.users)) cacheUsers = snap0.users;
      if (Array.isArray(snap0.categories)) cacheCategories = snap0.categories;
      if (snap0.printerConfig) cachePrinterConfig = snap0.printerConfig;
    } else {
      cacheProducts = lsGet<Product[]>(LKEYS.PRODUCTS, []);
      cacheCustomers = lsGet<Customer[]>(LKEYS.CUSTOMERS, []);
      cacheSales = lsGet<SaleRecord[]>(LKEYS.SALES, []);
      cacheExpenditures = lsGet<Expenditure[]>(LKEYS.EXPENDITURES, []);
      cacheUsers = lsGet<User[]>(LKEYS.USERS, []);
      cacheCategories = lsGet<Category[]>(LKEYS.CATEGORIES, []);
      cachePrinterConfig = lsGet<ThermalPrinterConfig | null>(LKEYS.PRINTER_CONFIG, null);
    }
    cacheAuditLogs = lsGet<AuditLog[]>(LKEYS.AUDIT_LOGS, []);
    cacheAdminSetupDone = lsGet<boolean>(LKEYS.ADMIN_SETUP_DONE, false);
    cacheActiveUser = readSessionUser() ?? lsGet<User | null>(LKEYS.ACTIVE_USER, null);

    if (cacheCategories.length === 0) {
      saveCategories(DEFAULT_CATEGORIES);
    } else {
      // v1.5.0: swap untouched legacy default categories for Products/Services.
      try {
        migrateLegacyDefaultCategories();
      } catch {}
    }
    // v2.0.5: move legacy inventory categories under Products and convert
    // legacy single prices to maximums (safe, one-time).
    try {
      migrateLegacyInventoryToProducts();
    } catch {}
    // v1.5.0: replace the legacy frozen-foods receipt footer with the
    // generic default — but only if the user never customized it.
    try {
      migrateLegacyReceiptFooter();
    } catch {}
    try {
      migrateLegacyBusinessBranding();
    } catch {}

    try {
      backfillMinPrices();
    } catch {}

    // v1.5.1 trusted clock: hydrate the anchor mirror even in browser dev.
    try {
      await hydrateTimeAnchor();
      await hydrateCurrency().catch(() => null);
      touchClock(Date.now());
    } catch {}

    registerAutosaveHooks();
    saveAutosaveSnapshot(true);
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
  // Live store: write only the rows that changed, within ~400 ms.
  scheduleIncremental('products');
  // Emergency browser-storage copy (debounced; survives abrupt closure).
  saveAutosaveSnapshot();
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
  scheduleIncremental('customers');
  saveAutosaveSnapshot();
};

// ---- StoreBox PRO installment ledger (contracts + micro-payments) ----
export const loadContracts = (): any[] => cacheContracts;
export const loadMicroPayments = (): any[] => cacheMicroPayments;
export const saveContracts = (contracts: any[]) => {
  cacheContracts = contracts;
  try {
    if (isTauriRuntime()) void dbSaveContracts([...contracts]);
    else localStorage.setItem(LKEYS.CONTRACTS, JSON.stringify(contracts));
  } catch {}
  saveAutosaveSnapshot();
};
export const recordMicroPayment = async (p: { contractId: string; customerId: string; amount: number; receiptNote?: string; remitted?: boolean; createdBy?: string }): Promise<any | null> => {
  if (isTauriRuntime()) {
    try {
      const r = await dbRecordMicroPayment(p);
      cacheMicroPayments = await dbLoadMicroPayments().catch(() => cacheMicroPayments);
      cacheContracts = await dbLoadContracts().catch(() => cacheContracts);
      cacheCustomers = await dbLoadCustomers().catch(() => cacheCustomers);
      saveAutosaveSnapshot();
      return r;
    } catch (e) {
      console.error('recordMicroPayment failed', e);
      return null;
    }
  }
  const entry: any = { id: `mpay-${Date.now()}`, collectedAt: Date.now(), remitted: !!p.remitted, ...p };
  cacheMicroPayments = [...cacheMicroPayments, entry];
  cacheContracts = cacheContracts.map((c) => {
    if (c.id !== p.contractId) return c;
    const totalPaid = (c.totalPaid || 0) + p.amount;
    const pending = Math.max(0, (c.totalPrice || 0) - totalPaid);
    return { ...c, totalPaid, pendingBalance: pending, status: pending <= 0.005 ? 'COMPLETED' : 'INSTALLMENT_ACTIVE' };
  });
  try { localStorage.setItem(LKEYS.MICRO_PAYMENTS, JSON.stringify(cacheMicroPayments)); } catch {}
  saveAutosaveSnapshot();
  return entry;
};
export const deleteMicroPayment = async (paymentId: string): Promise<boolean> => {
  if (isTauriRuntime()) {
    const ok = await dbDeleteMicroPayment(paymentId).catch(() => false);
    cacheMicroPayments = await dbLoadMicroPayments().catch(() => cacheMicroPayments);
    cacheContracts = await dbLoadContracts().catch(() => cacheContracts);
    cacheCustomers = await dbLoadCustomers().catch(() => cacheCustomers);
    saveAutosaveSnapshot();
    return ok;
  }
  const target = cacheMicroPayments.find((m) => m.id === paymentId);
  cacheMicroPayments = cacheMicroPayments.filter((m) => m.id !== paymentId);
  if (target) {
    cacheContracts = cacheContracts.map((c) => {
      if (c.id !== target.contractId) return c;
      const totalPaid = Math.max(0, (c.totalPaid || 0) - target.amount);
      const pending = Math.max(0, (c.totalPrice || 0) - totalPaid);
      return { ...c, totalPaid, pendingBalance: pending, status: pending <= 0.005 ? 'COMPLETED' : 'INSTALLMENT_ACTIVE' };
    });
  }
  saveAutosaveSnapshot();
  return true;
};
export const setMicroRemitted = async (paymentId: string, remitted: boolean): Promise<void> => {
  cacheMicroPayments = cacheMicroPayments.map((m) => (m.id === paymentId ? { ...m, remitted } : m));
  if (isTauriRuntime()) { try { await dbSetMicroRemitted(paymentId, remitted); } catch {} }
  saveAutosaveSnapshot();
};
export const setContractDownRemitted = async (contractId: string, remitted: boolean): Promise<void> => {
  cacheContracts = cacheContracts.map((c) => (c.id === contractId ? { ...c, downRemitted: remitted } : c));
  if (isTauriRuntime()) { try { await dbSetContractDownRemitted(contractId, remitted); } catch {} }
  try { if (!isTauriRuntime()) localStorage.setItem(LKEYS.CONTRACTS, JSON.stringify(cacheContracts)); else void dbSaveContracts([...cacheContracts]); } catch {}
  saveAutosaveSnapshot();
};
export const clearDemoLedgerData = async (): Promise<void> => {
  cacheContracts = [];
  cacheMicroPayments = [];
  if (isTauriRuntime()) {
    try { await dbSaveContracts([]); } catch {}
    try {
      const { getDb } = await import('./db');
      const d = await getDb();
      if (d) await d.execute('DELETE FROM micro_payments', []);
    } catch {}
    cacheCustomers = await dbLoadCustomers().catch(() => cacheCustomers);
  } else {
    try { localStorage.removeItem(LKEYS.CONTRACTS); localStorage.removeItem(LKEYS.MICRO_PAYMENTS); } catch {}
  }
  saveAutosaveSnapshot();
};

// ============================================================
// SALES
// ============================================================

export const loadSales = (): SaleRecord[] => cacheSales;

// NOTE (v1.4.8 architecture): every save below writes caches + the SINGLE
// localStorage snapshot file and marks the vault dirty. SQLite is written
// ONLY by persistAllToDatabase() at session boundaries (logout, close,
// shutdown, periodic dirty check). No per-action DB writes, no redundancies.

export const saveSales = (sales: SaleRecord[]) => {
  if (sales.length === 0 && cacheSales.length > 1) {
    console.warn('Blocked accidental empty sales save.');
    return;
  }
  cacheSales = sales;
  scheduleIncremental('sales');
  // Single-file cache replaces old snapshot — vault catches up at boundary.
  saveAutosaveSnapshot();
};

// Checkout path: caches + single snapshot only. Stock/sale durability comes
// from the snapshot immediately and the vault at the next boundary —
// no dual-write that could half-fail on close.
//
// v2.0.6: non-admin sessions signed in under a clock warning carry a runtime
// override. Those sales are ALLOWED and recorded normally so the shop keeps
// trading; the persistent FLASHALERT + per-sale audit entry tell the ADMIN to
// reconcile stock/cash when they return. Without an override, a sale built
// under a manipulated OS clock is still refused.
export const recordSaleWithStockUpdate = async (sale: SaleRecord, updatedProducts: Product[]): Promise<boolean> => {
  try {
    const now = Date.now();
    const anchor = getTimeAnchor();
    const gate = getEffectiveGate(now, anchor);
    const overrideActive = hasActiveClockOverride();
    if (!gate.ok && !overrideActive) {
      console.warn('Sale refused — system clock tamper detected.', gate.reason);
      return false;
    }
    // Under an override, skip only the monotonic high-water check (a backward
    // clock legitimately produces earlier timestamps). Date/time-window checks
    // still run so the row is internally consistent.
    const validationAnchor = overrideActive ? { ...anchor, lastSeenWallMs: 0 } : anchor;
    const valid = validateNewSale(sale, now, validationAnchor);
    if (!valid.ok) {
      console.warn('Sale refused — invalid sale timestamp.', valid.reason);
      return false;
    }
  } catch (e) {
    console.error('Sale clock validation failed', e);
    return false;
  }
  // Update caches synchronously so UI reflects new stock immediately
  cacheSales = [sale, ...cacheSales];
  cacheProducts = updatedProducts;
  // Also update customer balance in cache if sale has customer
  if (sale.customerId) {
    cacheCustomers = cacheCustomers.map((c) =>
      c.id === sale.customerId ? { ...c, balance: c.balance + sale.balanceDue } : c
    );
    scheduleIncremental('customers');
  }
  // Live store: the receipt and ONLY the products it touched are written.
  scheduleIncremental('sales');
  scheduleIncremental('products');
  // Raise the trusted high-water mark + bump the monotonic sale sequence.
  try {
    advanceForSale(Date.now());
  } catch {}
  // Emergency browser-storage copy (debounced).
  saveAutosaveSnapshot();
  return true;
};

// ============================================================
// TRUSTED-CLOCK UI HELPERS (v1.5.1)
// Synchronous gate for POS checkout + ADMIN re-anchor action.
// ============================================================

/**
 * Do we know of ANY accounts without waiting for initStorage? Checks the
 * live cache first, then the synchronous localStorage snapshot mirror. Used
 * by the setup gate so a slow/failed init can never fake "zero accounts"
 * (which would loop a healthy install back to the setup wizard).
 */
export const hasLocalAccountsSync = (): boolean => {
  if (cacheUsers.length > 0) return true;
  try {
    const snap = loadAutosaveSnapshot();
    const n = (snap?.users as unknown[] | undefined)?.length ?? 0;
    if (n > 0) return true;
  } catch {}
  return false;
};

/** Setup-done flag from cache or its synchronous localStorage mirror. */
export const isSetupDoneSync = (): boolean => {
  if (cacheAdminSetupDone) return true;
  return lsGet<boolean>(LKEYS.ADMIN_SETUP_DONE, false);
};

/**
 * Current wall-clock verdict (cheap, synchronous — safe to call on render).
 * Session-effective: a latched startup-tamper (rollback while closed) wins
 * over the anchor check.
 */
export const getClockGate = (): ClockGate => getEffectiveGate(Date.now(), getTimeAnchor());

/** Last verified legitimate wall-clock time (0 = none recorded yet). */
export const getLastVerifiedClockMs = (): number => getTimeAnchor().lastSeenWallMs;

/**
 * ADMIN-only: accept the current OS time as the new anchor after a genuine
 * clock fix. Always writes an audit entry with the admin, old/new times and
 * the stated reason — this is the ONLY way to lower the high-water mark.
 */
export const reanchorClock = (adminUsername: string, adminRole: UserRole, reason: string): ClockGate => {
  const before = getTimeAnchor().lastSeenWallMs;
  const now = Date.now();
  // An ADMIN-verified re-anchor also lifts the boot-time tamper latch, so a
  // clock that Windows/Internet time sync already corrected no longer needs
  // an app restart — the gate clears the moment the password is accepted.
  clearStartupTamper();
  reanchorClockAnchor(now);
  // v2.0.6: rewrite the native startup stamp too. Without this the Rust
  // check keeps the old/future value and re-blocks the next launch even
  // though the ADMIN already accepted the corrected clock.
  void acceptStartupTime();
  recordAuditLog(
    adminUsername || 'System',
    adminRole || 'System Admin',
    'System Clock Re-anchored',
    `ADMIN re-anchored the trusted clock. Previous verified time: ${before > 0 ? new Date(before).toLocaleString() : 'none recorded'}; ` +
    `accepted system time: ${new Date(now).toLocaleString()}. Reason: ${reason}`
  );
  return refreshGate(now); // broadcast now — UI unblocks without waiting for the 2s tick
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
  scheduleIncremental('expenditures');
  saveAutosaveSnapshot();
};

// ============================================================
// PRINTER CONFIG
// ============================================================

export const loadPrinterConfig = (): ThermalPrinterConfig =>
  cachePrinterConfig || INITIAL_PRINTER_CONFIG;

export const savePrinterConfig = (config: ThermalPrinterConfig) => {
  cachePrinterConfig = config;
  if (isTauriRuntime()) {
    void enqueueWrite(() => dbSavePrinterConfig({ ...config }));
  }
  saveAutosaveSnapshot();
};

// v1.5.0 one-time migration: the legacy frozen-foods footer becomes the
// generic default. A customized footer is left exactly as-is.
const LEGACY_RECEIPT_FOOTER = 'Thank you for shopping with us! No refund on frozen items after 24 hrs.';
export const migrateLegacyReceiptFooter = (): boolean => {
  try {
    if (!cachePrinterConfig || cachePrinterConfig.receiptFooterNote !== LEGACY_RECEIPT_FOOTER) {
      return false;
    }
    savePrinterConfig({
      ...cachePrinterConfig,
      receiptFooterNote: INITIAL_PRINTER_CONFIG.receiptFooterNote,
    });
    return true;
  } catch {
    return false;
  }
};

// v2.0.6 Joainas Mart rebrand: existing installs still hold the old brand
// defaults in SQLite/localStorage. Rewrite ONLY untouched defaults so a
// business name the owner typed is never overwritten.
const LEGACY_BRAND_DEFAULTS = [
  'Rabiu Entreprises',
  'Joainas Supermarket & Coldstore',
  'DIRMS Store',
  'DIRMS StoreBox PRO',
];
// Joainas Mart is the NEW default — never rewrite an already-migrated
// install's owner-entered name/address. Only true legacy installs (Rabiu)
// should be rewritten here.
const LEGACY_BRAND_MIGRATION_ONLY = ['Rabiu Entreprises'];
export const migrateLegacyBusinessBranding = (): boolean => {
  try {
    if (!cachePrinterConfig) return false;
    const next = { ...cachePrinterConfig };
    const isLegacyName = (value?: string) =>
      !value || LEGACY_BRAND_DEFAULTS.includes(value.trim());

    if (isLegacyName(next.businessName)) next.businessName = INITIAL_PRINTER_CONFIG.businessName;
    if (isLegacyName(next.storeName)) next.storeName = INITIAL_PRINTER_CONFIG.storeName;
    if (
      !next.address ||
      next.address.trim() === 'Rabiu Entreprises.' ||
      next.address.trim() === 'Joainas Mart.'
    ) {
      next.address = INITIAL_PRINTER_CONFIG.address;
    }
    if (
      !next.receiptHeaderNote ||
      next.receiptHeaderNote.trim() === 'WELCOME TO Rabiu Entreprises' ||
      next.receiptHeaderNote.trim() === 'WELCOME TO Joainas Mart'
    ) {
      next.receiptHeaderNote = INITIAL_PRINTER_CONFIG.receiptHeaderNote;
    }

    if (JSON.stringify(next) === JSON.stringify(cachePrinterConfig)) return false;
    savePrinterConfig(next);
    return true;
  } catch {
    return false;
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
    void enqueueWrite(() => dbSaveUsers([...cacheUsers]));
  }
  saveAutosaveSnapshot();
};

// ============================================================
// AUDIT TRAIL
// ============================================================

export const loadAuditLogs = (): AuditLog[] => cacheAuditLogs;

export const saveAuditLogs = (logs: AuditLog[]) => {
  cacheAuditLogs = logs.slice(0, AUDIT_CACHE_CAP);
  if (isTauriRuntime()) {
    void enqueueWrite(() => dbSaveAuditLogs([...cacheAuditLogs]));
  } else {
    lsSet(LKEYS.AUDIT_LOGS, cacheAuditLogs);
  }
  markDirty();
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

  // Boundary flushes: the live incremental writer is already current; these
  // only drain anything still queued and keep the emergency copy fresh.
  const boundaryFlush = () => {
    try {
      saveAutosaveSnapshot(true);
    } catch {}
    void flushIncremental();
    void flushAuditAppend();
  };
  window.addEventListener('pagehide', boundaryFlush);
  window.addEventListener('beforeunload', boundaryFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') boundaryFlush();
  });
  // Periodic safety net: drain the queue and keep the WAL from growing.
  // (The old build rewrote every table here every 15 s — the source of the
  // 15× write amplification and the UI stalls.)
  let lastCheckpoint = 0;
  setInterval(() => {
    void flushIncremental();
    void flushAuditAppend();
    if (Date.now() - lastCheckpoint > 60000) {
      lastCheckpoint = Date.now();
      void enqueueWrite(() => dbCheckpointWal());
    }
  }, 15000);

  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    let allowClose = false;
    // Hard kill switch: process exit is guaranteed to work even if the
    // window refuses to close (e.g. a stuck WebView). Backed by the native
    // force_exit command (zero new dependencies).
    const forceQuit = () => {
      allowClose = true;
      try {
        win.destroy().catch(() => {});
      } catch {}
      import('@tauri-apps/api/core')
        .then((m) => m.invoke('force_exit').catch(() => window.close()))
        .catch(() => {
          try {
            window.close();
          } catch {}
        });
    };
    await win.onCloseRequested(async (event) => {
      try {
        if (allowClose) return;
        event.preventDefault();
        console.info('Close requested — flushing writes (forced quit in 2.5s max)');
        // FAILSAFE: the app is gone in ~2.5s no matter what. Previously the
        // close could hang on the write queue (or a throw could skip the
        // re-close entirely), forcing Task Manager kills that lost queued
        // writes and landed users back in the setup wizard.
        const forceTimer = setTimeout(() => {
          console.warn('Close flush timed out — forcing quit');
          forceQuit();
        }, 2500);
        try {
          saveAutosaveSnapshot(true);
        } catch {}
        // Drain the live write queue only. There is no full-table rewrite on
        // close anymore, so this finishes well inside the 2.5 s failsafe even
        // with a 1000+ item catalog.
        try {
          await Promise.race([
            (async () => {
              await flushIncremental();
              await flushAuditAppend();
              await flushWrites(1500);
            })(),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (e) {
          console.error('Vault flush on close failed', e);
        } finally {
          clearTimeout(forceTimer);
        }
        allowClose = true;
        try {
          await win.close();
        } catch {
          forceQuit();
        }
      } catch (e) {
        // NOTHING may leave this handler without progressing the close —
        // any unexpected throw funnels to the guaranteed quit path.
        console.error('Close handler fault — forcing quit', e);
        forceQuit();
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

  cacheAuditLogs = [newLog, ...cacheAuditLogs].slice(0, AUDIT_CACHE_CAP);
  // Append-only live write (batched); never rewrites the whole trail.
  scheduleAuditAppend(newLog);
  markDirty();
  return newLog;
};

// ============================================================
// FIRST-TIME ADMIN SETUP FLAG
// ============================================================

export const isAdminSetupCompleted = (): boolean => cacheAdminSetupDone;

export const setAdminSetupCompleted = (done: boolean = true) => {
  cacheAdminSetupDone = done;
  // Mirror to localStorage too (belt-and-suspenders) so the flag survives even
  // if the app closes before the vault flush. Vault catches up at boundary.
  lsSet(LKEYS.ADMIN_SETUP_DONE, done);
  markDirty();
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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    // Old/broken sessions may have capabilities === undefined (JSON drops undefined)
    // or === [] (previous fix stored empty). Hydrate to avoid blank UI.
    const caps = (parsed as any).capabilities;
    if (!Array.isArray(caps) || caps.length === 0) {
      const full = cacheUsers.find((u) => u.id === (parsed as any).id || u.username === (parsed as any).username);
      if (full && Array.isArray(full.capabilities) && full.capabilities.length > 0) {
        (parsed as any).capabilities = full.capabilities;
      } else if ((parsed as any).role === 'System Admin') {
        (parsed as any).capabilities = ['admin','sell','inventory','view_sales','customers','view_reports','expenses','printer_settings','receipts'];
      } else if (!Array.isArray(caps)) {
        (parsed as any).capabilities = [];
      }
      // Persist the healed caps so next refresh doesn't stay blank.
      try {
        sessionStorage.setItem(LKEYS.ACTIVE_USER, JSON.stringify(parsed));
      } catch {}
    }
    // If still empty and not admin, force re-login instead of blank UI.
    if (Array.isArray((parsed as any).capabilities) && (parsed as any).capabilities.length === 0 && (parsed as any).role !== 'System Admin') {
      // Non-admin with no caps is likely a stale entry — require fresh login.
      // Keep as-is but don't treat as logged-in if no permissions at all?
      // Returning the user still lets them see "no access" — better to fall through to login gate.
      // So if non-admin and zero caps, consider session invalid.
      // However keep admin case above. For others, return null to show login.
      const maybeFull = cacheUsers.find((u) => u.username === (parsed as any).username);
      if (!maybeFull) return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getActiveUser = (): User | null => cacheActiveUser ?? readSessionUser();

export const setActiveUserStorage = (user: User | null) => {
  cacheActiveUser = user;
  try {
    if (user) {
      // Strip password hash before persisting to sessionStorage (XSS exposure).
      const { password: _pw, ...safe } = user as User & { password?: unknown };
      let caps: unknown = (safe as any).capabilities;
      if (!Array.isArray(caps) || (caps as unknown[]).length === 0) {
        if ((safe as any).role === 'System Admin') {
          caps = ['admin','sell','inventory','view_sales','customers','view_reports','expenses','printer_settings','receipts'];
        } else {
          caps = Array.isArray(caps) ? caps : [];
        }
      }
      const safeWithCaps = { ...safe, capabilities: caps };
      sessionStorage.setItem(LKEYS.ACTIVE_USER, JSON.stringify(safeWithCaps));
    } else {
      sessionStorage.removeItem(LKEYS.ACTIVE_USER);
    }
  } catch {}
};

// ============================================================
// CATEGORIES
// ============================================================

export const loadCategories = (): Category[] => cacheCategories;

// v1.5.0 one-time migration: shops whose categories are all still untouched
// legacy phone-accessory defaults move to Products/Services. Any list the
// user customized (added or renamed anything) is left exactly as-is.
// Deleting a default still counts as untouched — the legacy set is gone.
export const migrateLegacyDefaultCategories = (): boolean => {
  try {
    const current = cacheCategories || [];
    if (current.length === 0) return false;
    const legacyById = new Map(LEGACY_DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
    const allUntouchedLegacy = current.every(
      (c) => legacyById.get(c.id) === c.name
    );
    if (!allUntouchedLegacy) return false;
    cacheCategories = [...DEFAULT_CATEGORIES];
    try {
      saveAutosaveSnapshot();
    } catch {}
    return true;
  } catch {
    return false;
  }
};

// v2.0.5 live migration. Safe and idempotent:
//  - legacy categories (no explicit kind) move under the Products root;
//    categories literally named Services/Edibles are renamed "(Legacy)";
//  - products without an explicit kind become Products (explicit service and
//    edible kinds are deliberately preserved);
//  - a legacy single price becomes the maximum. An explicit min < max or a
//    tier floor < ceiling is preserved as a real range.
// Runs once, guarded by a local marker.
const LEGACY_INVENTORY_MIGRATION_KEY = 'joainas_2_0_5_inventory_migrated';

export const migrateLegacyInventoryToProducts = (): boolean => {
  try {
    if (lsGet<boolean>(LEGACY_INVENTORY_MIGRATION_KEY, false)) return false;
    let changed = false;
    const renamedCategories = new Map<string, string>();

    cacheCategories = (cacheCategories || []).map((category) => {
      if (category.kind && category.parentRoot) return category;
      changed = true;
      if (category.kind) {
        const parentRoot =
          category.kind === 'service' ? 'Services' : category.kind === 'edible' ? 'Edibles' : 'Products';
        return { ...category, parentRoot };
      }
      let name = category.name;
      if (/^services$/i.test(name)) {
        name = 'Services (Legacy)';
        renamedCategories.set(category.name, name);
      } else if (/^edibles$/i.test(name)) {
        name = 'Edibles (Legacy)';
        renamedCategories.set(category.name, name);
      }
      return { ...category, name, kind: 'product', parentRoot: 'Products' };
    });

    cacheProducts = (cacheProducts || []).map((product) => {
      let next = product;

      if (!next.kind) {
        next = { ...next, kind: 'product' };
        changed = true;
      }
      const renamed = renamedCategories.get(next.category);
      if (renamed) {
        next = { ...next, category: renamed };
        changed = true;
      }

      const min = Number.isFinite(next.minPrice) ? (next.minPrice as number) : 0;
      const max = Number.isFinite(next.retailPrice) ? next.retailPrice : 0;
      const tiers = Array.isArray(next.priceTiers) ? next.priceTiers : [];
      const tierRange = tiers.some((t) => {
        const floor = Number(t?.floor) || 0;
        const ceiling = Number(t?.ceiling) || 0;
        return floor > 0 && ceiling > 0 && floor < ceiling;
      });
      const explicitRange = min > 0 && max > 0 && min < max;

      if (!explicitRange && !tierRange) {
        const highestTier = tiers.reduce((m, t) => Math.max(m, Number(t?.ceiling) || 0), 0);
        const newMax = Math.max(max, min, highestTier);
        if (next.minPrice !== undefined || next.retailPrice !== newMax) changed = true;
        next = { ...next, retailPrice: newMax, minPrice: undefined };
      }

      return next;
    });

    if (changed) {
      try {
        saveAutosaveSnapshot();
      } catch {}
    }
    lsSet(LEGACY_INVENTORY_MIGRATION_KEY, true);
    return changed;
  } catch (e) {
    console.error('Legacy inventory migration failed', e);
    return false;
  }
};

export const saveCategories = (categories: Category[]) => {
  if (categories.length === 0 && cacheCategories.length > 1) {
    console.warn('Blocked accidental empty category save.');
    return;
  }
  cacheCategories = categories;
  if (isTauriRuntime()) {
    void enqueueWrite(() => dbSaveCategories([...cacheCategories]));
  }
  saveAutosaveSnapshot();
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
  // Single file replaces old snapshot so the cleared state is what reloads.
  saveAutosaveSnapshot();
  if (isTauriRuntime()) {
    await enqueueAndFlush(async () => {
      await dbSaveProducts([]);
      await dbSaveSales([]);
      await dbSaveCustomers([]);
      await dbSaveExpenditures([]);
      await dbSaveCategories(DEFAULT_CATEGORIES);
      await dbClearTable('inventory_adjustments');
    });
    vaultDirty = false;
    return;
  }
  lsSet(LKEYS.AUDIT_LOGS, []);
};

// ============================================================
// BACKUP FOLDER CONFIGURATION
// ============================================================

export const getBackupFolderPath = (): string | null => {
  try {
    return localStorage.getItem('senior_citizen_accessories_backup_folder_path');
  } catch (e) {
    console.error('Failed to get backup folder path', e);
    return null;
  }
};

export const setBackupFolderPath = (path: string): void => {
  try {
    localStorage.setItem('senior_citizen_accessories_backup_folder_path', path);
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
// Now seeds the dialog with the configured BACKUP folder (best option — admin
// picks folder once in Admin → DB & Backups, then every export starts there).
export async function pickBackupSavePath(defaultFileName: string): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const backupFolder = getBackupFolderPath();
    const defaultPath = backupFolder
      ? `${backupFolder.replace(/[/\\]+$/, '')}\\${defaultFileName}`
      : defaultFileName;
    const selected = await dialog.save({
      title: 'Save System Backup',
      defaultPath,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick backup save path', e);
    return null;
  }
}

// Open a native save dialog for a data export (CSV/XLSX/PDF) and seed it in
// the configured BACKUP folder. Returns the chosen path or null.
export async function pickExportSavePath(
  defaultFileName: string,
  extension: string,
  title: string = 'Save Export'
): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const backupFolder = getBackupFolderPath();
    const defaultPath = backupFolder
      ? `${backupFolder.replace(/[/\\]+$/, '')}\\${defaultFileName}`
      : defaultFileName;
    const selected = await dialog.save({
      title,
      defaultPath,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    return typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.error('Failed to pick export save path', e);
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
// Seeds the open dialog in the configured BACKUP folder when available.
export async function pickBackupFile(): Promise<string | null> {
  const dialog = await loadDialogPlugin();
  if (!dialog) return null;
  try {
    const backupFolder = getBackupFolderPath();
    const selected = await dialog.open({
      title: 'Select Backup File to Restore',
      multiple: false,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      defaultPath: backupFolder || undefined,
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

/**
 * v1.6.0: renders the CURRENT shop currency (defaults NGN). Kept under the
 * old name so all 100+ call sites become currency-aware with zero edits —
 * new code should call formatMoney() from './currency' directly.
 */
export const formatNaira = (amount: number): string => formatMoney(amount);

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
