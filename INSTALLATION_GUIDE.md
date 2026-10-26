# Rabiu Entreprises v2.0.6 — Installation and Upgrade Guide

Rabiu Entreprises is a Windows desktop POS and inventory application. **v2.0.6 has no license activation step** — there is no `.lic` file, no activation password, and no internet check. After installation, a fresh shop creates its admin account; an existing shop goes straight to login.

## Requirements

- Windows 10 or Windows 11, 64-bit (Windows 7 is not supported by this build).
- Microsoft Edge WebView2 Runtime. The installer normally includes or installs it; the offline installer is also in `hardware-drivers/`.
- An 80 mm or 58 mm ESC/POS thermal printer for printed receipts (optional for screen-only use).
- At least 500 MB free disk space. Business data is stored outside Program Files, so uninstalling/reinstalling the application does not delete sales, stock, customers or users.

## Fresh installation

1. Run **`Rabiu Entreprises_2.0.6_x64-setup.exe`**.
2. Accept the Windows prompt and choose **Install**. The installer is per-machine by default.
3. Launch **Rabiu Entreprises** from the Start menu or desktop shortcut.
4. On first launch, create the administrator account (username, password, recovery details). There is **no activation screen**.
5. Optionally set the backup folder, store currency, business name, logo and thermal printer in **Admin → Database / Hardware**.
6. Add products in **Inventory** and start selling at **POS**.

## Upgrading from v1.x or v2.0.x

Run the new installer directly over the existing installation. **Do not uninstall first** and do not change the installation folder — the data directory is keyed to the unchanged Tauri identifier `com.dronebug.dirms.desktop`.

On first launch after the upgrade:

- Existing users, products, categories, customers, sales, receipts, expenditures, audit logs and printer settings are preserved.
- You land on **Login**, not the setup wizard.
- A one-time safe migration groups legacy categories under **Products** and converts a legacy single price into a **maximum price**. Explicit price ranges (`min < max`, or a tier floor below its ceiling) are kept.
- Services and edibles that were explicitly recorded as such keep their kind. Items with no explicit kind are treated as Products.
- No live stock quantity is rewritten by the migration.

If the app finds an older JSON backup while the live database has no sales, it recovers data from the **first** backup that yields records. It does not merge every backup file, so stock counts cannot be multiplied or reduced by repeated recovery passes.

## Restoring a legacy backup

1. Open the login screen and use **Restore backup file**, or sign in as admin and open **Admin → Database & Backups**.
2. Select the old `*backup*.json` file.
3. The file is validated (including numeric stock quantities), normalized and merged. Existing products are matched by **ID and barcode**; live stock is never overwritten.
4. Legacy items become Products, legacy categories become Product categories, and old single prices become maximums. Categories named `Services` or `Edibles` are renamed with a `(Legacy)` suffix so they cannot be mistaken for uncounted kinds.
5. Check **Inventory** after restoring and correct any stock counts you know changed while the old backup was in use.

## Selling a depleted product

When a scanned or selected product has no stock:

- Users with **Inventory** or **Admin** access see a popup with **Add Stock** and **Sell Anyway**.
- **Add Stock** records the delivery and then adds the requested quantity to the bill. If the count was negative, it resets to the quantity received (`-3 + 5 = 5`).
- **Sell Anyway** puts the item on the bill and lets stock go negative. Inventory shows a red **OWED** badge until it is restocked.
- Other roles see a message to ask an inventory manager.

## Receipts and statements

- Choose 58 mm or 80 mm paper in **Admin → Hardware**, select the Windows printer name, and use **Print Test**.
- Receipts and financial statements show the shop's business identity from Hardware Config, plus the small DroneBug Technologies developer credit.
- The app prints raw ESC/POS to the Windows queue; browser print fallback is used only in the web development preview.

## Troubleshooting

- **Installer blocked by SmartScreen** — choose *More info → Run anyway* after verifying the file came from DroneBug Technologies.
- **Blank window** — install/repair the WebView2 Runtime from `hardware-drivers/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`, then relaunch.
- **Printer prints garbage or cuts early** — confirm the correct Windows printer and 58 mm/80 mm width; use a certified XP-80C/XP-58 driver from `hardware-drivers/`.
- **Data looks empty after an update** — do not reinstall or reset. Exit the app, relaunch once (startup sibling-database merge runs), then use **Restore backup file** with the most recent JSON backup. Check `pos-debug.log` in the database folder for the recovery steps.
- **Clock warning / FLASHALERT** — normal shutdowns and long closings are no longer treated as tampering; forward time simply advances the trusted anchor. A real **backward** clock move raises a persistent FLASHALERT. Non-admin staff can still sign in and sell, and their sales are tagged for review. An ADMIN login (or **Verify with ADMIN password** on the FLASHALERT) clears the alert and re-anchors the clock. Correcting the Windows date/time first is good practice, but it does not silently clear the alert: the FLASHALERT stays until an ADMIN verifies, so the evidence cannot be erased by simply fixing the clock.
- **Uninstall** — Windows *Apps & features → Rabiu Entreprises → Uninstall*. This removes the application only; the business database remains in the app-data folder for a later reinstall.

## Distribution contents

`Rabiu Entreprises_2.0.6_x64-setup.exe` plus the optional `hardware-drivers/` folder (printer drivers, WebView2 runtime, USB-serial drivers). **No license key file is required or distributed with v2.0.6.**
