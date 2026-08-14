import React, { useState, useEffect, useMemo } from 'react';
import {
  Product,
  Customer,
  SaleRecord,
  Expenditure,
  ThermalPrinterConfig,
  User,
  UserRole,
} from './types';
import {
  loadProducts,
  saveProducts,
  loadCustomers,
  saveCustomers,
  loadSales,
  saveSales,
  loadExpenditures,
  saveExpenditures,
  loadPrinterConfig,
  savePrinterConfig,
  isAdminSetupCompleted,
  setActiveUserStorage,
  loadUsers,
  saveUsers,
  recordAuditLog,
  isLicenseAccepted,
  setLicenseAccepted,
  getDatabaseMigrationNote,
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
import { AdminModule } from './components/AdminModule';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { LoginModal } from './components/LoginModal';
import { DeveloperModal } from './components/DeveloperModal';
import { LicenseAgreement } from './components/LicenseAgreement';
import { can } from './utils/permissions';

function MainAppContent() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'admin'
  >('pos');

  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [customers, setCustomers] = useState<Customer[]>(() => loadCustomers());
  const [sales, setSales] = useState<SaleRecord[]>(() => loadSales());
  const [expenditures, setExpenditures] = useState<Expenditure[]>(() => loadExpenditures());
  const [printerConfig, setPrinterConfig] = useState<ThermalPrinterConfig>(() => loadPrinterConfig());
  const [users, setUsers] = useState<User[]>(() => loadUsers());

  // Current logged in user — always starts as null. Per-process session:
  // the app never auto-logs-in; a fresh login is required every launch
  // and after every sign-out.
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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

  // Show a one-time note if the live database was moved to Documents\Backup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const note = await getDatabaseMigrationNote();
      if (!cancelled && note) {
        showToast(note, 'info');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Sync back to storage on updates
  const handleCompleteSale = (newSale: SaleRecord) => {
    let updatedSales = [newSale, ...sales];
    setSales(updatedSales);
    saveSales(updatedSales);

    let updatedProducts = products.map((prod) => {
      let soldItem = newSale.items.find((item) => item.product.id === prod.id);
      if (soldItem) {
        return {
          ...prod,
          stockQty: Math.max(0, prod.stockQty - soldItem.quantity),
        };
      }
      return prod;
    });
    setProducts(updatedProducts);
    saveProducts(updatedProducts);

    if (newSale.customerId) {
      let updatedCustomers = customers.map((cust) => {
        if (cust.id === newSale.customerId) {
          let newBalance = cust.balance + newSale.balanceDue;
          let newPoints = cust.points + newSale.pointsEarned;
          return {
            ...cust,
            balance: newBalance,
            points: newPoints,
          };
        }
        return cust;
      });
      setCustomers(updatedCustomers);
      saveCustomers(updatedCustomers);
    }

    setActiveReceiptSale(newSale);
    setIsReceiptModalOpen(true);
  };

  // Product CRUD
  const handleAddProduct = (newProd: Product) => {
    let updated = [newProd, ...products];
    setProducts(updated);
    saveProducts(updated);
  };

  const handleUpdateProduct = (updatedProd: Product) => {
    let updated = products.map((p) => (p.id === updatedProd.id ? updatedProd : p));
    setProducts(updated);
    saveProducts(updated);
  };

  const handleDeleteProduct = (id: string) => {
    let updated = products.filter((p) => p.id !== id);
    setProducts(updated);
    saveProducts(updated);
  };

  // Customer CRUD
  const handleAddCustomer = (newCust: Customer) => {
    let updated = [newCust, ...customers];
    setCustomers(updated);
    saveCustomers(updated);
  };

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

  // Today Sales Total Calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySalesTotal = useMemo(() => {
    return sales
      .filter((s) => s.date === todayStr)
      .reduce((sum, s) => sum + s.totalAmount, 0);
  }, [sales, todayStr]);

  const handleUpdateUsers = (updatedUsers: User[]) => {
    setUsers(updatedUsers);
    saveUsers(updatedUsers);
  };

  const handleLogout = () => {
    if (currentUser) {
      recordAuditLog(
        currentUser.username,
        currentUser.role,
        'User Authentication Logout',
        `Staff user "${currentUser.username}" (${currentUser.fullName}) logged out.`
      );
    }
    // Clear the per-process session completely — returns to the login gate.
    setActiveUserStorage(null);
    setCurrentUser(null);
    showToast('Signed out. Please authenticate to continue.', 'info');
  };

  // Full-screen login gate: rendered instead of the POS shell whenever the
  // per-process session has no signed-in user.
  if (!currentUser) {
    return (
      <LoginModal
        isOpen
        onClose={() => {}}
        onLoginSuccess={(user) => setCurrentUser(user)}
        fullScreen
      />
    );
  }

  return (
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
    >
      {activeTab === 'pos' && can(currentUser, 'sell') && (
        <POSModule
          products={products}
          customers={customers}
          printerConfig={printerConfig}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onCompleteSale={handleCompleteSale}
          onOpenCustomerModal={() => setActiveTab('customers')}
        />
      )}

      {activeTab === 'inventory' && can(currentUser, 'inventory') && (
        <InventoryModule
          products={products}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddProduct={handleAddProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
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
        <FinancialReports
          sales={sales}
          expenditures={expenditures}
          products={products}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
        />
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
            onSave={handleSavePrinterConfig}
          />
        </div>
      )}

      {activeTab === 'admin' && can(currentUser, 'admin') && (
        <AdminModule
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          users={users}
          onUpdateUsers={handleUpdateUsers}
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
        onLoginSuccess={(user) => setCurrentUser(user)}
      />

      <DeveloperModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
      />
    </DesktopShell>
  );
}

export default function App() {
  const [isSetupDone, setIsSetupDone] = useState<boolean>(() => isAdminSetupCompleted());
  const [licenseAccepted, setLicenseAcceptedState] = useState<boolean>(() => isLicenseAccepted());
  const [licenseAction, setLicenseAction] = useState<'agree' | 'decline' | null>(null);

  const handleAgree = () => {
    setLicenseAccepted(true);
    setLicenseAcceptedState(true);
  };

  const handleDecline = () => {
    setLicenseAction('decline');
  };

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
              You must accept the license agreement to use Joainas POS. The app will now close.
            </p>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
                  import('@tauri-apps/api/core').then((m) =>
                    m.invoke('plugin:app|exit').catch(() => window.close())
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

  if (!isSetupDone) {
    return (
      <ToastProvider>
        <FirstTimeAdminSetup onSetupComplete={() => setIsSetupDone(true)} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <MainAppContent />
    </ToastProvider>
  );
}
