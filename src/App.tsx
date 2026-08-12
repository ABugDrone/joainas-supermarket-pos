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
  getActiveUser,
  setActiveUserStorage,
  loadUsers,
  saveUsers,
  recordAuditLog,
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

function MainAppContent() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'pos' | 'inventory' | 'customers' | 'sales' | 'financials' | 'expenses' | 'printer' | 'admin'
  >('pos');

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [printerConfig, setPrinterConfig] = useState<ThermalPrinterConfig>(loadPrinterConfig());
  const [users, setUsers] = useState<User[]>(() => loadUsers());

  // Current logged in user details
  const [currentUser, setCurrentUser] = useState<User>(() => {
    let stored = getActiveUser();
    if (stored) return stored;
    let allUsers = loadUsers();
    return allUsers[0] || {
      id: 'admin-1',
      username: 'admin',
      fullName: 'System Administrator',
      role: 'System Admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  });

  // Keep active user persisted across reloads and tab closes
  useEffect(() => {
    if (currentUser) {
      setActiveUserStorage(currentUser);
    }
  }, [currentUser]);

  // Modals state
  const [activeReceiptSale, setActiveReceiptSale] = useState<SaleRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);

  // Initialize data on mount
  useEffect(() => {
    setProducts(loadProducts());
    setCustomers(loadCustomers());
    setSales(loadSales());
    setExpenditures(loadExpenditures());
    setPrinterConfig(loadPrinterConfig());
  }, []);

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
    recordAuditLog(
      currentUser.username,
      currentUser.role,
      'User Authentication Logout',
      `Staff user "${currentUser.username}" (${currentUser.fullName}) logged out.`
    );
    showToast(`Logged out as "${currentUser.username}". Please authenticate to continue.`, 'info');
    setIsLoginModalOpen(true);
  };

  return (
    <DesktopShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      currentUser={currentUser.username}
      currentUserRole={currentUser.role}
      todaySalesTotal={todaySalesTotal}
      onOpenLoginModal={() => setIsLoginModalOpen(true)}
      onLogout={handleLogout}
      onOpenDevModal={() => setIsDevModalOpen(true)}
    >
      {activeTab === 'pos' && (
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

      {activeTab === 'inventory' && (
        <InventoryModule
          products={products}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddProduct={handleAddProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
        />
      )}

      {activeTab === 'customers' && (
        <CustomerModule
          customers={customers}
          sales={sales}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddCustomer={handleAddCustomer}
          onUpdateCustomerBalance={handleUpdateCustomerBalance}
        />
      )}

      {activeTab === 'sales' && (
        <SalesRecords
          sales={sales}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onReprintReceipt={(sale) => {
            setActiveReceiptSale(sale);
            setIsReceiptModalOpen(true);
          }}
        />
      )}

      {activeTab === 'financials' && (
        <FinancialReports
          sales={sales}
          expenditures={expenditures}
          products={products}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
        />
      )}

      {activeTab === 'expenses' && (
        <ExpenseModule
          expenditures={expenditures}
          currentUser={currentUser.username}
          currentUserRole={currentUser.role}
          onAddExpenditure={handleAddExpenditure}
          onDeleteExpenditure={handleDeleteExpenditure}
        />
      )}

      {activeTab === 'printer' && (
        <div className="p-6">
          <ThermalPrinterSettings
            config={printerConfig}
            currentUser={currentUser.username}
            currentUserRole={currentUser.role}
            onSave={handleSavePrinterConfig}
          />
        </div>
      )}

      {activeTab === 'admin' && (
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
