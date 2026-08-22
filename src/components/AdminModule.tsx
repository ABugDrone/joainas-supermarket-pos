import React, { useState } from 'react';
import { User, AuditLog, UserRole, Capability, CAPABILITY_PRESETS, Category } from '../types';
import { defaultCapabilitiesFor } from '../utils/permissions';
import {
  saveUsers,
  loadUsers,
  saveAuditLogs,
  loadAuditLogs,
  recordAuditLog,
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
  loadCategories,
  saveCategories,
  getBackupFolderPath,
  setBackupFolderPath,
  relocateDatabaseFolder,
  pickBackupSavePath,
  writeBackupFile,
  pickBackupFile,
  readBackupFile,
  resetAllSystemData,
  flushWrites,
} from '../utils/storage';
import { useToast } from './Toast';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Activity,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Trash2,
  UserCheck,
  UserX,
  Clock,
  Download,
  Upload,
  Database,
  RefreshCw,
  AlertTriangle,
  FileCode,
  HardDrive,
  Copy,
  FolderPlus,
  Edit2,
  ListFilter,
  Code2,
  RotateCcw,
  KeyRound,
} from 'lucide-react';

interface AdminModuleProps {
  currentUser: string;
  currentUserRole: UserRole;
  users?: User[];
  onUpdateUsers?: (users: User[]) => void;
  categories?: Category[];
  onCategoriesChange?: (categories: Category[]) => void;
  onDataReset?: () => void;
}

const SQLITE_SCHEMA_DDL = `-- ====================================================================
-- JOAINAS SUPERMARKET & COLDSTORE - DESKTOP TAURI (GO + SQLITE) SCHEMA
-- Database Engine: SQLite 3 (WAL Mode Enabled)
-- Full Admin Control: All tables support complete CRUD
-- ====================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('System Admin', 'Store Manager', 'Cashier', 'Inventory Staff', 'Accountant')) NOT NULL DEFAULT 'Cashier',
    status TEXT CHECK(status IN ('active', 'suspended')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PRODUCTS TABLE
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

-- 4. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    balance REAL NOT NULL DEFAULT 0.0,
    points INTEGER NOT NULL DEFAULT 0,
    advance_payment REAL NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. SALES TABLE
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
    sale_date TEXT NOT NULL,
    sale_time TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SALE_ITEMS TABLE
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_type TEXT CHECK(price_type IN ('retail', 'wholesale')) NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- 7. EXPENDITURES TABLE
CREATE TABLE IF NOT EXISTS expenditures (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    category TEXT CHECK(category IN ('Cold Room & Power', 'Transport & Freight', 'Salaries & Staff', 'Packaging & Bags', 'Maintenance', 'Miscellaneous')) NOT NULL,
    amount REAL NOT NULL DEFAULT 0.0,
    expense_date TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. PRINTER CONFIGS TABLE
CREATE TABLE IF NOT EXISTS printer_configs (
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
    print_density TEXT CHECK(print_density IN ('Normal', 'High', 'Draft')) NOT NULL DEFAULT 'Normal'
);

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    log_timestamp INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    log_time TEXT NOT NULL
);`;

