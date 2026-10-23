import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Product,
  Customer,
  SaleRecord,
  Expenditure,
  ThermalPrinterConfig,
  User,
  UserRole,
  Category,
  isUncountedKind,
} from './types';
import {
  loadProducts,
  saveProducts,
  loadCustomers,
  saveCustomers,
  loadSales,
  saveSales,
  recordSaleWithStockUpdate,
  saveAutosaveSnapshot,
  loadExpenditures,
  saveExpenditures,
  loadPrinterConfig,
  savePrinterConfig,
  isAdminSetupCompleted,
  getActiveUser,
  setActiveUserStorage,
  loadUsers,
  saveUsers,
  recordAuditLog,
  isLicenseAccepted,
  setLicenseAccepted,
  getDatabaseMigrationNote,
  loadCategories,
  saveCategories,
  isStorageInitialized,
  persistAllToDatabase,
  hasLocalAccountsSync,
  isSetupDoneSync,
  getClockGate,
  reanchorClock,
} from './utils/storage';

import { ToastProvider, useToast } from './components/Toast';
import { FirstTimeAdminSetup } from './components/FirstTimeAdminSetup';
import { DesktopShell } from './components/DesktopShell';
import { POSModule } from './components/POSModule';
import { InventoryModule } from './components/InventoryModule';
import { CustomerModule } from './components/CustomerModule';
import { SalesRecords } from './components/SalesRecords';
import { FinancialReports } from './components/FinancialReports';
import { ExpenseModule } from './components/ExpenseModule';
import { ThermalPrinterSettings } from './components/ThermalPrinterSettings';
// Lazy-load Analytics (chart.js + react-chartjs-2) so a chart failure can
// never block the initial login/license render ("stuck in splash").
const AnalyticsModule = React.lazy(() =>
  import('./components/analytics/AnalyticsModule').then((m) => ({ default: m.AnalyticsModule }))
);
import { AdminModule } from './components/AdminModule';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { LoginModal } from './components/LoginModal';
import { DeveloperModal } from './components/DeveloperModal';
import { LicenseAgreement } from './components/LicenseAgreement';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClockTamperGateModal } from './components/ClockTamperGateModal';
import { can, isAdmin } from './utils/permissions';
import {
  addClockOverrideAlert,
  clearClockOverrideAlerts,
  clearClockOverrideSession,
  loadClockOverrideAlerts,
  loadClockOverrideSession,
  setClockOverrideSession,
  type ClockOverrideAlert,
  type ClockOverrideSession,
} from './utils/clockOverride';
import { useClockGate } from './hooks/useClockGate';
import { EDITION } from './config/edition';
import { PremiumLock } from './components/PremiumLock';
import {
  startClockMonitor,
  refreshGate,
  probeLocalPersistence,
  CLOCK_GATE_EVENT,
  CLOCK_LOGOUT_EVENT,
  type ClockGate,
  type StorageHealth,
} from './utils/trustedTime';

// v1.5.1 full build: login screen is enabled (authentication, staff users
// and all 1.4.9-line modules are unlocked). Single local fallback user only
// used when no session exists yet.
const OPEN_SOURCE_USER: User = {
  id: 'amor-ims-local-user',
  fullName: 'Joainas Mart User',
  username: 'Joainas Mart',
  password: '',
  role: 'System Admin',
  capabilities: ['sell', 'inventory', 'view_sales', 'customers', 'expenses', 'view_reports', 'printer_settings', 'admin'],
  status: 'active',
  createdAt: '2026-01-01',
};
import { saveWorkspace, loadWorkspace, PosWorkspace, InventoryDraft, WorkspaceSnapshot } from './utils/workspace';
import { useDisableBrowserInterference } from './hooks/useDisableBrowserInterference';
import { isTauriRuntime } from './utils/db';

