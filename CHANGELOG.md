# Joainas Mart POS System - Changelog

## Version 1.4.0 (2026-08-22)

### 🔒 Backup / Restore — Complete & Old-File Compatible
- **Categories now included** in export (`categories` added to `backupData` with `schemaVersion: 2`). Old `v1.3.8`/`v1.3.9` files without `categories` still import — legacy files keep existing categories as-is (best option, preserves custom colors) with toast "Legacy backup — categories kept."
- **BACKUP folder actually seeds dialogs** — `pickBackupSavePath`/`pickBackupFile` now pre-fill with `getBackupFolderPath()` so the native save/open dialogs start in the configured folder.
- **Browser fallback via Blob** — replaces `data:` URL+`encodeURIComponent` (2 MB limit) with `Blob`+`URL.createObjectURL` for reliable downloads on large DBs.
- **Durability race fixed** — browser `handleImportBackup` now `await flushWrites()` before reload (was `void flush... 1.2s` fire-and-forget); both paths validate `Array.isArray` for optional tables and abort before any `save*` on malformed file.

### 🐛 Persistence — Chunked NOT IN Wipe Fixed
- `deleteIdsNotIn` used chunked `NOT IN (40 ids)` — 800 rows split into 20 chunks wiped 760 rows after first chunk. Fixed to single `DELETE WHERE id NOT IN (SELECT value FROM json_each(?))` via `JSON.stringify(keepIds)`. Added `PRAGMA busy_timeout=5000` at `openDb`.

### 🔐 Auth Hardening
- **Empty-hash bypass closed** — `LoginModal` no longer `passwordOk=true` on empty `password_hash`; blank hash now rejects (guide updated to delete user not blank).
- **Last active admin cannot be suspended** — `AdminModule:handleToggleUserStatus` blocks suspending the sole active `admin` cap holder or self-suspend when last.
- **Session password stripped** — `setActiveUserStorage` now stores `{...user without password}` to `sessionStorage` (XSS exposure).

### 🛒 Frontend Robustness
- **Sale race** — `App.handleCompleteSale` + `handleAddProduct/Update` now use functional `setState(prev=>)` to avoid stale closures on rapid checkout.
- **POS oversell** — stock cap checks moved inside `setCart(prev=>)` (burst scanner + tap no longer bypasses).
- **Category resync** — `InventoryModule`/`AdminModule` `useEffect` syncs `categoriesProp` → local state; `ThermalPrinterSettings` syncs `config` → `formData`.
- **Dates** — `todayStr` and sale `date` now `toLocaleDateString('en-CA')` (local, not UTC) fixing WAT off-by-one.
- **Setup gate** — `App: isStorageInitialized()` added to prevent flashing setup before `initStorage` completes.
- **Cost Price optional** — label "(optional)" and no `required` (kept from 1.3.9).

### 🔧 Build Reproducibility
- `src-tauri/Cargo.lock` now committed (removed from `.gitignore`) for deterministic Rust builds.

---

## Version 1.3.9 (2026-08-22)

### 🔒 Inventory Persistence — Vanishing Stock Fixed
- **Root cause**: every `dbSave*` used `DELETE FROM table` then re-inserted rows one-by-one over slow per-row IPC. Closing the window mid-save left tables empty/partial — ADMIN's "inventory vanished after restart" matches this window exactly, and the same bug could have reached customers/sales if the app was closed at the wrong instant.
- **Fix**: saves now **upsert first, prune stale rows last** via chunked `INSERT ... ON CONFLICT DO UPDATE` + `DELETE ... NOT IN (...)`. The table is valid at every instant; an interruption can only leave a few stale rows (cleaned on the next save), never an empty catalog. Chunked multi-value inserts also cut IPC round-trips dramatically.
- **Close-flush**: Tauri's `onCloseRequested` now intercepts the window X, awaits `flushWrites()` (up to 15 s), then closes — plus a `pagehide`/`beforeunload` best-effort fallback — so queued writes are never killed by a fast close. Applies to all tables including the most recent product adds.
- **Empty-write guard**: `saveProducts/Customers/Sales/Expenditures/Categories` refuse to persist an **empty array over a populated cache** (transient load failures would otherwise let the next save silently wipe dozens of rows). Intentional full clears go through the guarded factory reset and bypass the guard.

