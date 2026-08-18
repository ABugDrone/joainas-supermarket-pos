# Joainas Mart POS System - Changelog

## Version 1.3.4 (2026-08-18)

### 🖨️ Bigger, Bolder Receipts + PDF Printing via Default Viewer
- **Bolder & Bigger Receipt Text**: Receipt fonts are larger and heavier than before — 14px base body (up from 13px), bigger store name (`text-2xl`), larger TOTAL line (`text-xl`), thicker black divider rules, and heavier weights throughout so text is clearly readable on thermal paper and printed PDFs.
- **Thermal-Sized PDF Export**: Saved receipts are built at the exact paper width (80mm or 58mm) × natural receipt height instead of A4 — this is what makes PDF readers center the receipt and waste paper below the top edge.
- **Auto-Open PDF in Default Viewer**: After saving a receipt as PDF, the desktop app automatically opens it in the OS default PDF viewer (e.g. Foxit Reader), so the cashier can print to the 80mm device immediately without hunting for the file.
- **Native ESC/POS Direct Printing**: The desktop app prints receipts by sending raw ESC/POS commands straight to the Windows printer queue — no browser print dialog, no A4 page, no wasted paper. Receipts start at the very top of the 58mm/80mm roll.
- **Printer Name + Detect Printers**: Hardware Config now has a "Printer Name" field and a "Detect Printers" button that lists installed Windows printers and auto-selects the thermal one.
- **Print Density Control**: "High" density sends the printer's own `GS ( K` density command for darker, bolder output matching the Xprinter driver test print.
- **Web Preview Notice**: Hardware Config shows a clear notice in web mode that the browser cannot connect to the printer — install the desktop app to detect and print.

### 🔧 Technical Improvements
- Native `print_raw` and `list_printers` Tauri commands in the Rust backend (`Win32::Graphics::Printing` spooler API, RAW datatype).
- `src/utils/escpos.ts` ESC/POS builder; `printer_name` column added to `printer_configs` (schema + migration v5).
- Receipt Print button shows spinner + success/error toasts.
- Version bumped to 1.3.4 across package.json, Cargo.toml, and tauri.conf.json.

---

## Version 1.3.3 (2026-08-18)

### 🖨️ Native Thermal Printing (No Print Dialog)
- **Direct ESC/POS Printing**: The desktop app now prints receipts by sending raw ESC/POS commands straight to the Windows printer queue — **no browser print dialog, no A4 page, no wasted paper**. The receipt always starts at the very top edge of the 58mm/80mm roll.
- **Printer Name Config**: Hardware Config now has a "Printer Name" field plus a "Detect Printers" button that lists the installed Windows printers and auto-selects the thermal one.
- **Print Density Control**: The ESC/POS stream now sends the printer's own density command (`GS ( K`, fn=49) so "High" gives darker, bolder output that matches the Xprinter's driver test print.
- **Robust Receipt Layout**: Store name prints double-height, the TOTAL line is doubled and bold, all amounts bold — readable on thermal paper. Included the logo space via double-height store header at the very top.
- **Browser Dev Fallback**: In localhost (no Tauri runtime) printing still falls back to `window.print()` so the receipt modal preview can be tested.
- **Receipt Modal Polish**: Print button shows a spinner and toast feedback; a clear error toast appears if the printer name is wrong or the printer is offline.

### 🔧 Technical Improvements
- Native `print_raw` and `list_printers` Tauri commands added in the Rust backend (`Win32::Graphics::Printing` spooler API, RAW datatype).
- New `src/utils/escpos.ts` builder converts any sale into an exact ESC/POS byte stream (init, density, alignment, bold, double-height, partial cut).
- Added `printer_name` column to `printer_configs` (schema + migration v5).
- Version bumped to 1.3.3 across package.json, Cargo.toml, and tauri.conf.json.

### 🖨️ PDF Export for Thermal Printing
- **Thermal-Sized PDFs**: Saved receipts are now built at the exact paper width (80mm or 58mm) × natural receipt height — the old A4-sized PDF was what made readers center the receipt and waste paper.
- **Auto-Open in PDF Viewer**: After saving a receipt as PDF, the desktop app automatically opens it in the OS default PDF viewer (e.g. Foxit Reader) so the cashier can print to the 80mm device without hunting for the file.
- **Bigger, Bolder Receipt**: All receipt text is larger and heavier (14px base, thicker dividers, black 2px rules, bigger store name and TOTAL) so it is clearly readable on thermal paper and in printed PDFs.

---

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