export const AdminModule: React.FC<AdminModuleProps> = ({
  currentUser,
  currentUserRole,
  users = [],
  onUpdateUsers = (_users: User[]) => {},
  categories: categoriesProp,
  onCategoriesChange = (_categories: Category[]) => {},
  onDataReset = () => {},
}) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'categories' | 'audit' | 'database' | 'security'>('users');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadAuditLogs());

  // Security & recovery state (ADMIN only) — single question selected (1 of 5).
  // For legacy 1.3.7 vaults that stored all 5, we default to the first question on update.
  const [secSelectedIdx, setSecSelectedIdx] = useState(0);
  const [secSingleAnswer, setSecSingleAnswer] = useState('');
  const [secHasVault, setSecHasVault] = useState(false);
  const [secSaving, setSecSaving] = useState(false);
  const [capsSec, setCapsSec] = useState(false);
  const checkCapsSec = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsSec(e.getModifierState('CapsLock'));
  const [capsAddUser, setCapsAddUser] = useState(false);
  const checkCapsAddUser = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsAddUser(e.getModifierState('CapsLock'));
  React.useEffect(() => {
    (async () => {
      try {
        const { hasRecoverySetup, loadRecoveryRecord } = await import('../utils/recovery');
        setSecHasVault(await hasRecoverySetup());
        const rec = await loadRecoveryRecord();
        if (rec && rec.questions.length > 0) {
          // For updates from a 5-question legacy vault, pre-select its first question.
          setSecSelectedIdx(rec.questions[0].id);
        }
      } catch {}
    })();
  }, [activeTab]);

  // Full-system reset confirmation modal state (requires typing RESET).
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  // Category management state — prefers the App-level source of truth so the
  // POS grid picks up color changes immediately, with a local fallback.
  const [categories, setCategories] = useState<Category[]>(
    () => categoriesProp ?? loadCategories()
  );
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // User creation modal state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Cashier');
  const [newCapabilities, setNewCapabilities] = useState<Capability[]>(
    () => defaultCapabilitiesFor('Cashier')
  );

  // Audit filter state
  const [auditSearch, setAuditSearch] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');

  // SQL code view toggle
  const [showSqlViewer, setShowSqlViewer] = useState(false);

  // Backup folder configuration — the live database is relocated to the
  // chosen folder so data always lives where the admin can reach it.
  const handleConfigureBackupFolder = async () => {
    const relocated = await relocateDatabaseFolder();
    if (relocated) {
      setBackupFolderPath(relocated);
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Updated Database & Backup Folder Configuration',
        `Moved database and backups to: ${relocated}`
      );
      setAuditLogs(loadAuditLogs());
      showToast(`Database moved successfully to:\n${relocated}`, 'success');
      return;
    }

    // Browser fallback: typed prompt.
    const newPath = prompt('Enter the backup folder path (include "BACKUP" in the path for easier restoration):', getBackupFolderPath() || 'C:\\Users\\Documents\\BACKUP');
    if (newPath && newPath.trim()) {
      setBackupFolderPath(newPath.trim());
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Updated Backup Folder Configuration',
        `Changed backup folder path to: ${newPath.trim()}`
      );
      setAuditLogs(loadAuditLogs());
      showToast('Backup folder path updated successfully!', 'success');
    }
  };

  // Category CRUD Handlers — persist to storage AND bubble up to App state so
  // the POS grid and inventory pills re-render with new colors immediately.
  const applyCategories = (updated: Category[]) => {
    setCategories(updated);
    saveCategories(updated);
    onCategoriesChange(updated);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      showToast('Category name is required!', 'error');
      return;
    }

    let existing = categories.find((c) => c.name.toLowerCase() === newCatName.toLowerCase().trim());
    if (existing) {
      showToast(`Category "${newCatName}" already exists!`, 'error');
      return;
    }

    let newCat: Category = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      color: newCatColor,
      description: newCatDesc.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };

    let updated = [...categories, newCat];
    applyCategories(updated);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Created Product Category',
      `Added new inventory category "${newCat.name}" with color ${newCat.color}.`
    );

    setNewCatName('');
    setNewCatDesc('');
    setNewCatColor('#6366f1');
    showToast(`Category "${newCat.name}" added successfully!`, 'success');
  };

  const handleEditCategory = (cat: Category) => {
    setEditingCategory({ ...cat });
  };

  const handleSaveCategoryColor = () => {
    if (!editingCategory) return;
    const updated = categories.map((c) =>
      c.id === editingCategory.id ? { ...c, color: editingCategory.color } : c
    );
    applyCategories(updated);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Updated Category Color',
      `Changed color of category "${editingCategory.name}" to ${editingCategory.color}.`
    );
    setEditingCategory(null);
    showToast(`Color updated for "${editingCategory.name}".`, 'success');
  };

  const handleDeleteCategory = (cat: Category) => {
    if (confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      let updated = categories.filter((c) => c.id !== cat.id);
      applyCategories(updated);

      recordAuditLog(
        currentUser,
        currentUserRole,
        'Deleted Product Category',
        `Removed product category "${cat.name}".`
      );

      showToast(`Deleted category "${cat.name}".`, 'info');
    }
  };

  // Handle Add User
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newFullName.trim() || !newUsername.trim() || !newPassword.trim()) {
      showToast('Please fill in all staff details!', 'error');
      return;
    }

    if (newCapabilities.length === 0) {
      showToast('Please grant at least one access capability.', 'error');
      return;
    }

    let existing = users.find((u) => u.username.toLowerCase() === newUsername.toLowerCase().trim());
    if (existing) {
      showToast(`Username "${newUsername}" is already taken! Choose a unique username.`, 'error');
      return;
    }

    let nowStr = new Date().toISOString().split('T')[0];
    const { hash } = await import('bcryptjs');
    const hashedPassword = await hash(newPassword, 10);

    let newUser: User = {
      id: `usr-${Date.now()}`,
      fullName: newFullName.trim(),
      username: newUsername.trim(),
      password: hashedPassword,
      role: newRole,
      capabilities: newCapabilities,
      status: 'active',
      createdAt: nowStr,
    };

    let updatedUsers = [newUser, ...users];
    onUpdateUsers(updatedUsers);
    saveUsers(updatedUsers);

    // Record audit log
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Created Staff User',
      `Added new staff user "${newUser.username}" (${newUser.fullName}) with role "${newUser.role}".`
    );
    setAuditLogs(loadAuditLogs());

    showToast(`Staff user "${newUser.username}" added successfully!`, 'success');

    // Reset form
    setNewFullName('');
    setNewUsername('');
    setNewPassword('');
    setNewRole('Cashier');
    setNewCapabilities(defaultCapabilitiesFor('Cashier'));
    setIsAddUserOpen(false);
  };

  // Toggle user active / suspended status
  const handleToggleUserStatus = (user: User) => {
    let nextStatus: 'active' | 'suspended' = user.status === 'active' ? 'suspended' : 'active';
    let updatedUsers = users.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u));

    onUpdateUsers(updatedUsers);
    saveUsers(updatedUsers);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Updated Staff Status',
      `Changed staff account "${user.username}" status to "${nextStatus}".`
    );
    setAuditLogs(loadAuditLogs());

    showToast(`Staff user "${user.username}" is now ${nextStatus.toUpperCase()}`, 'info');
  };

  // Delete user
  const handleDeleteUser = (user: User) => {
    const adminCount = users.filter((u) => (u.capabilities || []).includes('admin')).length;
    const isAdminAccount = (user.capabilities || []).includes('admin') || user.role === 'System Admin';
    if (isAdminAccount && adminCount <= 1) {
      showToast('Cannot delete the primary Master System Administrator!', 'error');
      return;
    }

    let updatedUsers = users.filter((u) => u.id !== user.id);
    onUpdateUsers(updatedUsers);
    saveUsers(updatedUsers);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Deleted Staff User',
      `Deleted staff account "${user.username}" (${user.fullName}).`
    );
    setAuditLogs(loadAuditLogs());

    showToast(`Staff user "${user.username}" removed.`, 'warning');
  };

  // Export Complete System Backup (JSON)
  const handleExportBackup = async () => {
    try {
      const backupData = {
        app: 'JOAINAS MART POS SYSTEM',
        version: '1.3.9',
        timestamp: new Date().toISOString(),
        products: loadProducts(),
        customers: loadCustomers(),
        sales: loadSales(),
        expenditures: loadExpenditures(),
        printerConfig: loadPrinterConfig(),
        users: loadUsers(),
        auditLogs: loadAuditLogs(),
      };

      const backupFolderPath = getBackupFolderPath();
      const currentDate = new Date().toISOString().split('T')[0];
      const fileName = `joainas_mart_backup_${currentDate}.json`;
      const dataStr = JSON.stringify(backupData, null, 2);

      // Native save dialog: the admin picks exactly where the backup file
      // is stored on disk (just like restore lets them pick the file).
      let savedPath: string | null = null;
      try {
        savedPath = await pickBackupSavePath(fileName);
      } catch (dialogError) {
        console.error('Save dialog failed, falling back to download', dialogError);
        savedPath = null;
      }

      if (savedPath) {
        await writeBackupFile(savedPath, dataStr);
        recordAuditLog(
          currentUser,
          currentUserRole,
          'Exported Database Backup',
          `Saved complete JSON system database backup to: ${savedPath}`
        );
        setAuditLogs(loadAuditLogs());
        showToast(`System backup saved successfully to:\n${savedPath}`, 'success');
        return;
      }

      // Browser fallback: standard download.
      const dataUrl = 'data:text/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataUrl);
      downloadAnchor.setAttribute('download', fileName);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      recordAuditLog(
        currentUser,
        currentUserRole,
        'Exported Database Backup',
        `Downloaded complete JSON system database backup file to ${backupFolderPath ? 'configured BACKUP folder' : 'default location'}.`
      );
      setAuditLogs(loadAuditLogs());

      if (backupFolderPath) {
        showToast(`System backup exported successfully! Look for "${fileName}" in your BACKUP folder: ${backupFolderPath}`, 'success');
      } else {
        showToast('Complete system backup JSON downloaded successfully! Consider configuring a backup folder for easier access.', 'success');
      }
    } catch (e) {
      console.error('Backup failed', e);
      showToast('Failed to generate backup file!', 'error');
    }
  };

  // Import System Backup File (JSON)
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.products || !parsed.customers || !parsed.sales) {
          showToast('Invalid backup file format! Missing required database tables.', 'error');
          return;
        }

        if (parsed.products) saveProducts(parsed.products);
        if (parsed.customers) saveCustomers(parsed.customers);
        if (parsed.sales) saveSales(parsed.sales);
        if (parsed.expenditures) saveExpenditures(parsed.expenditures);
        if (parsed.printerConfig) savePrinterConfig(parsed.printerConfig);
        if (parsed.users) {
          saveUsers(parsed.users);
          onUpdateUsers(parsed.users);
        }
        if (parsed.auditLogs) saveAuditLogs(parsed.auditLogs);

        recordAuditLog(
          currentUser,
          currentUserRole,
          'Restored System Backup',
          `Restored database tables from backup file "${file.name}".`
        );

        showToast('Database backup restored successfully! Reloading system...', 'success');
        // Make sure every restored table (especially users) is durable on disk
        // before the reload, otherwise the app could restart with no accounts.
        void flushWrites().finally(() => {
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        });
      } catch (err) {
        console.error('Failed to import backup', err);
        showToast('Error reading backup JSON file!', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Native restore picker — point directly at the folder/file where the
  // backup was originally saved during export.
  const handleNativeRestore = async () => {
    try {
      const path = await pickBackupFile();
      if (!path) return; // user cancelled

      const contents = await readBackupFile(path);
      const parsed = JSON.parse(contents);
      if (!parsed.products || !parsed.customers || !parsed.sales) {
        showToast('Invalid backup file format! Missing required database tables.', 'error');
        return;
      }

      if (parsed.products) saveProducts(parsed.products);
      if (parsed.customers) saveCustomers(parsed.customers);
      if (parsed.sales) saveSales(parsed.sales);
      if (parsed.expenditures) saveExpenditures(parsed.expenditures);
      if (parsed.printerConfig) savePrinterConfig(parsed.printerConfig);
      if (parsed.users) {
        saveUsers(parsed.users);
        onUpdateUsers(parsed.users);
      }
      if (parsed.auditLogs) saveAuditLogs(parsed.auditLogs);

      recordAuditLog(
        currentUser,
        currentUserRole,
        'Restored System Backup',
        `Restored database tables from backup file "${path}".`
      );

      showToast('Database backup restored successfully! Reloading system...', 'success');
      // Make sure every restored table (especially users) is durable on disk
      // before the reload, otherwise the app could restart with no accounts.
      await flushWrites();
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('Failed to restore native backup', err);
      showToast('Error reading backup JSON file!', 'error');
    }
  };

  // Full factory reset — requires typing RESET to confirm.
  const handleFullReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      showToast('Type "RESET" to confirm the full system reset.', 'error');
      return;
    }

    try {
      await resetAllSystemData();
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Full System Reset',
        'Factory reset completed: all business data cleared and categories restored to defaults (admin reset).'
      );
      setAuditLogs(loadAuditLogs());
      setIsResetConfirmOpen(false);
      setResetConfirmText('');
      onDataReset();
      // Make sure the audit log of the reset itself is durable too, then reload
      // into the fresh (empty) system. Only reload AFTER everything is flushed
      // so the old rows can never reappear.
      await flushWrites();
      showToast('Full system reset complete. The app is ready for fresh use — you will be logged out.', 'success');
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error('Full system reset failed', error);
      showToast('Reset failed — please try again.', 'error');
    }
  };

  // Filtered Audit Logs
  let filteredLogs = auditLogs.filter((log) => {
    let matchesSearch =
      log.username.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(auditSearch.toLowerCase());

    let matchesUser = selectedUserFilter === 'all' || log.username === selectedUserFilter;

    return matchesSearch && matchesUser;
  });

  return (
    <div className="p-6 space-y-6 select-none font-sans text-[#e2e8f0]">
      {/* Module Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-950 border border-purple-800 text-purple-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              System Administrator Control Center
            </h1>
            <p className="text-xs text-slate-400">
              Manage staff accounts, inspect real-time audit logs, and handle database backups and security.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-2 bg-[#0d1117] p-1.5 rounded-xl border border-[#30363d]">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'users'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff Users ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            <span>Categories ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'database'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>SQLite DB & Backups</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'security'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Security & Recovery</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Staff Users Management */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-extrabold uppercase text-slate-300 tracking-wider">
              Registered Terminal Staff & Administrators
            </h2>
            <button
              onClick={() => setIsAddUserOpen(true)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-950/50 border border-purple-400 transition flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New Staff Account</span>
            </button>
          </div>

          <div className="bg-[#161b22] rounded-2xl border border-[#30363d] overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-[#30363d]">
                  <th className="py-3 px-4">Staff Name</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No staff accounts found. Click "Add New Staff Account" above.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-[#1f242d] transition">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-800 text-purple-300 flex items-center justify-center font-black text-xs uppercase">
                          {user.username.charAt(0)}
                        </div>
                        <div>
                          <div>{user.fullName}</div>
                          {user.username === currentUser && (
                            <span className="text-[9px] bg-cyan-900/60 text-cyan-300 px-1.5 py-0.5 rounded font-mono">
                              Logged In
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-extrabold text-cyan-400">
                        @{user.username}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border ${
                            user.role === 'System Admin'
                              ? 'bg-purple-950 border-purple-800 text-purple-300'
                              : user.role === 'Store Manager'
                              ? 'bg-blue-950 border-blue-800 text-blue-300'
                              : 'bg-emerald-950 border-emerald-800 text-emerald-300'
                          }`}
                        >
                          {user.role}
                        </span>
                        {(user.capabilities || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 max-w-[220px]">
                            {(user.capabilities || []).slice(0, 4).map((cap) => (
                              <span
                                key={cap}
                                className="px-1.5 py-0.5 rounded bg-[#0d1117] border border-[#30363d] text-[9px] font-bold uppercase tracking-wide text-slate-400"
                              >
                                {cap.replace(/_/g, ' ')}
                              </span>
                            ))}
                            {(user.capabilities || []).length > 4 && (
                              <span className="px-1.5 py-0.5 rounded bg-[#0d1117] border border-[#30363d] text-[9px] font-bold text-slate-500">
                                +{(user.capabilities || []).length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {user.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-400 font-bold">
                            <XCircle className="w-4 h-4" /> Suspended
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {user.createdAt}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            title={user.status === 'active' ? 'Suspend Staff Account' : 'Activate Staff Account'}
                            className={`p-1.5 rounded-lg border transition ${
                              user.status === 'active'
                                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
                                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60'
                            }`}
                          >
                            {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(user)}
                            title="Delete Staff User"
                            className="p-1.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Dynamic Category Management */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Create Category Card */}
            <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-purple-400 font-extrabold text-sm uppercase tracking-wide border-b border-[#30363d] pb-3">
                <FolderPlus className="w-5 h-5" />
                <span>Add Store Category</span>
              </div>

              <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                    Category Name:
                  </label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Dairy & Ice Creams"
                    className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white font-bold outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                    Description / Notes:
                  </label>
                  <textarea
                    rows={2}
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Brief description of items in this category..."
                    className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                    Category Color:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="w-12 h-10 rounded-lg border border-[#30363d] bg-[#0d1117] cursor-pointer"
                      title="Pick category color"
                    />
                    <input
                      type="text"
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="flex-1 p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white font-mono text-xs outline-none focus:border-purple-500"
                      placeholder="#6366f1"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    This color classifies the category in the POS product grid.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-purple-400 transition flex items-center justify-center gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Create Category</span>
                </button>
              </form>
            </div>

            {/* Category Table List */}
            <div className="md:col-span-2 bg-[#161b22] border border-[#30363d] rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 bg-[#0d1117] border-b border-[#30363d] flex justify-between items-center">
                <span className="font-extrabold text-xs uppercase text-slate-300 tracking-wider flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-purple-400" />
                  Registered Product Categories ({categories.length})
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-[#30363d]">
                      <th className="py-3 px-4">Category Name</th>
                      <th className="py-3 px-4">Color</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                          No product categories added yet. Create one using the form on the left.
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-[#1f242d] transition">
                          <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                              style={{ backgroundColor: cat.color || '#6366f1' }}
                            ></span>
                            <span>{cat.name}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-white"
                              style={{ backgroundColor: cat.color || '#6366f1' }}
                            >
                              {cat.color || '#6366f1'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">
                            {cat.description || 'No description provided'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {cat.createdAt || 'System Default'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditCategory(cat)}
                                className="p-1.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-400 hover:bg-amber-900/60 transition"
                                title="Edit Category Color"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat)}
                                className="p-1.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 transition"
                                title="Delete Category"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Audit Logs & Activity Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#161b22] p-4 rounded-2xl border border-[#30363d]">
            <div className="relative col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail by user, action or details..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#30363d] bg-[#0d1117] text-white text-xs outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-[#30363d] bg-[#0d1117] text-white text-xs outline-none focus:border-cyan-500"
              >
                <option value="all">All Staff Users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.username}>
                    {u.username} ({u.fullName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-[#161b22] rounded-2xl border border-[#30363d] overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-[#30363d]">
                  <th className="py-3 px-4">Time & Date</th>
                  <th className="py-3 px-4">Staff User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Action Carried Out</th>
                  <th className="py-3 px-4">Activity Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      No audit activity records found matching search filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#1f242d] transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{log.time}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{log.date}</div>
                      </td>

                      <td className="py-3 px-4 font-bold text-white font-mono">
                        @{log.username}
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold text-slate-300 bg-[#21262d] px-2 py-0.5 rounded border border-[#30363d]">
                          {log.userRole}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-extrabold text-cyan-300">
                        {log.action}
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-medium leading-normal">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Database & Backup Management */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Backup Card */}
            <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-xl">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Download Database Backup</h3>
                  <p className="text-xs text-slate-400">Export complete JSON file containing all products, sales, customers, expenditures & users.</p>
                </div>
              </div>

              {/* Backup Folder Path Display */}
              <div className="p-3 bg-[#0d1117] border border-emerald-800/30 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <HardDrive className="w-4 h-4" />
                    <span>BACKUP Folder Configuration:</span>
                  </div>
                  <button
                    onClick={handleConfigureBackupFolder}
                    className="px-2 py-1 bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 text-[10px] font-bold rounded transition hover:bg-emerald-900/50"
                  >
                    Change
                  </button>
                </div>
                <div className="text-xs text-slate-300 font-mono bg-[#161b22] px-2 py-1 rounded border border-[#30363d]">
                  {getBackupFolderPath() || 'Not configured - using default download location'}
                </div>
                {!getBackupFolderPath() && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    💡 Configure a BACKUP folder for easier file management during restoration
                  </p>
                )}
              </div>

              <div className="p-4 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span>Registered Products:</span>
                  <strong className="text-white font-mono">{loadProducts().length} items</strong>
                </div>
                <div className="flex justify-between">
                  <span>Customer Ledger Accounts:</span>
                  <strong className="text-white font-mono">{loadCustomers().length} profiles</strong>
                </div>
                <div className="flex justify-between">
                  <span>Sales Transaction Records:</span>
                  <strong className="text-white font-mono">{loadSales().length} receipts</strong>
                </div>
              </div>

              <button
                onClick={handleExportBackup}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-emerald-400/40 transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export System Backup (JSON)</span>
              </button>
            </div>

            {/* Import Backup Card */}
            <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-950 border border-cyan-800 text-cyan-400 rounded-xl">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Restore Database Backup</h3>
                  <p className="text-xs text-slate-400">Upload a previously saved `.json` database file to restore store records.</p>
                </div>
              </div>

              <div className="p-4 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs space-y-2 text-slate-300">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Warning: Restoring will overwrite existing data.</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Make sure you select a valid Joainas Mart backup file generated by this system.
                  {getBackupFolderPath() && (
                    <span className="block mt-1 text-cyan-400 font-bold">
                      💡 Look for backup files in your BACKUP folder: {getBackupFolderPath()}
                    </span>
                  )}
                </p>
              </div>

              <label className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-cyan-400/40 transition flex items-center justify-center gap-2 cursor-pointer mb-2">
                <Upload className="w-4 h-4" />
                <span>Select & Restore JSON Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
              <button
                onClick={handleNativeRestore}
                className="w-full py-3 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-300 font-extrabold text-xs uppercase tracking-wider rounded-xl shadow border border-cyan-400/30 transition flex items-center justify-center gap-2"
              >
                <FileCode className="w-4 h-4" />
                <span>Browse Disk & Restore (Native)</span>
              </button>
            </div>
          </div>

          {/* Danger Zone Card (Admin-only) — single guarded factory reset.
              Per-store request, the one-click "Reset Inventory" and
              "Reset Sales & Reports" buttons were REMOVED so inventory and
              sales can never be wiped by accident: once products/sales are
              added they stay until a deliberate, typed-confirmation reset. */}
          <div className="bg-[#1a1114] border border-red-900/60 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-red-900/40 pb-4">
              <div className="p-3 bg-red-950 border border-red-800 text-red-400 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  Danger Zone — Full System Reset
                  <span className="text-[9px] bg-red-900/60 text-red-300 px-2 py-0.5 rounded border border-red-700 font-mono">ADMIN ONLY</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Inventory and sales records are permanent once added — there is no one-click
                  reset for them anymore. The ONLY way to clear business data is the full factory
                  reset below, which requires typing RESET to confirm. User accounts, printer
                  config and the login gate are always preserved.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#0d1117] border border-red-800/50 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-red-400 font-extrabold text-xs uppercase tracking-wide">
                <RotateCcw className="w-4 h-4" />
                <span>Full Reset (Factory)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Wipes ALL business data (products/inventory, sales, customers, expenses, audit logs)
                and restores default categories. Accounts &amp; login are kept. Use this only when you
                truly want to start the store from zero.
              </p>
              <button
                onClick={() => setIsResetConfirmOpen(true)}
                className="py-2.5 px-6 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Full System Reset
              </button>
            </div>

            <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-[10px] text-amber-400/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Tip: To remove individual items, use Inventory → Delete on each product, or Sales
                Records for receipts. A complete backup (JSON) is always recommended before any
                destructive action.
              </p>
            </div>
          </div>

          {/* SQLite Schema & Go Backend Manager Card */}
          <div className="bg-[#161b22] border border-[#30363d] p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#30363d] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-950 border border-purple-800 text-purple-400 rounded-xl">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    Tauri Go + SQLite Desktop Engine Schema
                    <span className="text-[10px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded border border-purple-700 font-mono">WAL MODE</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Full internal SQLite database schema definition with 9 core tables for complete local persistence.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(SQLITE_SCHEMA_DDL);
                    showToast('Copied full SQLite DDL schema to clipboard!', 'success');
                  }}
                  className="py-2 px-3 bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-purple-400" />
                  <span>Copy DDL</span>
                </button>

                <button
                  onClick={() => setShowSqlViewer(true)}
                  className="py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow border border-purple-400 transition flex items-center gap-1.5"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>View DDL Script</span>
                </button>
              </div>
            </div>

            {/* SQLite Table Inspection Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { name: 'users', label: 'Users', columns: 8, rows: users.length },
                { name: 'categories', label: 'Categories', columns: 4, rows: categories.length },
                { name: 'products', label: 'Products', columns: 11, rows: loadProducts().length },
                { name: 'customers', label: 'Customers', columns: 8, rows: loadCustomers().length },
                { name: 'sales', label: 'Sales Receipts', columns: 16, rows: loadSales().length },
                { name: 'sale_items', label: 'Sale Items', columns: 8, rows: 'Dynamic' },
                { name: 'expenditures', label: 'Expenditures', columns: 7, rows: loadExpenditures().length },
                { name: 'printer_configs', label: 'Printer Config', columns: 11, rows: 1 },
                { name: 'audit_logs', label: 'Audit Logs', columns: 8, rows: auditLogs.length },
              ].map((tbl) => (
                <div key={tbl.name} className="p-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs space-y-1">
                  <span className="font-mono font-bold text-cyan-400 block truncate">{tbl.name}</span>
                  <div className="text-[11px] text-slate-400 flex justify-between">
                    <span>{tbl.label}:</span>
                    <strong className="text-white font-mono">{tbl.rows}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{tbl.columns} columns</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Security & Recovery — 5 uncomfortable questions */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-amber-950/30 border border-amber-800/60 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-amber-800/30 pb-4">
              <div className="p-3 bg-amber-950 border border-amber-700 text-amber-400 rounded-xl">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-white">ADMIN Password Recovery Vault</h3>
                <p className="text-xs text-amber-200/70">
                  Pick <strong>1 of 5</strong> private questions to protect the ADMIN account. After <strong>5 failed logins</strong>, your chosen question is asked (legacy 1.3.7 vaults with 5 will still ask one at random). A correct answer reveals the actual password for <strong>30 seconds</strong> or lets you set a new one. Never shown until the 5th failure — skip now and set it later if you prefer.
                </p>
              </div>
              <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full border ${secHasVault ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-red-950 border-red-700 text-red-300'}`}>
                {secHasVault ? 'Vault Active' : 'No Vault Yet'}
              </span>
            </div>

            <div className="bg-[#0d1117] border border-amber-800/20 rounded-xl p-4 text-xs text-slate-300 leading-relaxed">
              <p className="font-bold text-amber-300 mb-1">Why 5 uncomfortable questions?</p>
              <p>They are private things only you know — not your phone number or staff ID that a colleague could guess. Example: your first crush, the exact date you met your partner, a nickname only family uses, an embarrassing teenage memory, a private fear. The recovery never displays unless you fail 5 times.</p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!secSingleAnswer.trim()) {
                  showToast('Please type your answer to the selected question.', 'error');
                  return;
                }
                if (secSingleAnswer.trim().length < 2) {
                  showToast('Answer too short.', 'error');
                  return;
                }
                const pwdInput = (document.getElementById('sec-vault-password') as HTMLInputElement | null)?.value || '';
                if (!pwdInput || pwdInput.length < 4) {
                  showToast('Enter the current ADMIN plain password to lock the vault (min 4 chars).', 'error');
                  return;
                }
                // verify it's actually the admin's current password
                const usersNow = loadUsers();
                const adminUser = usersNow.find((u) => u.username.toLowerCase() === 'admin' && u.role === 'System Admin') || usersNow.find((u) => u.username.toLowerCase() === 'admin');
                if (!adminUser) {
                  showToast('ADMIN account not found.', 'error');
                  return;
                }
                // quick bcrypt check for plain pwd
                try {
                  const { default: bcrypt } = await import('bcryptjs');
                  const isHashed = /^\$2[aby]\$\d{2}\$/.test(adminUser.password || '');
                  let ok = false;
                  if (isHashed) ok = await bcrypt.compare(pwdInput, adminUser.password as string);
                  else ok = adminUser.password === pwdInput;
                  if (!ok) {
                    showToast('That ADMIN password does not match the current one.', 'error');
                    return;
                  }
                } catch {}
                setSecSaving(true);
                try {
                  const { createSingleRecoveryRecord } = await import('../utils/recovery');
                  await createSingleRecoveryRecord(secSelectedIdx, secSingleAnswer, pwdInput);
                  setSecHasVault(true);
                  recordAuditLog(currentUser, currentUserRole, 'Updated ADMIN Recovery Vault', `Reconfigured the recovery question (1 of 5) for ADMIN password recovery.`);
                  setAuditLogs(loadAuditLogs());
                  showToast('Recovery vault saved — 1 question locked. Test by failing 5 logins.', 'success');
                  setSecSingleAnswer('');
                  const el = document.getElementById('sec-vault-password') as HTMLInputElement | null;
                  if (el) el.value = '';
                } catch (err) {
                  console.error(err);
                  showToast('Failed to save vault.', 'error');
                } finally {
                  setSecSaving(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] font-bold text-amber-300/90 uppercase tracking-wide mb-1">
                  Select one security question (1 of 5) — for updates, the first previously saved question is pre-selected
                </label>
                <select
                  value={secSelectedIdx}
                  onChange={(e) => setSecSelectedIdx(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white text-xs outline-none focus:border-amber-600"
                >
                  {[
                    'What is the full name of your first childhood crush (the first person you ever liked romantically)?',
                    'On what exact date (DD/MM/YYYY) did you first meet your current partner or lover in person for the first time?',
                    'What secret nickname does only your mother or closest family call you at home — one that no colleague or coworker knows?',
                    'What is one deeply embarrassing thing you did as a teenager that you have hidden from everyone at work?',
                    'What is a private fear or deep insecurity you have never shared with colleagues or customers?',
                  ].map((q, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}. {q}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-300/90 uppercase tracking-wide mb-1">
                  Your answer to the selected question
                </label>
                <input
                  type="text"
                  value={secSingleAnswer}
                  onChange={(e) => setSecSingleAnswer(e.target.value)}
                  placeholder="Type your private answer (required)"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white text-xs outline-none focus:border-amber-600"
                />
                <p className="text-[10px] text-slate-500 mt-1">Case-insensitive, never shown at login until 5 failed ADMIN attempts. Keep it private.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wide mb-1">
                  Confirm with current ADMIN plain password to encrypt the vault
                </label>
                <input
                  id="sec-vault-password"
                  type="password"
                  placeholder="Type ADMIN plain password"
                  onKeyUp={checkCapsSec}
                  onKeyDown={checkCapsSec}
                  className={`w-full px-3 py-2.5 rounded-xl border bg-[#0d1117] text-white text-xs outline-none focus:border-amber-600 ${capsSec ? 'border-amber-400' : 'border-amber-800/50'}`}
                />
                {capsSec && <p className="text-[10px] font-bold text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Caps Lock is ON</p>}
                <p className="text-[10px] text-slate-500 mt-1">We store the password obfuscated — it is only revealed after a correct security answer for 30 seconds. No one with DB access can read it without your answer.</p>
              </div>

              <button
                type="submit"
                disabled={secSaving}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2"
              >
                {secSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {secSaving ? 'Saving Vault...' : secHasVault ? 'Update Recovery Vault (1 Question)' : 'Create Recovery Vault (1 Question)'}
              </button>
            </form>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 text-xs">
              <p className="font-bold text-slate-300 mb-2">Developer retrieval (older installs without a vault)</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                <li>Open the login screen and press <code className="px-1 py-0.5 bg-black/30 rounded font-mono text-amber-300">Ctrl+Shift+Alt+D</code> to open the dev unlock.</li>
                <li>Enter master code <code className="px-1 py-0.5 bg-black/30 rounded font-mono text-amber-300">JOAINAS-DEV-2026-DRONEBUG</code> — if a vault exists, the plain password is revealed without a question.</li>
                <li>If no vault exists (v1.3.6 or earlier): close the app, locate the DB file shown in Admin → SQLite DB &amp; Backups (or <code className="font-mono">%APPDATA%\com.joainas.pos.desktop\db_path.txt</code>), open it with <code className="font-mono">sqlite3</code> or DB Browser, run <code className="font-mono">SELECT value FROM app_settings WHERE key='admin_recovery'</code> and <code className="font-mono">SELECT * FROM users WHERE username='admin'</code>. The <code className="font-mono">password_hash</code> is bcrypt — use <code className="font-mono">UPDATE users SET password_hash='' WHERE username='admin'</code> to clear it and set a new password via the app&apos;s “Set New Password” recovery, or copy the DB&apos;s <code className="font-mono">joainas_admin_recovery_v1</code> localStorage key and deobfuscate with the recovery utility.</li>
              </ol>
              <p className="text-[11px] text-slate-500 mt-3">Full guide: see <code className="font-mono">RECOVERY_GUIDE.md</code> in the install folder.</p>
            </div>
          </div>
        </div>
      )}

      {/* SQL DDL Code Modal */}
      {showSqlViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 text-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-purple-400" />
                <span>SQLite Internal DDL Schema (`sqlite_schema.sql`)</span>
              </h3>
              <button
                onClick={() => setShowSqlViewer(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto bg-[#0d1117] p-4 rounded-xl border border-[#30363d] text-cyan-300 font-mono text-[11px] leading-relaxed select-all">
              {SQLITE_SCHEMA_DDL}
            </pre>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SQLITE_SCHEMA_DDL);
                  showToast('Copied SQLite DDL Script to clipboard!', 'success');
                }}
                className="py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copy DDL Code</span>
              </button>
              <button
                onClick={() => setShowSqlViewer(false)}
                className="py-2 px-4 bg-[#21262d] border border-[#30363d] text-slate-300 font-bold rounded-lg text-xs hover:bg-[#30363d] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Staff User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 text-[#e2e8f0]">
            <div className="flex items-center justify-between pb-4 border-b border-[#30363d] mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                <h3 className="font-black text-sm text-white uppercase tracking-wide">
                  Register New Staff User
                </h3>
              </div>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-[#21262d]"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                  Staff Full Name:
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                  Terminal Username:
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. Cashier-2"
                  className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-purple-300 font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                  Access Role:
                </label>
                <select
                  value={newRole}
                  onChange={(e) => {
                    const role = e.target.value as UserRole;
                    setNewRole(role);
                    setNewCapabilities(defaultCapabilitiesFor(role));
                  }}
                  className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white outline-none focus:border-purple-500 font-bold"
                >
                  <option value="Cashier">Cashier (Sales POS Checkout)</option>
                  <option value="Store Manager">Store Manager (Inventory & Sales)</option>
                  <option value="Inventory Staff">Inventory Staff (Stock Entry)</option>
                  <option value="Accountant">Accountant (Financial Statements)</option>
                  <option value="System Admin">System Administrator (Full Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                  Granted Capabilities (tick what this account can do):
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['sell', 'Sell (POS Checkout)'],
                      ['inventory', 'Inventory & Stock'],
                      ['view_sales', 'View Sales Records'],
                      ['customers', 'Customers & Ledger'],
                      ['view_reports', 'Financial Reports'],
                      ['expenses', 'Expenses'],
                      ['printer_settings', 'Printer Settings'],
                      ['receipts', 'Receipts / Reprint'],
                      ['admin', 'Full Admin Access'],
                    ] as [Capability, string][]
                  ).map(([cap, label]) => (
                    <label
                      key={cap}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition ${
                        newCapabilities.includes(cap)
                          ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                          : 'bg-[#0d1117] border-[#30363d] text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newCapabilities.includes(cap)}
                        onChange={() => {
                          setNewCapabilities((prev) =>
                            prev.includes(cap)
                              ? prev.filter((c) => c !== cap)
                              : [...prev, cap]
                          );
                        }}
                        className="w-3.5 h-3.5 accent-purple-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(CAPABILITY_PRESETS) as UserRole[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setNewRole(preset);
                        setNewCapabilities(defaultCapabilitiesFor(preset));
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition ${
                        newRole === preset
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-[#0d1117] text-slate-400 border-[#30363d] hover:border-purple-500'
                      }`}
                    >
                      {preset} preset
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1 text-[10px]">
                  Account Password: {capsAddUser && <span className="ml-2 text-xs font-bold text-amber-400">Caps Lock ON</span>}
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyUp={checkCapsAddUser}
                  onKeyDown={checkCapsAddUser}
                  placeholder="••••••••"
                  className={`w-full p-2.5 rounded-xl border bg-[#0d1117] text-white outline-none focus:border-purple-500 font-mono ${capsAddUser ? 'border-amber-400' : 'border-[#30363d]'}`}
                />
                {capsAddUser && <p className="text-xs font-bold text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Caps Lock is ON</p>}
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase tracking-wider text-xs transition shadow-lg"
                >
                  Confirm & Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Color Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-purple-400 font-extrabold text-sm uppercase tracking-wide">
                <Edit2 className="w-5 h-5" />
                <span>Edit Category Color</span>
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-[#1f242d] transition"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="w-14 h-14 rounded-2xl border-2 border-white/20 shrink-0"
                style={{ backgroundColor: editingCategory.color || '#6366f1' }}
              ></span>
              <div>
                <p className="font-extrabold text-white text-sm">{editingCategory.name}</p>
                <p className="text-xs text-slate-400">
                  This color classifies this category in the POS product grid.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={editingCategory.color || '#6366f1'}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, color: e.target.value })
                }
                className="w-16 h-12 rounded-lg border border-[#30363d] bg-[#0d1117] cursor-pointer"
              />
              <input
                type="text"
                value={editingCategory.color || '#6366f1'}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, color: e.target.value })
                }
                className="flex-1 p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white font-mono text-xs outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditingCategory(null)}
                className="w-full py-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-300 font-bold uppercase tracking-wider text-xs transition hover:bg-[#1f242d]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategoryColor}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase tracking-wider text-xs transition shadow-lg"
              >
                Save Color
              </button>
            </div>
          </div>
        </div>
      )}
    {/* Full System Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#161b22] border border-red-800 rounded-2xl shadow-2xl p-6 text-[#e2e8f0] space-y-4">
            <div className="flex items-center gap-2 border-b border-red-800/50 pb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="font-black text-sm text-white uppercase tracking-wide">
                Confirm Full System Reset
              </h3>
              <button
                onClick={() => {
                  setIsResetConfirmOpen(false);
                  setResetConfirmText('');
                }}
                className="ml-auto text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-[#21262d]"
              >
                Cancel
              </button>
            </div>

            <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-[11px] text-red-200 leading-relaxed space-y-1">
              <p><strong>This will permanently delete:</strong></p>
              <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                <li>All products &amp; stock adjustments</li>
                <li>All sales receipts &amp; sale items</li>
                <li>All customers &amp; ledger balances</li>
                <li>All expenditures / reports data</li>
                <li>All audit logs</li>
                <li>Custom categories (restored to defaults)</li>
              </ul>
              <p className="text-slate-400 pt-1">
                User accounts, printer/hardware config and your login are kept.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Type <span className="text-red-400 font-mono">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFullReset();
                }}
                placeholder="Type RESET here"
                className="w-full p-2.5 rounded-xl border border-red-800/60 bg-[#0d1117] text-white font-mono font-bold outline-none focus:border-red-500 placeholder:text-slate-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsResetConfirmOpen(false);
                  setResetConfirmText('');
                }}
                className="w-full py-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-300 font-bold uppercase tracking-wider text-xs transition hover:bg-[#1f242d]"
              >
                Cancel
              </button>
              <button
                onClick={handleFullReset}
                disabled={resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-xs transition shadow-lg"
              >
                Wipe All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
