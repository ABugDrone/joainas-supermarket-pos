# 🛒 Joainas Supermarket & Coldstore - POS System

A modern, full-featured **Point of Sale (POS) and Inventory Management System** built specifically for supermarkets and coldstores. This desktop application combines the power of **React**, **TypeScript**, and **Tauri** to deliver a fast, secure, and user-friendly business management solution.

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

## ✨ Features

### 🛍️ Point of Sale (POS)
- **Fast Barcode Scanning**: Quick product lookup and cart management
- **Multiple Price Types**: Retail and wholesale pricing support
- **Payment Methods**: Cash, POS/Transfer, Store Credit, Split Payment
- **Customer Management**: Account balances, loyalty points, advance payments
- **Real-time Inventory**: Automatic stock deduction on sales

### 📦 Inventory Management
- **Product Catalog**: Comprehensive product database with categories
- **Stock Tracking**: Real-time inventory levels and reorder alerts
- **Barcode System**: Generate and scan product barcodes
- **Multi-unit Support**: Track products by kg, pack, carton, bottle, piece, bag
- **Category Management**: Organize products with dynamic categories

### 👥 User Management & Security
- **Role-based Access**: System Admin, Store Manager, Cashier, Inventory Staff, Accountant
- **Secure Authentication**: Password-protected user accounts
- **Activity Audit Trail**: Complete logging of all user actions
- **Session Management**: Secure login/logout with user tracking

### 📊 Reports & Analytics
- **Sales Reports**: Daily, weekly, monthly revenue tracking
- **Customer Analytics**: Purchase history and loyalty point management  
- **Inventory Reports**: Stock levels, reorder alerts, product performance
- **Financial Statements**: Revenue, expenses, profit/loss tracking
- **Export Capabilities**: Data export for external analysis

### 🧾 Receipt & Printing
- **Thermal Printer Support**: 58mm and 80mm thermal receipt printers
- **Customizable Receipts**: Store branding, logos, custom messages
- **Print Settings**: Configurable paper width, density, auto-print options
- **Receipt Preview**: Screen preview before printing

### 🎨 Modern User Interface
- **6 Beautiful Themes**: Light and dark themes with professional color schemes
- **Responsive Design**: Works perfectly on different screen sizes
- **Accessibility**: WCAG compliant with excellent text contrast
- **Font Customization**: Multiple font families and sizes
- **Touch-friendly**: Optimized for touch screen POS terminals

### 💾 Data Management
- **Local SQLite Database**: Fast, reliable local data storage
- **Backup & Restore**: Complete system backup with guided folder setup
- **Data Import/Export**: JSON-based data migration
- **Automatic Backups**: Scheduled backup reminders

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **Git**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ABugDrone/Small-Business-Sales-and-Inventory-system-Desktop-APP.git
   cd Small-Business-Sales-and-Inventory-system-Desktop-APP
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run development server**
   ```bash
   npm run tauri:dev
   ```

4. **Build for production**
   ```bash
   npm run tauri:build
   ```

### First Time Setup
1. Launch the application
2. Complete the **two-step admin setup**:
   - Create your admin account
   - Configure backup folder location
3. Start managing your business!

## 🏗️ Technology Stack

### Frontend
- **React 19** - Modern UI framework
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful icon library
- **Vite** - Fast build tool

### Backend & Desktop
- **Tauri** - Secure desktop application framework
- **Rust** - High-performance backend
- **SQLite** - Embedded database
- **SQL Plugin** - Database integration

### Build & Development
- **Vitest** - Testing framework
- **ESLint** - Code linting
- **TypeScript** - Static type checking

## 📁 Project Structure

```
├── src/
│   ├── components/          # React components
│   │   ├── POSModule.tsx   # Point of sale interface
│   │   ├── InventoryModule.tsx
│   │   ├── AdminModule.tsx
│   │   └── ...
│   ├── utils/              # Utility functions
│   │   ├── storage.ts      # Data management
│   │   ├── theme.ts        # Theme system
│   │   └── db.ts          # Database operations
│   ├── types.ts           # TypeScript definitions
│   └── data/              # Initial data
├── src-tauri/             # Tauri backend
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── public/               # Static assets
└── dist/                 # Build output
```

## 🎯 Use Cases

### Perfect For:
- **Supermarkets & Grocery Stores**
- **Coldstores & Frozen Food Retailers**  
- **Convenience Stores**
- **Small to Medium Retail Businesses**
- **Wholesale Distribution Centers**

### Key Benefits:
- **Offline-First**: Works without internet connection
- **Fast Performance**: Native desktop application speed
- **Secure**: Local data storage, no cloud dependency
- **Customizable**: Adaptable to different business needs
- **Professional**: Enterprise-grade features at small business scale

## 📈 What's New in v1.2.0

### 🎨 Fixed Issues
- **Light Theme Readability**: Resolved text contrast issues in all light themes
- **Backup Setup**: Added guided backup folder configuration during setup

### 🆕 New Features
- **Two-Step Setup**: Enhanced first-time setup with backup configuration
- **Backup Management**: Visual backup folder management in admin panel
- **Better Accessibility**: WCAG AA compliant text contrast ratios

### 🔧 Improvements
- Enhanced user experience with better visual feedback
- Improved backup and restore workflow
- Professional polish across all interface themes

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏢 About

**Developed by**: Dronebug Technologies & Services  
**For**: Joainas Supermarket & Coldstore  
**Purpose**: Modern retail management solution

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ABugDrone/Small-Business-Sales-and-Inventory-system-Desktop-APP/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ABugDrone/Small-Business-Sales-and-Inventory-system-Desktop-APP/discussions)
- **Email**: dronebugtechnologies@gmail.com

## 🌟 Show Your Support

If this project helps your business, please consider giving it a ⭐ on GitHub!

---

**Built with ❤️ for small business success**