### 🧹 Admin Reset — Accidental Wipes Removed
- The one-click **Reset Inventory** and **Reset Sales & Reports** buttons were removed from **Admin → SQLite DB & Backups**. Once products/sales are added they now stay until explicitly deleted item-by-item or via the **guarded Full System Reset** (requires typing `RESET`). Their `resetSalesAndReports` / `resetInventoryAndProducts` storage helpers were removed.

### 🖥️ Desktop Hardening — No More Accidental Logouts
- A new `useDisableBrowserInterference` hook mounted at the app root now:
  - Suppresses the **right-click context menu** everywhere (on WebView2 it exposes "Reload"/"Inspect").
  - Swallows **F5 / Ctrl+R / Ctrl+Shift+R** so a stray refresh never wipes the per-process login session ("Refresh automatically log out current user" is gone).

### 🧾 Receipt Header — Truly Centered
- **ESC/POS (thermal)**: header + footer lines are now centered via the printer's native `ESC a 1` alignment alone — manual space-padding (`centerLine()`) was removed because it double-shifted on firmware that honors `ESC a` and left headers visibly left-of-centre on firmware that doesn't. Matches the on-screen `text-center` preview.
- **Print CSS (`window.print` / PDF-on-A4)**: `#printable-thermal-receipt` now uses `left:0; right:0; margin: auto` so the 76 mm/54 mm receipt is **horizontally centered on the page** instead of pinned to the LHS (`left:0` on an A4 sheet put the header at the page's left edge).

### ⌨️ Number Inputs — No More Sticky "0"
- New shared `NumberInput` component (`src/components/NumberInput.tsx`, `type="text" inputMode="decimal"`): empty display when the logical value is 0, so clearing leaves a blank field and typing just works; decimals like "10." are preserved while focused; content is auto-selected on focus. Replaces every `type="number"` with `Number(e.target.value)||0`:
  - **Inventory**: Cost Price, Retail Price, Stock Qty, Reorder Level
  - **POS**: Cash Paid / Transfer Paid (split payment)
  - **Customers**: Receive Payment amount
  - **Expenses**: Amount

---

## Version 1.3.8 (2026-08-21)

### 🧹 Privacy — Developer Phone Removed
- **+2347035716349** removed from all UI, receipts, ESC/POS footer, printer config defaults, financial statements, and setup placeholders. Store address/phone is now entered by the store; the footer now reads **“Software by Dronebug Tech”**.

### 🛒 Sell Service — Products Hidden by Default
- Product grid is now **hidden by default** (reduces clutter, scanner/search-first workflow). A **Show Products / Hide Products** toggle remains next to the “TAP ANY ITEM TO ADD TO BILL” header; the **{products.length} Items** badge stays visible. When **search is active** (or scanner finds a match) the filtered grid shows even while hidden.

### 💳 Payments — Transfer vs POS vs Cash+Transfer Split
- **POS Transfer** split into two distinct methods: **📱 Transfer (USSD / mobile app)** and **💳 POS / Card (bank licensed POS device)**. Both are standalone.
- New **💵+📱 Cash + Transfer** method: adds manual **Cash Paid** and **Transfer Paid** inputs, a **mini report** (Total / Paid / Balance or Change / Overpay), and an optional **Payment Note** (e.g. “Over-transfer N2,000 given as cash change. Instead of auto-calculating, both amounts are entered manually”). The note and split amounts are stored per sale (`cashAmount`, `transferAmount`, `paymentNote`) and appear on the receipt (HTML + ESC/POS) as `Cash:` / `Transfer:` / `Note:` lines. `Balance Due` can now be negative to show **Change** when over-paid.

### 🎁 Rewards Removed
- **All loyalty/reward points removed** — no longer applicable. Removed points column from **Customers** left/right tables, points badge from HTML receipt and `Loyalty Points:` line from ESC/POS/text copy, `Point Rate` from Hardware Config, and customer points from header/ledger. Initial demo customers and sales now have `points: 0` / `pointsEarned: 0`. DB columns (`points`, `points_earned`, `point_rate`) remain for backward compatibility but are no longer read/written in the UI. `StockQty` only drives balances.

### 🧭 Sidebar — Today’s Sales Card Removed
- The **Today’s Sales** gradient card near the theme button in the left sidebar has been removed (per request). The underlying `todaySalesTotal` calculation remains for reports but is no longer shown in the nav.

### 🧾 Save Only vs Print & Save
- **POS checkout** now offers two explicit actions: **💾 Save Only (No Print)** — records the sale (default, no print modal), with a hint that PDF/PNG can be exported later from **Sales → Reprint**; and **Print & Save** — saves and opens the thermal receipt for immediate printing. **Cart Preview** mirrors this with **Save Only** + **Print & Save** buttons. All saves are durable before UI refresh.

### 🔒 Caps Lock Indicator
- Every password field now reflects Caps Lock state: **Login**, **First-Time Setup (Password/Confirm)**, **Admin Recovery (new/confirm)**, **Admin → Add Staff**, and **Security Vault unlock** show a gold **“Caps Lock ON”** badge, amber border, and helper text when `getModifierState('CapsLock')` is true — preventing wrong-password errors.

### 🖨️ Xprinter RHS Clipping — Subtotals Fully Contained
- **Root cause**: 80 mm HTML receipt at `80mm` + `3mm` side padding + `overflow:hidden` exceeded the Xprinter’s hardware printable area (~76 mm), so the rightmost digits of `RATE`/`AMT` (e.g. `25,000` → `25,00`) and the `TOTAL` line were clipped (see photo). Table used fluid width with no fixed layout, so long names pushed amounts off-page.
- **Fix**: Print now uses **76 mm printable width centred on 80 mm page** (54 mm on 58 mm), `box-sizing:border-box`, `overflow:visible`, `table-layout:fixed` with **10%/48%/21%/21%** columns, `word-break: break-word` for Item and `white-space: nowrap` for Rate/Amt, and a slightly narrower ESC/POS character width (**45** for 80 mm / **30** for 58 mm) to leave hardware margins. Screen preview updated to `w-[76mm]`/`w-[54mm]` with matching `2mm` padding and `11.5px`/`10.5px` print font so WYSIWYG matches paper.

---

## Version 1.3.7 (2026-08-21)

### 🖨️ Print Fix — Exact Thermal Paper Fit

- **80mm overflow fixed**: The receipt preview and print CSS now use real `mm` sizing (`80mm` page with `3mm` side padding → `74mm` content; `box-sizing: border-box`). The previous `330px` (≈86.8 mm) preview exceeded the 80 mm roll and caused the right edge to clip; now both screen preview (`w-[73mm]`) and the `@page thermal-receipt-80` named page match the roll exactly with no overflow.
- **58mm 75 %-strip fixed**: `58mm` now renders as a true `58mm` page with tighter `2 mm` side padding (`54 mm` content, `w-[53mm]` preview). The prior `240px` (≈63 mm) + centered `@page` left a large white strip on the right when the browser fell back to A4; the new `min-width: 58mm` + `page: thermal-receipt-58` forces edge-to-edge fill.
- **Font tuned per roll**: 80 mm uses `12.5px`, 58 mm uses `11.5px` so narrow rolls stay readable without wrapping. Both share the same monospace metrics, so PNG/PDF exports (via `html-to-image` + `jsPDF` at `param paperW`) remain crisp at native width.

### 🔐 New: ADMIN Password Recovery Vault (5 Uncomfortable Questions)

- **5 private questions** are set in **Step 3 of 3** of First-Time Setup (and later in **Admin → Security & Recovery**). They are deliberately uncomfortable / non-obvious PII so a colleague cannot guess:
  1. Full name of your first childhood crush; 2. Exact date you first met your current partner/lover; 3. Secret family nickname only your mother uses; 4. Deeply embarrassing teenage memory you hid from work; 5. Private fear/insecurity never shared at work.
- **Trigger**: The recovery UI is **invisible until the ADMIN account fails 5 times** on the Sign In screen. A gold banner then appears with **Recover ADMIN Password** — it asks **one random** of the 5 questions. The answer is checked locally (bcrypt, case-insensitive).
- **30-second reveal**: On correct answer the **actual ADMIN password is shown in plain text for 30 seconds** with a countdown (copy button included) and auto-hides. An alternative **Set New Password** form lets the admin create a new one immediately (bcrypt-hashed, vault re-encrypted, audit logged).
- **Vault storage**: 5 answers are bcrypt-hashed and the plain password is obfuscated (`XOR + base64` with a local key) in `localStorage` + SQLite `app_settings` (`admin_recovery` / `joainas_admin_recovery_v1`). No code path ever exposes the password without a correct answer.
- **Admin management**: **Admin → Security & Recovery** shows vault status, lets the ADMIN re-save all 5 answers after confirming the current plain password, and documents the developer path for older installs.

### 🛠️ Developer Retrieval (Older Installs Without a Vault) — Q&A

> **Q: As a developer, how do I retrieve it without the 5-attempt process assuming an older version is installed?**
>
> **A – In-app (≥v1.3.7):** On the Sign In screen press **Ctrl + Shift + Alt + D**, enter master code **`JOAINAS-DEV-2026-DRONEBUG`** in the dev section of the recovery modal — if a vault exists the plain password is revealed without a question.
>
> **A – Direct file/DB (any version, including v1.3.6 with no vault):**
> 1. Find the live DB path via **Admin → SQLite DB & Backups** or `%APPDATA%\com.joainas.pos.desktop\db_path.txt`.
> 2. Open `joainas_pos.db` with DB Browser / `sqlite3`:
>    ```sql
>    SELECT value FROM app_settings WHERE key='admin_recovery';
>    SELECT id, username, role, password_hash FROM users WHERE username='admin';
>    UPDATE users SET password_hash='' WHERE username='admin'; -- then sign in with any password and set a real one via recovery
>    ```
> 3. In browser dev mode the vault is `localStorage.getItem('joainas_admin_recovery_v1')` (encryptedPassword is deobfuscated with the same utility). See **`RECOVERY_GUIDE.md`** in the install folder for the full walkthrough.

### 🔧 Technical Improvements

- Version bumped to 1.3.7 across package.json, Cargo.toml, Cargo.lock, tauri.conf.json, Admin backup export and footer.
- New modules: `src/utils/recovery.ts` (vault + obfuscation), `src/components/AdminRecoveryModal.tsx` (30 s reveal + reset), `RECOVERY_GUIDE.md`.

---

## Version 1.3.6 (2026-08-19)

### 🔐 Fixed: App No Longer Reverts to Full System Setup After Closing
- **Root cause fixed**: The database schema was bootstrapped through sqlx migrations, and an older release edited the schema file *after* it had already been applied. This broke the migration checksum/dirty-state checks — on existing databases it threw a migration mismatch, and on **fresh installs** migration v3 tried to re-add a column that the updated schema already created, failing silently and leaving the app unable to persist the "admin setup done" flag. Result: closing and reopening the app bounced straight back into the first-time setup wizard.
- **New behavior**: The schema is now bootstrapped idempotently from the frontend on every database connection (`bootstrapSchema`). Tables, indexes and missing columns are created/repaired safely without ever deleting data, so old databases upgrade cleanly and fresh installs work immediately. No sqlx migration chain is registered any more.
- **Extra safety**: The "admin setup completed" flag is now also mirrored to localStorage, so even an interrupted DB write can never push the user back into the setup wizard — the app always lands on the **login gate** after restart.

### 🔐 Fixed: "User admin not found" During Login After First-Time Setup
- **Root cause**: `saveUsers()` updated the in-memory cache instantly but wrote to SQLite through an asynchronous, un-awaited queue. The setup wizard then switched straight to the login screen — if the app was closed right after setup, that queued write could be lost while the localStorage setup flag survived. The next launch correctly skipped setup but hit an **empty users table** → "User admin not found". This is also the broken state left behind by older builds (flag set, users never saved).
- **Fix 1 — durable setup**: The wizard now **flushes all queued SQLite writes** before leaving setup, so the admin account, setup flag and audit entry are guaranteed on disk before the login screen appears. Closing the app after setup can never lose the account again.
- **Fix 2 — recovery gate**: The app now treats "setup flagged as done but **zero user accounts exist**" as not-yet-configured and shows the setup wizard again. A database broken by an older build now recovers to the setup screen (where the admin is created and durably saved) instead of a dead-end login screen with no accounts.
- **Fix 3 — restore safety**: Importing a backup that contains user accounts now flushes writes to disk before the app reloads, so a restore can never restart into a no-users state.
- The required flow is preserved exactly: first install → license → configure system → then **login every time** after logout or closing the app. It never re-configures after a successful first setup.

### 🔄 Fixed: Admin Reset No Longer Undoes Itself After Refresh / Re-login
- **Root cause**: The reset buttons updated the in-memory cache immediately (so the UI looked cleared) but the SQLite writes were queued asynchronously and never awaited. If the page was refreshed or the user logged out/reopened the app before the writes finished — or if the parallel `Promise.all` writes tripped SQLite's write-lock ("database is locked") — the old rows were still on disk and came straight back.
- **Fix 1 — awaited, sequential writes**: `resetSalesAndReports`, `resetInventoryAndProducts` and `resetAllSystemData` now return a promise that resolves only after every table has been written to disk sequentially (no more concurrent `Promise.all` that could hit the SQLite write-lock).
- **Fix 2 — flush before reload/logout**: All three reset handlers now `await` the reset, then flush the audit-log write, and only then refresh the UI / reload the app. Refreshing or re-logging-in after a reset now shows the genuinely-cleared data permanently.
- The audit trail still records each reset, and full reset returns to the login gate (users, printer config and setup flag are preserved).

### 🚫 Fixed: First-Time Setup No Longer Freezes When Entering the Dashboard
- **Root cause**: The transition out of the setup wizard awaited queued SQLite writes with no guard — a slow or stuck write could hang the UI at the exact moment the app was about to show the login/dashboard. Any unexpected render error after setup would also unmount the whole window into a blank, frozen screen.
- **Fix 1 — flush timeout**: The write-flush now races against a generous timeout, so a stuck database write can never freeze the app — it proceeds with the in-memory cache and the next launch recovers cleanly.
- **Fix 2 — error recovery**: The setup completion handler is wrapped so any failure shows a clear error toast instead of silently freezing, and the whole app tree is wrapped in an error boundary that displays a "Something went wrong — Reload App" screen if any screen crashes, instead of a frozen blank window.

### 🗑️ New: Admin Reset Data Panel (Backup & Restore)
- New "Reset System Data" section in **Admin → SQLite DB & Backups** (admin-only) for clearing dummy/test records before real use:
  - **Reset Sales & Reports** — deletes all sales/sale items and expenditures, resets all customer balances, points and advance payments to zero (keeps inventory & users).
  - **Reset Inventory** — deletes all products and stock adjustments (keeps sales, customers & users).
  - **Full System Reset** — wipes ALL business data (products, sales, customers, expenditures, audit logs) and restores default categories. User accounts, printer/hardware config and the login gate are kept, so the app returns to **login** (never back to setup). Requires typing `RESET` to confirm.
- Every reset is recorded in the audit trail and the whole UI (POS grid, sales, reports, today-total) refreshes immediately.

### 📷 Barcode Scanner Fixes & Tutorials
- **Global scanning anywhere in Sell Service**: previously a scan only worked if the search box happened to be focused. The POS now listens at the window level — a scan (digits + Enter) adds the item to the bill even if the cashier tapped a product tile or focus moved. Scans are decoded by physical key (`e.code`), so a different Windows keyboard layout on the target PC cannot mangle the digits.
- **Code normalization**: scanned codes are cleaned of stray prefix/suffix characters before matching product barcodes, so scanners with a custom suffix (or an alternate layout) still match.
- **Hardware Config → Barcode Generator**: the scanner guide now includes a **Live Scanner Test** box plus an 8-step troubleshooting checklist aimed at the "scanner beeps/flashes but nothing appears" case (focus the app window, test in Notepad, Device Manager → Keyboards, English-US layout, different USB port, factory-reset the scanner, reboot the PC). The hardware `INSTALLATION-GUIDE.txt` was updated with the same checklist.

### 🔧 Technical Improvements
- Version bumped to 1.3.6 across package.json, Cargo.toml, Cargo.lock, and tauri.conf.json.

---

## Version 1.3.5 (2026-08-18)

### 🖨️ Browser Print Fix — No More A4 Centering
- **Explicit Thermal Page Sizes**: The `@media print` rules now force the sheet to exactly `80mm auto` or `58mm auto` (zero margins). Previously `size: auto` let the browser fall back to A4 and center the receipt — the cause of wasted paper below the top edge when printing from a browser (e.g. via `window.print()`).
- **Width-Specific Named Pages**: Added `@page thermal-receipt-80` and `@page thermal-receipt-58`; the receipt element switches to the matching named page so the printed sheet is always exactly the thermal roll width, and the receipt starts at the top-left with zero margins (`position: absolute; left:0; top:0`).
- **Print Color Exact**: `-webkit-print-color-adjust: exact` keeps blacks and colored elements dark instead of being dropped to light grays.
- A4 financial statements are unaffected — they keep their own `financial-a4` named page.

---

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