# 🏛️ TAURI WINDOWS DESKTOP BUILD CONSTITUTION & BUNDLING GUIDE
**Application:** Joainas Supermarket & Coldstore POS System  
**Primary Target Platform:** Windows 10 / Windows 11 Desktop (`.exe` NSIS Installer & `.msi` Package)  
**Architecture:** React 18 (Vite) + Tauri v2 Windows Engine + Embedded SQLite3 (WAL Mode) + Go/Rust Backend  

---

## 📌 1. EXECUTIVE OVERVIEW & WINDOWS ARCHITECTURE

This document serves as the absolute constitution and implementation guide for building, bundling, and branding the **Joainas Supermarket & Coldstore POS Windows Desktop Application** using **Tauri v2**.

### Core Windows Architecture
- **Frontend Layer**: React 18 + Vite + TypeScript + Tailwind CSS (Offline Single Page App).
- **Windows Desktop Runtime**: Tauri v2 Framework leveraging Microsoft WebView2 runtime, native Windows OS windowing, taskbar notifications, system tray, and local hardware printing access.
- **Windows Storage Layer**: Embedded **SQLite 3** database stored in Windows `%APPDATA%\com.joainas.pos.desktop\joainas_pos.db` with Write-Ahead Logging (`WAL`) mode enabled. Schema defined in `src/db/sqlite_schema.sql` and `src/db/go_backend_schema.go`.
- **Windows Printing Subsystem**: Direct ESC/POS thermal receipt printing over USB (`USB001`/`USB002`), Serial/COM (`COM1`/`COM2`/`COM3`), or Windows Spooler / Network Printers via Tauri Native I/O.
- **Top Header Session Controls**: Features a prominent **LOG OUT** button in the top right header bar alongside **Switch User** and **Themes & Display** controls.

---

## 🎨 2. CUSTOM WINDOWS DESKTOP BRANDING & APP ICON GUIDE

To ensure the desktop app displays your custom **Joainas Supermarket & Coldstore** logo on the Windows Taskbar, Start Menu, Desktop Shortcuts, Control Panel Add/Remove Programs, and NSIS Installer Wizard (replacing the default Tauri icon):

### Step 2.1: Prepare Your Master Logo
1. Prepare a high-resolution square PNG logo of the store (e.g. `logo.png`, minimum **1024x1024 pixels**, transparent background recommended).
2. Place your master logo in the root or public folder: `/src-tauri/icons/master-logo.png`.

### Step 2.2: Auto-Generate Windows `.ico` and Tile Assets
Run the official Tauri CLI icon generator command in your terminal:

```bash
# Generate Windows icon (.ico) and start menu tiles automatically
npx tauri icon ./src-tauri/icons/master-logo.png
```

This automatically generates all required Windows desktop assets inside `src-tauri/icons/`:
- `icon.ico` - **Windows File Explorer, Taskbar, and Executable Header Icon**
- `Square30x30Logo.png` - Windows Start Menu Small Tile
- `Square44x44Logo.png` - Windows Taskbar App Icon
- `Square150x150Logo.png` - Windows Start Menu Medium Tile
- `Square310x310Logo.png` - Windows Start Menu Large Tile
- `32x32.png` - Windows Notification Tray / System Tray Icon

---

## 📁 3. TAURI WINDOWS PROJECT DIRECTORY STRUCTURE

Ensure your project tree matches the following structure before initiating the desktop bundle build:

```
joainas-pos/
├── src/                          # Frontend React Source Code
│   ├── components/               # POS, Inventory, Sales, Admin, Thermal Receipt Modals
│   │   ├── DesktopShell.tsx      # Top Application Header with LOG OUT button
│   │   └── ...
│   ├── db/                       # Database Schemas
│   │   ├── sqlite_schema.sql     # SQLite 3 DDL Schema (WAL Mode)
│   │   └── go_backend_schema.go  # Go struct bindings for Tauri backend
│   ├── data/                     # Initial seed data
│   ├── utils/                    # Storage and printer utilities
│   ├── App.tsx                   # Main React Entry Component
│   └── index.css                 # Tailwind CSS & Print Media styles
│
├── src-tauri/                    # Native Desktop Engine Folder
│   ├── icons/                    # App Logo Assets (Windows ICO & PNGs)
│   │   ├── master-logo.png       # Your Custom Joainas Store Logo
│   │   ├── icon.ico              # Windows App Icon
│   │   ├── Square150x150Logo.png # Windows Start Menu Tile
│   │   └── ...
│   ├── src/                      # Rust / Go Entrypoint
│   │   ├── main.rs               # Tauri Windows Entrypoint
│   │   └── lib.rs                # Native commands (SQLite DB, Windows Printer I/O)
│   ├── tauri.conf.json           # Windows Desktop Configuration Blueprint
│   └── Cargo.toml                # Rust Dependencies & Tauri Plugins
│
├── TAURI_BUILD_CONSTITUTION.md  # Windows Desktop Build Constitution & Guide
├── package.json                  # Frontend Dependencies & Build Scripts
└── vite.config.ts                # Vite Configuration
```

