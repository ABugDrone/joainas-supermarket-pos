# Joainas Mart POS System - Changelog

## Version 1.3.2 (2026-08-16)

### 🎨 New Features
- **POS Product Grid Redesign**: Product cards now use category color-coded edges, stock-status borders (green/orange/red), price badges and stock pills for at-a-glance inventory health
- **Barcode Generator**: New admin tool to generate and print unique barcode labels (series 200XXXX) in two formats — label-printer rolls or A4 sheets
- **Financial Statements with Date Range**: Reports module now supports monthly, quarterly (Q1–Q4), half-year (H1/H2), full-year and custom from–to date range statements
- **A4 Financial Statement Print**: Statements render on A4 (210×297mm) with a receipt-style preview modal, printable to A4 or saved as PNG/PDF
- **Sell Service**: The primary POS nav item is renamed from "Sell" to "Sell Service"

### 🐛 Fixed Bugs
- **Reports Module Crash**: Fixed missing `FinancialStatementPaper` import that threw `ReferenceError` and prevented the Reports module from opening
- **POS Light-Theme Text**: Dark POS sections now use explicit light-on-dark colors so text stays readable in light theme (and prints match the dark POS design)

### 🔧 Technical Improvements
- Version bumped to 1.3.2 across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json
- Added `html-to-image` and `jspdf` for statement PNG/PDF export

---

## Version 1.3.1 (2026-08-14)

### 🔔 New Feature
- **Low Stock Notification Bell**: A persistent bell icon in the header alerts staff when products are about to deplete
  - Red badge shows the number of products at or below their reorder level
  - Clicking the bell opens a dropdown listing every low-stock item (current stock vs reorder threshold) with a "Restock in Inventory" shortcut
  - Reminder notification fires once on login and then **every 1 hour** (with a distinct alert sound) until the stock is replenished
  - Reminders stop automatically once all products are back above their reorder level

### 🐛 Fixed Bugs
- **License Agreement Crash**: Fixed `setLicenseAccepted is not defined` ReferenceError that blocked the license screen from being accepted on v1.3.0
- **Blank Screen After Login**: Data is now loaded eagerly from the store cache so modules render immediately instead of flashing blank
- **Login Overlay Flash**: Removed the fragile gradient overlay on the full-screen login to prevent a lingering blank screen after sign-in
- **Quick Access Buttons Removed**: Removed the "Quick Access" auto-login buttons from the login UI — all staff must now type their username and password (no more hardcoded credentials)

### 📋 Technical Improvements
- Version bumped to 1.3.1 across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json
- Added `playLowStockAlert` tone (distinct double-beep) in storage utilities

---

## Version 1.3.0 (2026-08-14)

### 🔐 New Features
- **License Agreement**: New end-user license agreement screen shown on first launch
  - Seven plain-English terms with a read-to-end checkbox
  - Decline option closes the app cleanly
- **Hardened Authentication**: Passwords are now securely hashed (bcrypt) instead of stored in plain text
  - Existing plain-text passwords are auto-migrated to hashes on first login
  - Per-process session: closing the app signs you out; every launch requires a fresh login
  - First login is always by the admin created during initial setup
- **Capability-Based Access Control**: Staff access is now controlled by fine-grained capabilities instead of broad roles
  - Admin, Cashier, Inventory, Manager, and custom roles map to specific capabilities
  - Admin module: checkbox grid + preset buttons when creating/editing users
  - POS, Inventory, Customers, Sales, Reports, Expenses, Printer, and Admin modules are hidden or locked based on the signed-in user's capabilities
- **Role-Scoped Visibility**:
  - Sales Records: cashiers only see (and can reprint) their own transactions; admin sees all
  - Customers: staff only see customers they registered or served; admin sees all (creator + served-by ownership)
  - Locked records show a lock icon with an explanation
- **Customer Account Types**: New customers can be registered as Individual, Company, NGO, or Government
  - Company/organisation name field adapts to the account type
  - Phone number is now optional (privacy friendly)
- **Database Relocation**: The live database now lives in Documents\Backup (or a user-chosen folder)
  - First launch automatically copies any legacy database into the new location
  - Admin can relocate the database to any folder through the setup and admin flows
  - A one-time note informs the user when the database has been moved
- **Receipt Export**: Thermal receipts can now be saved as PNG or PDF via a native save dialog
- **Improved Receipt Printing**: Print isolation now reliably prints only the receipt at the correct paper width (58mm / 80mm)
- **Barcode Scanning**: POS barcode scan auto-adds the exact match to the bill and keeps focus for rapid scanning

### 🧹 Removed
- **Wholesale Pricing**: Wholesale/Retail toggle removed from POS, cart preview, and inventory
  - All sales now use retail pricing; wholesale price data is retained in the database for future reference

### 📋 Technical Improvements
- Version bumped to 1.3.0 across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json
- Migration v3: users.capabilities column, customers account_type / assigned_cashier columns (phone now optional)
- Permission helpers (can / isAdmin / hasAny / defaultCapabilitiesFor) centralize access checks

---

## Version 1.2.0 (2026-08-12)

### 🎨 Fixed Issues
- **Light Theme Text Readability**: Fixed low-contrast text colors in all light themes (Joainas Light, Emerald Fresh, Warm Amber)
  - Improved text contrast ratios for better readability
  - Enhanced text colors for muted, secondary, and accent text
  - Better placeholder text visibility in all input fields
  - Added comprehensive CSS overrides for light theme text colors

### 🗂️ New Features
- **Backup Folder Configuration**: Added backup folder selection during initial admin setup
  - Two-step setup process: Account creation + Backup folder configuration
  - Users can select or configure a BACKUP folder for easier file management
  - Quick-select options for common backup locations
  - Backup folder path is displayed in Admin module
  - Easy reconfiguration of backup folder through Admin interface
  - Enhanced backup export with folder path guidance
  - Improved backup restore with location hints

### 🔧 Enhancements
- **Admin Module**: Enhanced database backup management
  - Display of configured backup folder path
  - Clearer guidance for backup file locations during restore
  - Improved audit logging for backup operations
- **User Experience**: Better guidance throughout backup and restore processes
- **Storage Management**: Added utility functions for backup folder path management

### 📋 Technical Improvements
- Updated FirstTimeAdminSetup component with backup folder configuration
- Enhanced storage utilities with backup path management
- Improved AdminModule backup functionality
- Better user guidance and visual feedback
- Enhanced audit trail for backup operations

### 🎯 Benefits
- **Easier Data Recovery**: Users know exactly where backup files are stored
- **Better Organization**: Centralized backup file management in designated BACKUP folder
- **Improved Accessibility**: Better text contrast meets WCAG accessibility standards
- **Enhanced User Experience**: Clear guidance throughout setup and backup processes

---

## Version 1.0.4 (Previous)
- Initial stable release
- Core POS functionality
- User management system
- Inventory management
- Sales tracking and reporting
- Thermal printer integration
- Theme customization