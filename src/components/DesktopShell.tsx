import React from 'react';
import {
  ShoppingCart,
  Package,
  Users,
  FileText,
  DollarSign,
  Printer,
  ShieldCheck,
  LogOut,
  Wifi,
  WifiOff,
  Clock,
  Palette,
  FileSpreadsheet,
  Bell,
  BellRing,
  AlertTriangle,
  PackagePlus,
} from 'lucide-react';
import { HeaderLogo } from './HeaderLogo';
import { formatNaira, playLowStockAlert } from '../utils/storage';
import { Capability, UserRole, Product } from '../types';
import { useToast } from './Toast';
import {
  getSavedTheme,
  applyThemeToDocument,
  ThemeId,
  APP_THEMES,
  getSavedFontSize,
  applyFontSizeToDocument,
  FontSizeId,
  getSavedFontFamily,
  applyFontFamilyToDocument,
  FontFamilyId,
} from '../utils/theme';
import { ThemeSelectorModal } from './ThemeSelectorModal';

interface DesktopShellProps {
  activeTab: 'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'admin';
  setActiveTab: (tab: 'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'admin') => void;
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities: Capability[];
  todaySalesTotal: number;
  products: Product[];
  onOpenLoginModal: () => void;
  onLogout?: () => void;
  onOpenDevModal: () => void;
  children: React.ReactNode;
}

type TabId = 'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'admin';

// The capability required to see each module. 'admin' capability implies all.
const NAV_CAPABILITY: Record<TabId, Capability> = {
  pos: 'sell',
  inventory: 'inventory',
  sales: 'view_sales',
  customers: 'customers',
  expenses: 'expenses',
  financials: 'view_reports',
  printer: 'printer_settings',
  admin: 'admin',
};

const NAV_ITEMS: {
  id: TabId;
  icon: React.ElementType;
  label: string;
  shortcut: string;
  activeColor: string;
}[] = [
  { id: 'pos', icon: ShoppingCart, label: 'Sell', shortcut: 'F1', activeColor: 'bg-[var(--accent-color)] text-white' },
  { id: 'inventory', icon: Package, label: 'Inventory', shortcut: 'F2', activeColor: 'bg-emerald-600 text-white' },
  { id: 'sales', icon: FileText, label: 'Sales', shortcut: 'F3', activeColor: 'bg-amber-600 text-white' },
  { id: 'customers', icon: Users, label: 'Customers', shortcut: 'F4', activeColor: 'bg-blue-600 text-white' },
  { id: 'expenses', icon: DollarSign, label: 'Expenses', shortcut: 'F5', activeColor: 'bg-rose-600 text-white' },
  { id: 'financials', icon: FileSpreadsheet, label: 'Reports', shortcut: 'F6', activeColor: 'bg-violet-600 text-white' },
  { id: 'printer', icon: Printer, label: 'Printer', shortcut: 'F7', activeColor: 'bg-indigo-600 text-white' },
  { id: 'admin', icon: ShieldCheck, label: 'Admin', shortcut: 'F8', activeColor: 'bg-purple-600 text-white' },
];

export const DesktopShell: React.FC<DesktopShellProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  currentUserRole,
  currentUserCapabilities,
  todaySalesTotal,
  products,
  onOpenLoginModal,
  onLogout,
  onOpenDevModal,
  children,
}) => {
  const { showToast } = useToast();
  const [time, setTime] = React.useState<string>('');
  const [date, setDate] = React.useState<string>('');
  const [isOffline, setIsOffline] = React.useState<boolean>(!navigator.onLine);

  // Low-stock alert state: bell badge + dropdown + hourly reminder.
  const [isStockAlertOpen, setIsStockAlertOpen] = React.useState(false);
  const lastStockAlertAtRef = React.useRef<number>(0);

  // Theme & Display State
  const [activeTheme, setActiveTheme] = React.useState<ThemeId>(() => getSavedTheme());
  const [activeFontSize, setActiveFontSize] = React.useState<FontSizeId>(() => getSavedFontSize());
  const [activeFontFamily, setActiveFontFamily] = React.useState<FontFamilyId>(() => getSavedFontFamily());
  const [isThemeModalOpen, setIsThemeModalOpen] = React.useState(false);

  // Products that are at or below their reorder level.
  const lowStockProducts = React.useMemo(
    () => products.filter((p) => p.stockQty <= p.reorderLevel),
    [products]
  );

  const hasInventoryCapability = currentUserCapabilities.includes('inventory');

  // Notify the current user when products are about to deplete — once on
  // mount, then repeated every 1 hour until the stock is replenished.
  React.useEffect(() => {
    if (lowStockProducts.length === 0) {
      lastStockAlertAtRef.current = 0;
      return;
    }

    const notify = () => {
      const now = Date.now();
      if (now - lastStockAlertAtRef.current < 60 * 60 * 1000) return;
      lastStockAlertAtRef.current = now;

      playLowStockAlert();

      const top = lowStockProducts.slice(0, 3).map((p) => p.name).join(', ');
      const more = lowStockProducts.length - 3;
      showToast(
        `Low stock alert: ${lowStockProducts.length} product(s) about to deplete (${top}${
          more > 0 ? ` +${more} more` : ''
        }). Please add stock.`,
        'warning'
      );
    };

    // Fire immediately so the user is aware as soon as stock runs low.
    const initial = setTimeout(notify, 1200);
    // Repeat the reminder every hour while stock stays low.
    const hourly = setInterval(notify, 60 * 60 * 1000);

    return () => {
      clearTimeout(initial);
      clearInterval(hourly);
    };
  }, [lowStockProducts.length, showToast]);

  // Capability-based filtering: admin sees all; everyone else only the
  // modules their granted capabilities allow.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (currentUserCapabilities.includes('admin')) return true;
    return currentUserCapabilities.includes(NAV_CAPABILITY[item.id]);
  });

  // If the current active tab is no longer visible (e.g. role change),
  // fall back to the first visible module.
  const safeActiveTab: TabId = visibleItems.some((i) => i.id === activeTab)
    ? activeTab
    : visibleItems[0]?.id || 'pos';

  React.useEffect(() => {
    applyThemeToDocument(activeTheme);
  }, [activeTheme]);

  React.useEffect(() => {
    applyFontSizeToDocument(activeFontSize);
  }, [activeFontSize]);

  React.useEffect(() => {
    applyFontFamilyToDocument(activeFontFamily);
  }, [activeFontFamily]);

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keyboard shortcut listener (F1 to F8) — only for visible modules.
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, TabId> = {
        F1: 'pos', F2: 'inventory', F3: 'sales', F4: 'customers',
        F5: 'expenses', F6: 'financials', F7: 'printer', F8: 'admin',
      };
      if (keyMap[e.key] && visibleItems.some((i) => i.id === keyMap[e.key])) {
        e.preventDefault();
        setActiveTab(keyMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, visibleItems]);

  return (
    <div className="flex h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans select-none overflow-hidden">
      {/* ===== LEFT SIDEBAR ===== */}
      <aside className="w-[72px] lg:w-[220px] bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] flex flex-col items-center lg:items-stretch py-4 gap-1 shrink-0">
        {/* Logo at top of sidebar */}
        <div className="flex items-center justify-center lg:justify-start lg:px-4 py-3 mb-2 gap-2.5">
          <img
            src="/logo.png"
            alt="Joainas Mart"
            className="w-10 h-10 rounded-lg object-contain"
          />
          <div className="hidden lg:block leading-tight">
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-sm text-[var(--text-primary)]">JOAINAS</span>
              <span className="font-extrabold text-[10px] rounded bg-gradient-to-r from-[var(--accent-orange)] to-[var(--accent-orange-hover)] px-1.5 py-0.5 text-white uppercase">
                MART
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-medium -mt-0.5">POS Terminal</div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block h-px bg-[var(--border-color)] mx-4 mb-2" />

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 w-full px-2 lg:px-3 flex-1">
          {visibleItems.map(({ id, icon: Icon, label, shortcut, activeColor }) => {
            const isActive = safeActiveTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                title={`${label} (${shortcut})`}
                className={`group flex items-center gap-3 px-3 lg:px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? `${activeColor} shadow-md`
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                  }`}
                />
                <span className="hidden lg:inline">{label}</span>
                <span className={`hidden lg:inline ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
                }`}>
                  {shortcut}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Today's Sales Card */}
        <div className="hidden lg:block mx-3 mb-3 p-4 rounded-xl bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-hover)] text-white shadow-lg">
          <div className="text-xs font-medium text-white/80 uppercase tracking-wide">Today's Sales</div>
          <div className="text-xl font-black mt-1">{formatNaira(todaySalesTotal)}</div>
        </div>

        {/* Sidebar Bottom - User Info & Settings */}
        <div className="hidden lg:block mx-3 mb-2 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-orange)] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {currentUser.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{currentUser}</div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">{currentUserRole}</div>
            </div>
          </div>
        </div>

        {/* Theme Settings Button */}
        <button
          onClick={() => setIsThemeModalOpen(true)}
          className="flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-3 mx-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
          title="Themes & Display Settings"
        >
          <Palette className="w-5 h-5 shrink-0 text-[var(--text-muted)]" />
          <span className="hidden lg:inline">Display</span>
        </button>

        {/* Logout Button */}
        <button
          onClick={onLogout || onOpenLoginModal}
          className="flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-3 mx-2 mb-2 rounded-xl text-sm font-semibold text-[var(--error)] hover:bg-[var(--error-bg)] transition"
          title="Log Out"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="hidden lg:inline">Log Out</span>
        </button>
      </aside>

      {/* ===== MAIN CONTENT AREA ===== */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 bg-[var(--bg-header)] border-b border-[var(--border-color)] flex items-center justify-between px-6 shrink-0">
          {/* Mobile Logo (visible only on small screens) */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/logo.png" alt="Joainas Mart" className="w-8 h-8 rounded object-contain" />
            <span className="font-extrabold text-sm text-[var(--text-primary)]">JOAINAS MART</span>
          </div>

          {/* Breadcrumb / Current Tab label */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">Module:</span>
            <span className="text-sm font-semibold text-[var(--text-primary)] capitalize">
              {visibleItems.find(n => n.id === safeActiveTab)?.label || 'Sell'}
            </span>
          </div>

          {/* Right side of header */}
          <div className="flex items-center gap-3">
            {/* Low stock notification bell */}
            <div className="relative">
              <button
                onClick={() => setIsStockAlertOpen((v) => !v)}
                className={`relative p-2 rounded-lg border transition ${
                  lowStockProducts.length > 0
                    ? 'bg-[var(--warning-bg)] border-[var(--warning)] text-[var(--warning)]'
                    : 'bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title={
                  lowStockProducts.length > 0
                    ? `${lowStockProducts.length} product(s) low on stock`
                    : 'No low stock alerts'
                }
              >
                {lowStockProducts.length > 0 ? (
                  <BellRing className="w-4 h-4 animate-pulse" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {lowStockProducts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--error)] text-white text-[10px] font-bold flex items-center justify-center shadow">
                    {lowStockProducts.length}
                  </span>
                )}
              </button>

              {isStockAlertOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-app)]">
                    <span className="text-xs font-black uppercase tracking-wide text-[var(--text-primary)] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                      Low Stock Alerts
                    </span>
                    <button
                      onClick={() => setIsStockAlertOpen(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {lowStockProducts.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        All products are well stocked. 🎉
                      </div>
                    ) : (
                      lowStockProducts.map((p) => (
                        <div
                          key={p.id}
                          className="px-4 py-2.5 border-b border-[var(--border-color)] last:border-0 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              Left: <strong className="text-[var(--error)]">{p.stockQty}</strong> / Reorder at{' '}
                              {p.reorderLevel}
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded bg-[var(--error-bg)] text-[var(--error)]">
                            Low
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {lowStockProducts.length > 0 && hasInventoryCapability && (
                    <button
                      onClick={() => {
                        setIsStockAlertOpen(false);
                        setActiveTab('inventory');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition"
                    >
                      <PackagePlus className="w-4 h-4" />
                      Restock in Inventory
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Online/Offline indicator */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              isOffline
                ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                : 'bg-[var(--success-bg)] text-[var(--success)]'
            }`}>
              {isOffline ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{isOffline ? 'Offline' : 'Online'}</span>
            </div>

            {/* User pill (mobile only) */}
            <div className="lg:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-orange)] flex items-center justify-center text-white text-[10px] font-bold">
                {currentUser.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-[var(--text-primary)]">{currentUser}</span>
            </div>

            {/* Theme button (mobile only) */}
            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Display Settings"
            >
              <Palette className="w-4 h-4" />
            </button>

            {/* Clock */}
            <div className="flex items-center gap-1.5 text-[var(--text-muted)] text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{date}</span>
              <span className="font-semibold text-[var(--text-secondary)]">{time}</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-[var(--bg-app)] p-4 lg:p-6">
          {children}
        </main>

        {/* Bottom Status Bar */}
        <footer className="bg-[var(--bg-header)] border-t border-[var(--border-color)] px-6 py-2 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-4 text-[var(--text-muted)]">
            <span>Joainas Mart POS • SQLite Synced</span>
            <button
              onClick={onOpenDevModal}
              className="text-[var(--accent-color)] hover:underline font-medium transition"
            >
              Tech Support
            </button>
          </div>
          <div className="text-[var(--text-muted)]">
            v1.3.1 • Dronebug Technologies
          </div>
        </footer>
      </div>

      {/* Display & Typography Settings Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        activeTheme={activeTheme}
        activeFontSize={activeFontSize}
        activeFontFamily={activeFontFamily}
        onSelectTheme={(newTheme) => setActiveTheme(newTheme)}
        onSelectFontSize={(newSize) => setActiveFontSize(newSize)}
        onSelectFontFamily={(newFamily) => setActiveFontFamily(newFamily)}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
};