---

## ⚙️ 4. WINDOWS TAURI CONFIGURATION BLUEPRINT (`src-tauri/tauri.conf.json`)

Use this `tauri.conf.json` template optimized for Windows 10 & Windows 11 builds:

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-config-schema/schema.json",
  "productName": "Joainas POS",
  "version": "1.0.0",
  "identifier": "com.joainas.pos.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Joainas Supermarket & Coldstore - Point of Sale",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false,
        "maximized": true,
        "center": true,
        "decorations": true,
        "icon": "icons/icon.ico"
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset: blob:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ],
    "publisher": "Dronebug Technologies & Services",
    "copyright": "Copyright © 2026 Joainas Supermarket & Coldstore. All Rights Reserved.",
    "category": "Business",
    "shortDescription": "Point of Sale & Inventory Management System for Supermarket and Coldstore Operations",
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "nsis": {
        "displayLanguageSelector": false,
        "installerIcon": "icons/icon.ico",
        "headerImage": "icons/128x128.png",
        "sidebarImage": "icons/128x128.png",
        "installMode": "perMachine"
      },
      "wix": {
        "language": "en-US"
      }
    }
  },
  "plugins": {
    "sql": {
      "preload": ["sqlite:joainas_pos.db"]
    }
  }
}
```

---

## 🗄️ 5. INTERNAL SQLITE DATABASE SETUP ON WINDOWS

The embedded SQLite database runs entirely offline on Windows:

### Step 5.1: Database File Location on Windows
On Windows OS, the SQLite database is automatically generated at:
`C:\Users\<WindowsUser>\AppData\Roaming\com.joainas.pos.desktop\joainas_pos.db`

### Step 5.2: Initialize Database on Windows Startup (`src-tauri/src/main.rs`)
```rust
use tauri_plugin_sql::{Builder, Migration, MigrationType};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_joainas_pos_tables",
            sql: include_str!("../../src/db/sqlite_schema.sql"),
            kind: MigrationType::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations("sqlite:joainas_pos.db", migrations)
                .build()
        )
        .run(tauri::generate_context!())
        .expect("error while running Joainas POS Windows application");
}
```

---

## 🖨️ 6. WINDOWS THERMAL PRINTER HARDWARE INTEGRATION

The application supports **Continuous Roller Paper Printing (80mm & 58mm)**:

1. **Windows System Printing**: Uses Windows Spooler print commands (`window.print()`) styled by `@media print` rules in `src/index.css`.
2. **ESC/POS USB & COM Serial Direct Feed**: Can be connected via Tauri Rust/Go sidecar plugins (`tauri-plugin-serialport`) to write raw ESC/POS bytes directly to Windows COM ports (`COM1`, `COM2`, `COM3`) or USB printer devices.

---

## 🚀 7. STEP-BY-STEP WINDOWS BUILDING & BUNDLING COMMANDS

### Prerequisites for Windows OS
- Install **Node.js 18+** for Windows
- Install **Rust for Windows** (`x86_64-pc-windows-msvc`)
- Install **Visual Studio C++ Build Tools** (Select "Desktop development with C++")
- Microsoft WebView2 Runtime (Preinstalled on Windows 10/11)

### Command Execution Sequence

```bash
# 1. Install dependencies
npm install

# 2. Add Tauri CLI
npm install -D @tauri-apps/cli@next

# 3. Generate custom logo icons for Windows Taskbar & Start Menu
npx tauri icon ./src-tauri/icons/master-logo.png

# 4. Run desktop app in local Windows development mode
npm run tauri dev

# 5. Build production Windows standalone installers (.exe & .msi)
npm run tauri build
```

### Output Installer Artifacts
After running `npm run tauri build` on Windows, your standalone desktop installers will be saved in:
- **Windows NSIS Setup Installer**: `src-tauri/target/release/bundle/nsis/Joainas POS_1.0.0_x64-setup.exe`
- **Windows MSI Installer**: `src-tauri/target/release/bundle/msi/Joainas POS_1.0.0_x64_en-US.msi`

---

## ✅ 8. VERIFICATION CHECKLIST FOR WINDOWS OS BUILDERS

- [x] Prominent **LOG OUT** button implemented at top right application header (`DesktopShell.tsx`)
- [x] Custom store logo placed in `./src-tauri/icons/master-logo.png`
- [x] `npx tauri icon` command executed to create Windows `.ico` and Start Menu tiles
- [x] SQLite schema `sqlite_schema.sql` configured for Windows `%APPDATA%` local storage
- [x] Continuous roll thermal receipt `@media print` rules configured in `index.css`
- [x] Windows NSIS setup (`.exe`) and `.msi` target configurations active in `tauri.conf.json`

---
*Maintained by Dronebug Technologies & Services for Joainas Supermarket & Coldstore POS System.*