function MainAppContent() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'analytics' | 'admin'
  >('pos');

  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [customers, setCustomers] = useState<Customer[]>(() => loadCustomers());
  const [sales, setSales] = useState<SaleRecord[]>(() => loadSales());
  const [expenditures, setExpenditures] = useState<Expenditure[]>(() => loadExpenditures());
  const [printerConfig, setPrinterConfig] = useState<ThermalPrinterConfig>(() => loadPrinterConfig());
  const [users, setUsers] = useState<User[]>(() => loadUsers());
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());

  // Current logged in user — restored from sessionStorage so a browser
  // refresh keeps the session (only closing the tab/window clears it).
  // v1.5.1 full build: authentication is enabled, session restored on refresh.
  const [currentUser, setCurrentUser] = useState<User | null>(() =>
    EDITION.isOpenSource ? OPEN_SOURCE_USER : getActiveUser()
  );

  // v2.0.6 clock override / FLASHALERT. The alert list is persistent
  // (localStorage) and survives logout/restart; the runtime override is
  // session-scoped and keeps the live monitor from logging the user out.
  const clockGate = useClockGate();
  const [clockAlerts, setClockAlerts] = useState<ClockOverrideAlert[]>(() => loadClockOverrideAlerts());
  const [clockOverride, setClockOverride] = useState<ClockOverrideSession | null>(() =>
    loadClockOverrideSession()
  );
  const clockOverrideRef = React.useRef<ClockOverrideSession | null>(clockOverride);
  const [isClockVerifyOpen, setIsClockVerifyOpen] = useState(false);
  React.useEffect(() => {
    clockOverrideRef.current = clockOverride;
  }, [clockOverride]);

  // Restore/clean the runtime override after a webview reload. An ADMIN
  // session never carries an override; a different account's stale override
  // must not leak into this session.
  React.useEffect(() => {
    if (!currentUser) {
      if (clockOverrideRef.current) {
        clearClockOverrideSession();
        setClockOverride(null);
      }
      return;
    }
    if (isAdmin(currentUser)) {
      // A restored ADMIN session (webview reload) is also an ADMIN presence:
      // clear any FLASHALERT that survived and leave an audit trail.
      const pending = loadClockOverrideAlerts();
      if (pending.length > 0) {
        recordAuditLog(
          currentUser.username,
          currentUser.role,
          'FLASHALERT Cleared by ADMIN Session',
          `ADMIN ${currentUser.username} resumed a session and cleared ${pending.length} pending FLASHALERT login(s).`
        );
      }
      clearClockOverrideSession();
      setClockOverride(null);
      clearClockOverrideAlerts();
      setClockAlerts([]);
      return;
    }
    const saved = loadClockOverrideSession();
    if (!saved || saved.username.toLowerCase() !== currentUser.username.toLowerCase()) {
      clearClockOverrideSession();
      setClockOverride(null);
    } else if (!clockOverrideRef.current) {
      setClockOverride(saved);
    }
  }, [currentUser?.id]);

  // Modals state
  const [activeReceiptSale, setActiveReceiptSale] = useState<SaleRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);

  // Initialize data on mount — now eagerly loaded via useState initializers.
  // This effect only serves as a fallback for edge cases where cache might be
  // empty on first render (e.g. browser dev mode).
  useEffect(() => {
    if (products.length === 0) setProducts(loadProducts());
    if (customers.length === 0) setCustomers(loadCustomers());
    if (sales.length === 0) setSales(loadSales());
    if (expenditures.length === 0) setExpenditures(loadExpenditures());
  }, []);

  // Refresh from storage once background initStorage completes (main.tsx
  // renders first so the splash never hangs, then fires 'storage-ready').
  // Also removes the boot splash as soon as React has mounted.
  useEffect(() => {
    const splash = document.getElementById('senior-splash');
    if (splash && splash.parentElement?.id === 'root') {
      // Keep splash node out of the way once the app shell exists — React
      // replaced #root content on mount; this covers the interim splash child.
      splash.remove();
    }
    const refresh = () => {
      // Only pull in data when caches actually have content (never overwrite
      // live session edits with an empty load).
      const p = loadProducts();
      const c = loadCustomers();
      const s = loadSales();
      const e = loadExpenditures();
      if (p.length > 0) setProducts([...p]);
      if (c.length > 0) setCustomers([...c]);
      if (s.length > 0) setSales([...s]);
      if (e.length > 0) setExpenditures([...e]);
      const cats = loadCategories();
      if (cats.length > 0) setCategories([...cats]);
      setUsers([...loadUsers()]);
    };
    window.addEventListener('storage-ready', refresh);
    return () => window.removeEventListener('storage-ready', refresh);
  }, []);

  // Show a one-time note if the live database was moved to Documents\Backup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const note = await getDatabaseMigrationNote();
      if (!cancelled && note) {
        showToast(note, 'info');
      }
      try {
        const { consumeRecoveryNotice } = await import('./utils/storage');
        // Poll briefly: JSON recovery runs during initStorage and may finish
        // just after this effect fires.
        for (let i = 0; i < 10; i++) {
          const rec = consumeRecoveryNotice();
          if (rec) {
            if (!cancelled) {
              showToast(rec, 'success');
              // Refresh UI slices from the recovered caches.
              setProducts([...loadProducts()]);
              setSales([...loadSales()]);
              setCustomers([...loadCustomers()]);
              setExpenditures([...loadExpenditures()]);
              setUsers([...loadUsers()]);
            }
            break;
          }
          await new Promise((r) => setTimeout(r, 1000));
          if (cancelled) break;
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Atomic sale + stock update — single enqueued transaction so stock
  // never reverts if the app closes before a second write flushes.
  const handleCompleteSale = (newSale: SaleRecord, opts?: { saveOnly?: boolean }) => {
    // Compute updated products synchronously (services & edibles never decrement)
    const updatedProducts = products.map((prod) => {
      const soldItem = newSale.items.find((item) => item.product.id === prod.id);
      if (soldItem) {
        if (isUncountedKind(prod)) return prod;
        return { ...prod, stockQty: prod.stockQty - soldItem.quantity };
      }
      return prod;
    });

    // Update React state immediately (optimistic UI)
    setSales((prev) => [newSale, ...prev]);
    setProducts(updatedProducts);
    if (newSale.customerId) {
      setCustomers((prev) =>
        prev.map((cust) =>
          cust.id === newSale.customerId ? { ...cust, balance: cust.balance + newSale.balanceDue } : cust
        )
      );
    }

    // Persist atomically — single DB transaction for sale + stock.
    // v1.5.1: the trusted-clock validator can still refuse (clock moved
    // between the POS gate and this write) — roll back the optimistic UI.
    void recordSaleWithStockUpdate(newSale, updatedProducts).then((ok) => {
      if (!ok) {
        setSales(loadSales());
        setProducts(loadProducts());
        setCustomers(loadCustomers());
        showToast('Sale blocked — system clock problem detected. Correct the date/time and try again.', 'error');
      }
    });

    if (opts?.saveOnly) {
      return;
    }
    setActiveReceiptSale(newSale);
    setIsReceiptModalOpen(true);
  };

  // Product CRUD — functional updaters to avoid stale closures
  const handleAddProduct = (newProd: Product) => {
    setProducts((prev) => {
      const updated = [newProd, ...prev];
      saveProducts(updated);
      return updated;
    });
  };

  const handleUpdateProduct = (updatedProd: Product) => {
    setProducts((prev) => {
      const updated = prev.map((p) => (p.id === updatedProd.id ? updatedProd : p));
      saveProducts(updated);
      return updated;
    });
  };

  const handleDeleteProduct = (id: string) => {
    let updated = products.filter((p) => p.id !== id);
    setProducts(updated);
    saveProducts(updated);
  };

  // Bulk update (used by the Barcode Generator to assign barcodes in batch).
  const handleUpdateProducts = (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
    saveProducts(updatedProducts);
  };

  // Customer CRUD
  const handleAddCustomer = (newCust: Customer) => {
    let updated = [newCust, ...customers];
    setCustomers(updated);
    saveCustomers(updated);
  };

  // Ledger sync: contracts/micro-payments update SQLite customer balances;
  // refresh React state so cards + tallies stay realtime.
  React.useEffect(() => {
    const h = () => {
      try { setCustomers([...loadCustomers()]); } catch {}
    };
    window.addEventListener('ledger-changed', h);
    return () => window.removeEventListener('ledger-changed', h);
  }, []);

  const handleUpdateCustomerBalance = (customerId: string, amountPaid: number) => {
    let updated = customers.map((c) => {
      if (c.id === customerId) {
        return {
          ...c,
          balance: c.balance - amountPaid,
        };
      }
      return c;
    });
    setCustomers(updated);
    saveCustomers(updated);
  };

  // Expenditure CRUD
  const handleAddExpenditure = (newExp: Expenditure) => {
    let updated = [newExp, ...expenditures];
    setExpenditures(updated);
    saveExpenditures(updated);
  };

  const handleDeleteExpenditure = (id: string) => {
    let updated = expenditures.filter((e) => e.id !== id);
    setExpenditures(updated);
    saveExpenditures(updated);
  };

  // Printer Config update
  const handleSavePrinterConfig = (newConfig: ThermalPrinterConfig) => {
    setPrinterConfig(newConfig);
    savePrinterConfig(newConfig);
  };

  // Today Sales Total Calculation — use local date (not UTC) to avoid off-by-one in WAT (UTC+1).
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todaySalesTotal = useMemo(() => {
    return sales
      .filter((s) => s.date === todayStr)
      .reduce((sum, s) => sum + s.totalAmount, 0);
  }, [sales, todayStr]);

  const handleUpdateUsers = (updatedUsers: User[]) => {
    setUsers(updatedUsers);
    saveUsers(updatedUsers);
  };

  // ---- Per-user workspace continuity (v1.4.7) ----
  // Latest bill/draft snapshots live in refs (no re-render churn); they are
  // persisted per account on logout, sleep-logout, and tab-hide, and
  // restored when that same account logs back in.
  const posWsRef = React.useRef<PosWorkspace | null>(null);
  const invDraftRef = React.useRef<InventoryDraft | null>(null);
  const [restoredWs, setRestoredWs] = React.useState<WorkspaceSnapshot | null>(null);

  const snapshotWorkspace = React.useCallback((user: User) => {
    try {
      saveWorkspace(user.id, {
        version: 1,
        userId: user.id,
        username: user.username,
        savedAt: Date.now(),
        activeTab,
        pos: posWsRef.current,
        inventoryDraft: invDraftRef.current,
      });
    } catch {}
  }, [activeTab]);

  const performLogout = React.useCallback((reason: 'manual' | 'sleep' | 'clock') => {
    // Full build has authentication — logout is enabled.
    if (EDITION.isOpenSource) return;
    const user = getActiveUser() ?? currentUser;
    if (user) {
      snapshotWorkspace(user);
      recordAuditLog(
        user.username,
        user.role,
        reason === 'sleep'
          ? 'Auto Logout on Sleep'
          : reason === 'clock'
            ? 'Auto Logout on Clock Tamper'
            : 'User Authentication Logout',
        reason === 'sleep'
          ? `PC slept — "${user.username}" was signed out automatically. Workspace saved and restored on next sign-in.`
          : reason === 'clock'
            ? `System clock was changed backwards by more than 30 minutes — "${user.username}" was signed out automatically to protect sales records. Sign-in remains available with a FLASHALERT; an ADMIN must verify the clock.`
            : `Staff user "${user.username}" (${user.fullName}) logged out.`
      );
    }
    // A manual/sleep/clock logout ends this session's runtime override. The
    // persistent FLASHALERT is deliberately NOT cleared here.
    clearClockOverrideSession();
    setClockOverride(null);
    // Local-first: single snapshot file replaces old (business keeps going
    // from it); vault gets ONE full replace at this boundary — no per-action
    // redundancies, storage stays ~constant.
    try {
      saveAutosaveSnapshot();
    } catch {}
    // Fire-and-forget vault replace (close-flush + periodic tick cover the
    // worst case where logout is instantly followed by a kill).
    void persistAllToDatabase();
    // Clear the outgoing account's in-memory workspace so the next login
    // starts from THEIR snapshot, never the previous user's bill.
    posWsRef.current = null;
    invDraftRef.current = null;
    setRestoredWs(null);
    // Clear the per-process session completely — returns to the login gate.
    setActiveUserStorage(null);
    setCurrentUser(null);
    showToast(
      reason === 'sleep'
        ? 'PC slept — you were signed out. Your work is saved and will be restored at sign-in.'
        : reason === 'clock'
          ? 'System clock was changed — you were signed out. Sign in again to continue with a FLASHALERT, or ask an ADMIN to verify the clock.'
          : 'Signed out. Please authenticate to continue.',
      reason === 'sleep' ? 'warning' : reason === 'clock' ? 'error' : 'info'
    );
  }, [currentUser, snapshotWorkspace, showToast]);

  const handleLogout = () => performLogout('manual');

  // v2.0.6 trusted clock: live tamper response. A session signed in under a
  // clock warning carries a runtime override — it keeps trading (sales are
  // tagged in the audit trail) and is NOT auto-logged-out by the monitor.
  // Only sessions without an override are signed out on a real rollback.
  React.useEffect(() => {
    const onGate = (e: Event) => {
      try {
        const g = (e as CustomEvent<ClockGate>).detail;
        if (g && !g.ok && currentUser && !clockOverrideRef.current) performLogout('clock');
      } catch {
        /* a bad event must never break the session */
      }
    };
    const onForceLogout = () => {
      try {
        if (currentUser && !clockOverrideRef.current) performLogout('clock');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(CLOCK_GATE_EVENT, onGate);
    window.addEventListener(CLOCK_LOGOUT_EVENT, onForceLogout);
    return () => {
      window.removeEventListener(CLOCK_GATE_EVENT, onGate);
      window.removeEventListener(CLOCK_LOGOUT_EVENT, onForceLogout);
    };
  }, [currentUser, performLogout]);

  // Sleep detector: the event loop stalls during sleep/hibernate, so a
  // heartbeat gap far beyond the tick interval means the PC slept. Logout
  // ONLY (never close — ongoing procurement work must survive). Minimized
  // windows report hidden visibility, so those gaps are ignored.
  const lastTickRef = React.useRef<number>(Date.now());
  const wasVisibleRef = React.useRef<boolean>(typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  React.useEffect(() => {
    if (!currentUser) return;
    lastTickRef.current = Date.now();
    wasVisibleRef.current = document.visibilityState === 'visible';
    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTickRef.current;
      const visibleNow = document.visibilityState === 'visible';
      const wasVisible = wasVisibleRef.current;
      lastTickRef.current = now;
      wasVisibleRef.current = visibleNow;
      if (gap > 90000 && wasVisible && visibleNow) {
        console.warn(`Sleep detected (heartbeat gap ${Math.round(gap / 1000)}s) — auto logout`);
        performLogout('sleep');
      }
    }, 5000);
    return () => clearInterval(id);
  }, [currentUser, performLogout]);

  // Extra safety: snapshot the workspace whenever the page hides
  // (minimize, tab switch, pre-sleep) so a logout always has fresh data.
  React.useEffect(() => {
    if (!currentUser) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        try {
          saveAutosaveSnapshot();
        } catch {}
        snapshotWorkspace(currentUser);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [currentUser, snapshotWorkspace]);

  // Keep React state and sessionStorage in sync — LoginModal already
  // writes to sessionStorage, but the in-app re-login path (LoginModal
  // opened from DesktopShell) only called setCurrentUser before.
  const persistLogin = (user: User) => {
    // v2.0.6 clock policy: everyone can sign in. An ADMIN login verifies the
    // clock (re-anchor + native stamp rewrite) and clears every FLASHALERT.
    // A non-admin under a clock warning gets a persistent FLASHALERT and a
    // runtime override so they can keep selling; every sale is tagged.
    const gateAtLogin = getClockGate();
    const admin = isAdmin(user);
    const pendingAlerts = loadClockOverrideAlerts();

    if (admin) {
      clearClockOverrideSession();
      setClockOverride(null);
      clearClockOverrideAlerts();
      setClockAlerts([]);
      if (!gateAtLogin.ok) {
        reanchorClock(
          user.username,
          user.role,
          'ADMIN login under clock warning — current system date/time accepted and FLASHALERT cleared'
        );
        recordAuditLog(
          user.username,
          user.role,
          'FLASHALERT Cleared by ADMIN Login',
          `ADMIN ${user.username} signed in while the clock was unverified (${gateAtLogin.reason}). ` +
          `The trusted clock was re-anchored and ${pendingAlerts.length} pending FLASHALERT login(s) were cleared.`
        );
        showToast('ADMIN clock verification accepted — FLASHALERT cleared and trading restored.', 'success');
      } else if (pendingAlerts.length > 0) {
        recordAuditLog(
          user.username,
          user.role,
          'FLASHALERT Cleared by ADMIN Login',
          `ADMIN ${user.username} signed in normally and cleared ${pendingAlerts.length} pending FLASHALERT login(s).`
        );
        showToast('FLASHALERT cleared by ADMIN login.', 'success');
      }
    } else if (!gateAtLogin.ok) {
      const now = Date.now();
      const alert: ClockOverrideAlert = {
        username: user.username,
        fullName: user.fullName || user.username,
        role: user.role,
        loginAt: new Date(now).toISOString(),
        loginAtMs: now,
        gateReason: gateAtLogin.reason,
        lastGoodMs: gateAtLogin.lastGoodMs,
        nowMs: gateAtLogin.nowMs,
      };
      const next = addClockOverrideAlert(alert);
      setClockAlerts(next);
      setClockOverrideSession(alert);
      setClockOverride(alert);
      recordAuditLog(
        user.username,
        user.role,
        'Login with Clock Tamper Override',
        `"${user.username}" (${user.role}) signed in while the system clock was unverified. ` +
        `${gateAtLogin.reason} Sales remain enabled and are tagged in the audit trail; FLASHALERT stays until an ADMIN verifies the clock.`
      );
      showToast(
        `FLASHALERT: ${user.username} signed in with an unverified clock. Sales are allowed but tagged; an ADMIN must verify the clock.`,
        'warning'
      );
    } else {
      clearClockOverrideSession();
      setClockOverride(null);
    }

    setActiveUserStorage(user);
    setCurrentUser(user);
    // Restore this account's workspace (bill, draft, tab) if one was saved.
    try {
      const ws = loadWorkspace(user.id);
      setRestoredWs(ws);
      if (ws?.activeTab) {
        const tabs = ['pos', 'inventory', 'customers', 'sales', 'financials', 'expenses', 'printer', 'analytics', 'admin'] as const;
        if ((tabs as readonly string[]).includes(ws.activeTab)) {
          setActiveTab(ws.activeTab as typeof activeTab);
        }
      }
      if (ws && (ws.pos?.cart?.length || ws.inventoryDraft?.modalOpen)) {
        showToast(`Welcome back, ${user.fullName || user.username} — your work was restored.`, 'success');
      }
    } catch {}
  };

  // ADMIN password accepted at the clock-verification popup (login screen or
  // shell). The modal already re-anchored the clock and wrote its audit row;
  // here we clear the persistent FLASHALERT and the runtime override.
  const handleClockVerified = React.useCallback(() => {
    clearClockOverrideAlerts();
    clearClockOverrideSession();
    setClockAlerts([]);
    setClockOverride(null);
    setIsClockVerifyOpen(false);
    showToast('Clock verified — FLASHALERT cleared and sales are back to normal.', 'success');
  }, [showToast]);

  // Full-screen login gate: rendered instead of the POS shell whenever the
  // session has no signed-in user.
  if (!currentUser && !EDITION.isOpenSource) {
    return (
      <LoginModal
        isOpen
        onClose={() => {}}
        onLoginSuccess={persistLogin}
        clockAlerts={clockAlerts}
        onClockVerified={handleClockVerified}
        fullScreen
      />
    );
  }

  return (
    <>
      <DesktopShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser.username}
        currentUserRole={currentUser.role}
        currentUserCapabilities={currentUser.capabilities || []}
        todaySalesTotal={todaySalesTotal}
        products={products}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        onOpenDevModal={() => setIsDevModalOpen(true)}
        clockAlerts={isAdmin(currentUser) ? [] : clockAlerts}
        onVerifyClock={() => setIsClockVerifyOpen(true)}
      >
      {activeTab === 'pos' && can(currentUser, 'sell') && (
        <POSModule
          key={`pos-${currentUser.id}`}
          products={products}
          customers={customers}
          categories={categories}
          printerConfig={printerConfig}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          currentUserCapabilities={currentUser.capabilities || []}
          onCompleteSale={handleCompleteSale}
          onUpdateProduct={handleUpdateProduct}
          onOpenCustomerModal={() => setActiveTab('customers')}
          initialPosWorkspace={restoredWs?.pos ?? null}
          onPosWorkspaceChange={(w: PosWorkspace) => {
            posWsRef.current = w;
          }}
        />
      )}

      {activeTab === 'inventory' && can(currentUser, 'inventory') && (
        <InventoryModule
          key={`inv-${currentUser.id}`}
          products={products}
          categories={categories}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddProduct={handleAddProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
          initialDraft={restoredWs?.inventoryDraft ?? null}
          onDraftChange={(d: InventoryDraft) => {
            invDraftRef.current = d;
          }}
        />
      )}

      {activeTab === 'customers' && can(currentUser, 'customers') && (
        <CustomerModule
          customers={customers}
          sales={sales}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          currentUserCapabilities={currentUser.capabilities || []}
          onAddCustomer={handleAddCustomer}
          onUpdateCustomerBalance={handleUpdateCustomerBalance}
          onCustomersChanged={(u) => setCustomers([...u])}
        />
      )}

      {activeTab === 'sales' && can(currentUser, 'view_sales') && (
        <SalesRecords
          sales={sales}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          currentUserCapabilities={currentUser.capabilities || []}
          onReprintReceipt={(sale) => {
            setActiveReceiptSale(sale);
            setIsReceiptModalOpen(true);
          }}
        />
      )}

      {activeTab === 'financials' && can(currentUser, 'view_reports') && (
        EDITION.isOpenSource ? (
          <PremiumLock
            feature="Reports"
            title="Reports — Premium"
            whatItDoes="Reports adds up your sales, profit and expenses into a clean summary for any month or period. No manual calculation."
            example='It answers: "How much did I really make in August after removing expenses?" — sales minus costs, on one page.'
          />
        ) : (
          <FinancialReports
            sales={sales}
            expenditures={expenditures}
            products={products}
            currentUser={currentUser.username}
            currentUserRole={currentUser.role}
          />
        )
      )}

      {activeTab === 'expenses' && can(currentUser, 'expenses') && (
        <ExpenseModule
          expenditures={expenditures}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddExpenditure={handleAddExpenditure}
          onDeleteExpenditure={handleDeleteExpenditure}
        />
      )}

      {activeTab === 'printer' && can(currentUser, 'printer_settings') && (
        <div className="p-6">
          <ThermalPrinterSettings
            config={printerConfig}
            currentUser={currentUser.username}
            currentUserRole={currentUser.role}
            currentUserCapabilities={currentUser.capabilities || []}
            products={products}
            categories={categories}
            onSave={handleSavePrinterConfig}
            onUpdateProducts={handleUpdateProducts}
          />
        </div>
      )}

      {activeTab === 'analytics' && can(currentUser, 'admin') && (
        EDITION.isOpenSource ? (
          <PremiumLock
            feature="Analytics"
            title="Analytics — Premium"
            whatItDoes="Analytics turns your sales into simple charts and tables that show your best sellers and slow days at a glance."
            example='It answers: "Which product sells fastest on weekends?" — the chart points straight at it.'
          />
        ) : (
          <ErrorBoundary>
            <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading analytics…</div>}>
              <AnalyticsModule
                sales={sales}
                products={products}
                categories={categories}
                currentUser={currentUser.username}
                currentUserRole={currentUser.role}
              />
            </Suspense>
          </ErrorBoundary>
        )
      )}

      {activeTab === 'admin' && can(currentUser, 'admin') && (
        <AdminModule
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          users={users}
          categories={categories}
          onUpdateUsers={handleUpdateUsers}
          onCategoriesChange={(cats) => {
            setCategories(cats);
            saveCategories(cats);
          }}
          onDataReset={() => {
            // Reload every data slice from storage so the whole UI reflects a
            // freshly-reset database immediately (POS grid, sales, reports,
            // customer ledger, categories and the header today-total).
            setProducts(loadProducts());
            setSales(loadSales());
            setCustomers(loadCustomers());
            setExpenditures(loadExpenditures());
            setCategories(loadCategories());
          }}
        />
      )}

      {/* Global Modals */}
      <ThermalReceiptModal
        sale={activeReceiptSale}
        config={printerConfig}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={persistLogin}
        clockAlerts={clockAlerts}
        onClockVerified={handleClockVerified}
      />

      <DeveloperModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
      />
      </DesktopShell>

      <ClockTamperGateModal
        isOpen={isClockVerifyOpen}
        gate={clockGate}
        onClose={() => setIsClockVerifyOpen(false)}
        onVerified={handleClockVerified}
      />
    </>
  );
}

export default function App() {
  useDisableBrowserInterference();

  // v1.5.1 trusted clock: start the app-lifetime monitor once (singleton —
  // safe under StrictMode) and re-evaluate instantly whenever the window
  // regains focus or becomes visible, so a corrected clock unblocks the app
  // in real time (timers are throttled while the window is in the
  // background, which is what made recovery feel slow).
  useEffect(() => {
    try {
      startClockMonitor(2000);
    } catch {
      /* monitor must never break startup */
    }
    const recheck = () => {
      try {
        refreshGate();
      } catch {
        /* ignore */
      }
    };
    const onVisible = () => {
      try {
        if (document.visibilityState === 'visible') refreshGate();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const [isSetupDone, setIsSetupDone] = useState<boolean>(() => isAdminSetupCompleted());
  const [licenseAccepted, setLicenseAcceptedState] = useState<boolean>(() => isLicenseAccepted());
  const [licenseAction, setLicenseAction] = useState<'agree' | 'decline' | null>(null);

  // Setup/login flow state lives here UNCONDITIONALLY (never below an early
  // return). v2.0.0 post-mortem: these hooks used to sit below the EULA and
  // activation gates, so flipping a gate after mount changed the hook count
  // ("Rendered more hooks than during the previous render") and React
  // unmounted the whole window into a black screen right after activation.
  const hasAccounts = hasLocalAccountsSync();
  const setupDone = isSetupDone || isSetupDoneSync();
  const [installEvidence, setInstallEvidence] = useState<boolean | null>(
    () => (hasAccounts || setupDone ? true : null)
  );
  const [forceWizard, setForceWizard] = useState(false);
  // v1.5.1: every 1.5.0 shop has business data but zero accounts (1.5.0 had
  // no login), so the primary upgrade path is the data-preserving setup
  // screen. The manual recovery view below is a secondary fallback.
  const [showUpgradeRecovery, setShowUpgradeRecovery] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  // v1.4.6 renders before initStorage finishes, so setup/license state read
  // at mount is meaningless. Hold a neutral loading gate until storage is
  // ready (or the main.tsx timeout fires 'storage-ready'), THEN evaluate.
  // This fixes "setup from scratch on every launch".
  const [storageReady, setStorageReady] = useState<boolean>(() => isStorageInitialized());

  useEffect(() => {
    if (storageReady) return;
    const onReady = () => {
      setIsSetupDone(isAdminSetupCompleted());
      setLicenseAcceptedState(isLicenseAccepted());
      setStorageReady(true);
    };
    window.addEventListener('storage-ready', onReady);
    return () => window.removeEventListener('storage-ready', onReady);
  }, [storageReady]);

  // v1.5.2 storage self-test: probe localStorage writability once at boot.
  // A non-persistent profile (temp Windows profile, cleaner software, full
  // disk) makes EVERY boot look factory-fresh and loops setup forever with
  // no explanation — fail loud with an explicit screen instead.
  const [storageHealth, setStorageHealth] = useState<StorageHealth>(() => {
    try {
      return probeLocalPersistence();
    } catch {
      return { ok: true, reason: '' };
    }
  });

  // Install-evidence probe (ONE-WAY LATCH helper). Unconditional like every
  // other hook — it no-ops until storage is ready and accounts are absent.
  useEffect(() => {
    if (!storageReady || hasAccounts || installEvidence !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const { hasInstallEvidence } = await import('./utils/storage');
        const found = await hasInstallEvidence();
        if (!cancelled) setInstallEvidence(found);
      } catch {
        if (!cancelled) setInstallEvidence(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageReady, hasAccounts, installEvidence]);

  const handleAgree = () => {
    setLicenseAccepted(true);
    setLicenseAcceptedState(true);
  };

  const handleDecline = () => {
    setLicenseAction('decline');
  };

  const closeApp = () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then((m) =>
        m.invoke('force_exit').catch(() => window.close())
      );
    } else {
      window.close();
    }
  };

  if (!storageReady) {
    return (
      <ToastProvider>
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0c0e12] text-[#e2e8f0]">
          <img src="/logo.png" alt="Joainas Mart" className="w-20 h-20 object-contain" />
          <div className="font-extrabold text-lg text-white tracking-wide">Joainas Mart</div>
          <div className="text-xs text-slate-400">Inventory Management System · Loading…</div>
          <div className="w-8 h-8 border-[3px] border-[#1e293b] border-t-[#0052d4] rounded-full animate-spin"></div>
        </div>
      </ToastProvider>
    );
  }

  // v1.5.2: broken local persistence blocks EVERYTHING (license + setup +
  // login all depend on it). Creating accounts now would vanish on close,
  // so stop here with the reason instead of looping setup forever.
  if (!storageHealth.ok) {
    return (
      <ToastProvider>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-red-500/50 rounded-2xl p-8 text-center text-slate-200">
            <h3 className="text-lg font-bold text-white mb-2">Storage Problem — Data Cannot Be Saved</h3>
            <p className="text-sm text-slate-400 mb-2">
              The app cannot save sign-in data on this PC. Setup is blocked because any account created now would be lost when the app closes.
            </p>
            <p className="text-xs text-red-300/90 mb-4">{storageHealth.reason}</p>
            <p className="text-[11px] text-slate-500 mb-6 leading-snug">
              Common causes: running the app as a different Windows user each time, a full disk, antivirus quarantine, or PC-cleaner software wiping the app profile. Fix the cause, then retry.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  try {
                    setStorageHealth(probeLocalPersistence());
                  } catch {}
                }}
                className="px-6 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm"
              >
                Retry
              </button>
              <button
                onClick={closeApp}
                className="px-6 py-3 bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-semibold rounded-xl text-sm border border-[var(--border-color)]"
              >
                Close App
              </button>
            </div>
          </div>
        </div>
      </ToastProvider>
    );
  }

  if (!licenseAccepted && !licenseAction) {
    return (
      <ToastProvider>
        <LicenseAgreement onAgree={handleAgree} onDecline={handleDecline} />
      </ToastProvider>
    );
  }

  if (licenseAction === 'decline') {
    return (
      <ToastProvider>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl p-8 text-center text-slate-200">
            <h3 className="text-lg font-bold text-white mb-2">Agreement Declined</h3>
            <p className="text-sm text-slate-400 mb-6">
              You must accept the license agreement to use Joainas Mart. The app will now close.
            </p>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
                  import('@tauri-apps/api/core').then((m) =>
                    m.invoke('force_exit').catch(() => window.close())
                  );
                } else {
                  window.close();
                }
              }}
              className="px-6 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm"
            >
              Close App
            </button>
          </div>
        </div>
      </ToastProvider>
    );
  }

  // Only evaluated AFTER storage is ready (see storageReady gate above) —
  // otherwise a pre-init read would wrongly conclude setup is missing and
  // force the wizard on every launch.
  // v1.5.1 full build: admin setup + login + recovery gate are enabled.
  // Authentication is unlocked, so go through setup/login normally.
  if (EDITION.isOpenSource) {
    return (
      <ToastProvider>
        <ErrorBoundary>
          <MainAppContent />
        </ErrorBoundary>
      </ToastProvider>
    );
  }

  // ONE-WAY LATCH (v1.5.1 rule): the admin-creation screen appears ONLY when
  // zero accounts exist — a true fresh install OR a 1.5.0 upgrade (1.5.0 had
  // no login, so every existing shop has data but no accounts; setup only
  // ADDS the admin and preserves all business data). Once an admin exists,
  // updates always land on LOGIN. A manual backup-restore fallback sits one
  // tap below the upgrade screen.
  // v1.5.2: consult the synchronous snapshot/localStorage mirrors, not just
  // the post-init caches — a slow/failed init must never fake "zero
  // accounts" and loop a healthy install back to setup.
  // (The install-evidence probe effect lives above the early returns with
  // the other hooks; see above.)

  const runRecoveryScan = async () => {
    setRecovering(true);
    try {
      const { tryMergeSiblingDatabases, tryRecoverFromJsonBackup } = await import('./utils/storage');
      await tryMergeSiblingDatabases().catch(() => null);
      await tryRecoverFromJsonBackup(true).catch(() => null);
    } catch {}
    window.location.reload();
  };

  const runRecoveryFile = async (text: string) => {
    setRecovering(true);
    try {
      const { importBackupText } = await import('./utils/storage');
      importBackupText(text);
    } catch {}
    window.location.reload();
  };

  if (!hasAccounts && installEvidence === null && !forceWizard) {
    // Still determining fresh-install vs update — hold the loading gate.
    return (
      <ToastProvider>
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0c0e12] text-[#e2e8f0]">
          <img src="/logo.png" alt="Joainas Mart" className="w-20 h-20 object-contain" />
          <div className="font-extrabold text-lg text-white tracking-wide">Joainas Mart</div>
          <div className="text-xs text-slate-400">Inventory Management System · Checking installation…</div>
          <div className="w-8 h-8 border-[3px] border-[#1e293b] border-t-[#0052d4] rounded-full animate-spin"></div>
        </div>
      </ToastProvider>
    );
  }

  // v1.5.2 default-to-setup: zero accounts + a resolved evidence check
  // (EITHER way) => setup wizard. A fresh install has NO evidence by
  // definition, so requiring positive evidence dead-ended slow/weak PCs on
  // a login screen with zero accounts. Updates always have accounts, so
  // they still land on LOGIN as the one-way latch requires.
  if (!hasAccounts && (installEvidence !== null || forceWizard)) {
    if (!forceWizard && installEvidence && showUpgradeRecovery) {
      // Manual recovery fallback (reached via "Restore it first" on the
      // upgrade screen): LOGIN + recovery tools, banner pinned to the
      // BOTTOM so it never covers the username/password inputs.
      return (
        <ToastProvider>
          <div className="fixed bottom-0 inset-x-0 z-[60] px-4 pb-3">
            <div className="max-w-3xl mx-auto max-h-[42vh] overflow-y-auto bg-amber-950/95 border border-amber-500/50 rounded-2xl p-4 text-amber-100 shadow-2xl">
              <div className="font-black text-sm">Restore from backup</div>
              <p className="text-xs mt-1 text-amber-200/90">
                Your data is still on disk — recover it here, then continue to
                create your admin account.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  disabled={recovering}
                  onClick={runRecoveryScan}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs"
                >
                  {recovering ? 'Working…' : 'Scan & unite databases'}
                </button>
                <button
                  disabled={recovering}
                  onClick={async () => {
                    try {
                      const { pickBackupFile, readBackupFile } = await import('./utils/storage');
                      const { isTauriRuntime } = await import('./utils/db');
                      if (isTauriRuntime()) {
                        const path = await pickBackupFile();
                        if (!path) return;
                        const text = await readBackupFile(path);
                        await runRecoveryFile(text);
                      } else {
                        fileInputRef.current?.click();
                      }
                    } catch {}
                  }}
                  className="px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-amber-500/40 text-amber-100 font-black text-xs"
                >
                  Restore backup file…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => runRecoveryFile(String(r.result || ''));
                    r.readAsText(f);
                  }}
                />
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-xl text-amber-300 hover:text-amber-100 underline font-bold text-xs"
                >
                  Retry
                </button>
                <button
                  onClick={() => setForceWizard(true)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 underline font-bold text-xs ml-auto"
                >
                  Start fresh setup instead
                </button>
              </div>
            </div>
          </div>
          <LoginModal isOpen onClose={() => {}} onLoginSuccess={() => window.location.reload()} fullScreen />
        </ToastProvider>
      );
    }
    // v1.5.1 upgrade rule: zero accounts + an existing install (every 1.5.0
    // shop, which had no login) goes to the data-preserving admin setup —
    // existing products, sales, customers and records are kept, the new
    // admin is only added. TRUE fresh installs take the same screen.
    // Completing setup latches the flag so this screen never returns.
    // (A manual backup-restore fallback is one tap away on upgrade installs.)
    const isUpgrade = !!installEvidence && !forceWizard;
    return (
      <ToastProvider>
        <ErrorBoundary>
          <FirstTimeAdminSetup upgradeMode={isUpgrade} onSetupComplete={() => setIsSetupDone(true)} />
          {isUpgrade && !showUpgradeRecovery && (
            <div className="fixed bottom-0 inset-x-0 z-[60] px-4 pb-4 text-center">
              <button
                onClick={() => setShowUpgradeRecovery(true)}
                className="text-xs font-bold text-slate-400 hover:text-slate-200 underline"
              >
                Have a backup file? Restore it first
              </button>
            </div>
          )}
        </ErrorBoundary>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <MainAppContent />
      </ErrorBoundary>
    </ToastProvider>
  );
}
