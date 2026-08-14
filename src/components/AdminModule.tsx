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
} from 'lucide-react';

interface AdminModuleProps {
  currentUser: string;
  currentUserRole: UserRole;
  users?: User[];
  onUpdateUsers?: (users: User[]) => void;
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
}) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'categories' | 'audit' | 'database'>('users');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadAuditLogs());

  // Category management state
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
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

  // Category CRUD Handlers
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
      description: newCatDesc.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };

    let updated = [...categories, newCat];
    setCategories(updated);
    saveCategories(updated);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Created Product Category',
      `Added new inventory category "${newCat.name}".`
    );

    setNewCatName('');
    setNewCatDesc('');
    showToast(`Category "${newCat.name}" added successfully!`, 'success');
  };

  const handleDeleteCategory = (cat: Category) => {
    if (confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      let updated = categories.filter((c) => c.id !== cat.id);
      setCategories(updated);
      saveCategories(updated);

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
        version: '1.3.0',
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
        setTimeout(() => {
          window.location.reload();
        }, 1200);
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
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('Failed to restore native backup', err);
      showToast('Error reading backup JSON file!', 'error');
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
                    rows={3}
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Brief description of items in this category..."
                    className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white outline-none focus:border-purple-500"
                  />
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
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                          No product categories added yet. Create one using the form on the left.
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-[#1f242d] transition">
                          <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                            <span>{cat.name}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">
                            {cat.description || 'No description provided'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {cat.createdAt || 'System Default'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-1.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 transition"
                              title="Delete Category"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                  Account Password:
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 rounded-xl border border-[#30363d] bg-[#0d1117] text-white outline-none focus:border-purple-500 font-mono"
                />
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
    </div>
  );
};
