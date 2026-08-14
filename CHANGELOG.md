# Joainas Mart POS System - Changelog

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