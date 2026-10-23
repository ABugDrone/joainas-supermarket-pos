# Implementation Plan: Joainas Mart Update

## Overview

This plan covers rebranding the DIRMS StoreBox PRO desktop application to "Joainas Mart", removing the offline license system, implementing a depleted-stock sales popup, refining price display logic, fixing the backup recovery inventory corruption bug, and updating to version 2.0.5. Tasks are organized into 7 phases that can be executed largely in parallel except where dependencies exist.

## Tasks

### Phase 1: Branding Rebrand

- [x] 1.1 Copy Joainas Mart logo to public folder
  - Copy `assets/Joainas Mart logo.png` to `public/logo.png` (replacing existing DIRMS logo)
  - Verify the image is valid and displays correctly

- [x] 1.2 Update edition config branding
  - In `src/config/edition.ts`: set `appName` to "Joainas Mart Inventory Management System", `shortName` to "Joainas Mart", `version` to "2.0.5"
  - Update the file header comment to reference Joainas Mart v2.0.5

- [x] 1.3 Update Tauri config branding
  - In `src-tauri/tauri.conf.json`: set `productName` to "Joainas Mart", window title to "Joainas Mart - Inventory Management System", `shortDescription` to "Joainas Mart - Inventory Management System (v2.0.5)"
  - Keep `identifier` as "com.dronebug.dirms.desktop" for data directory compatibility
  - Update `copyright` to reference Joainas Mart with DroneBug Technologies developer credit

- [x] 1.4 Update index.html and metadata.json
  - In `index.html`: change page title to "Joainas Mart — Inventory Management System", update splash text from "DIRMS" to "Joainas Mart"
  - In `metadata.json`: set `name` to "Joainas Mart", update description to reference Joainas Mart

- [x] 1.5 Update package.json
  - Set `name` to "joainas-mart" and `version` to "2.0.5"

- [x] 1.6 Update component branding strings
  - `DesktopShell.tsx`: sidebar brand text "DIRMS StoreBox PRO" → "Joainas Mart", mobile logo text "DIRMS" → "Joainas Mart"
  - `LoginModal.tsx`: alt text "DIRMS" → "Joainas Mart"
  - `DeveloperModal.tsx`: title "DIRMS StoreBox PRO" → "Joainas Mart"
  - `FirstTimeAdminSetup.tsx`: alt text "DIRMS" → "Joainas Mart"
  - `LicenseAgreement.tsx`: version label text
  - `FinancialStatementPaper.tsx`: default business name "DIRMS StoreBox PRO" → "Joainas Mart", developer verification section
  - `AdminModule.tsx`: backup app name string
  - `ThermalPrinterSettings.tsx`: KNOWN_DEFAULTS list and default text references
  - `App.tsx`: loading screen text "DIRMS" → "Joainas Mart" (two locations: boot splash and installation check)

- [x] 1.7 Update initial data defaults
  - In `src/data/initialData.ts`: update `INITIAL_PRINTER_CONFIG` — `storeName`, `businessName`, `address`, `receiptHeaderNote` to "Joainas Mart"
  - Update `DEVELOPER_INFO` — `appVersion` string to reference "v2.0.5 Joainas Mart"

- [x] 1.8 Write branding property test
  - Create test verifying no "DIRMS StoreBox" string remains in edition.ts, tauri.conf.json, index.html, metadata.json, or package.json (excluding the identifier field)
  - Verify "Joainas Mart" appears in all branding config files

### Phase 2: License System Removal

- [x] 2.1 Remove ActivationGate from App.tsx
  - Remove `import { ActivationGate }` from App.tsx
  - Remove the `activated` state and `setActivated` callback
  - Remove the `if (!activated && isTauriRuntime())` block that renders ActivationGate
  - Ensure the app proceeds directly to setup/login/main content

- [x] 2.2 Remove license references from DeveloperModal
  - Remove `getLicenseStatus` import and call from DeveloperModal.tsx
  - Remove license status display from the modal

- [x] 2.3 Remove license commands from Rust backend
  - Remove `license.rs` module registration from `src-tauri/src/main.rs` or `lib.rs`
  - Remove `get_license_status`, `import_license`, `activate_license`, `deactivate_license` command registrations from the Tauri builder
  - Delete `license.rs` file
  - Remove `ed25519-dalek` and `argon2` from `src-tauri/Cargo.toml` if no other code uses them

- [x] 2.4 Clean up license utility files
  - Delete `src/utils/license.ts` (no longer imported after DeveloperModal cleanup)
  - Delete `src/components/ActivationGate.tsx` (no longer imported after App.tsx cleanup)
  - Verify no remaining imports of license utilities across the codebase

- [x] 2.5 Write license removal verification test
  - Test that App.tsx does not import ActivationGate
  - Test that no license-related commands are registered (check main.rs/lib.rs for command list)

### Phase 3: Depleted Stock Sales Popup

- [x] 3.1 Create DepletedStockPopup component
  - Create `src/components/DepletedStockPopup.tsx`
  - Props: product name, onAddStock(qty: number), onSellNegative(), onClose()
  - Render message: "{productName} is run out. Would you add if you have it available?"
  - Integer input with placeholder "e.g., 10" and a Save button calling onAddStock
  - "Sell at negative stock" button calling onSellNegative
  - Close/cancel button calling onClose
  - Input validation: reject non-integers and zero

- [x] 3.2 Integrate popup into POSModule addItemToCart
  - Add state for `depletedPopupProduct` (Product | null) in POSModule
  - In `addItemToCart`: replace the `stockQty <= 0` block with a check:
    - If `can(user, 'inventory') || isAdmin(user)`: set `depletedPopupProduct` to show popup
    - If not: show toast "{name} is run out. Please inform the admin to restock." and return
  - Wire popup callbacks: onAddStock → update product stockQty in cache + addItemToCart; onSellNegative → addItemToCart with negative stock; onClose → clear popup state

- [x] 3.3 Integrate popup into barcode scan handlers
  - Apply the same depleted stock check logic to both barcode scan handler locations (barcode input and grid click)
  - Replace the two existing `if (!isUncountedKind(matched) && matched.stockQty <= 0)` blocks with the new popup/notification logic

- [x] 3.4 Implement negative stock decrement on sale
  - In the checkout/sale completion path: when a product is sold at negative stock, decrement stockQty normally (it goes from 0 to -1, -2, etc.)
  - Ensure the sale record is created with the correct items and amounts regardless of negative stock

- [x] 3.5 Implement negative stock reset in InventoryModule
  - In the stock adjustment/add path in InventoryModule.tsx: when adding stock to a product with `stockQty < 0`, set `stockQty = addedAmount` (not `stockQty + addedAmount`)
  - When `stockQty >= 0`, keep normal increment behavior (`stockQty + addedAmount`)
  - Update the stock update function (likely in storage.ts `updateProduct` or a dedicated stock update) to handle this logic

- [x] 3.6 Update cart quantity validation for negative stock
  - In the cart quantity change handler: when a product is being sold at negative stock (already in cart from depleted stock sale), do not block quantity increases based on stockQty limit
  - Allow the cart to proceed for negative-stock items

- [x] 3.7 Update POS grid button disabled state
  - Currently the grid button is disabled when `isOut` (stockQty <= 0). For inventory users, enable the button so the popup can be triggered.
  - For non-inventory users, keep disabled or show notification on click.

- [x] 3.8 Write depleted stock popup property test
  - Property: for all non-uncounted products with stockQty <= 0, popup is shown for inventory users
  - Property: for all uncounted products, no popup regardless of stock
  - Property: for non-inventory users, depleted stock blocks sale with notification
  - Property: negative stock reset — f(-3, +5) = 5, not 2

### Phase 4: Price Display Logic

- [x] 4.1 Update formatRange in pricing.ts
  - Implement the new three-mode logic: only max → "₦X", only min → "₦X+", both → "₦min – ₦max"
  - Remove the old "{price} (min)" suffix behavior

- [x] 4.2 Update getFloorFor in pricing.ts
  - Return 0 when minPrice is not set (no floor), instead of defaulting to retailPrice
  - Keep tier-based floor logic unchanged

- [x] 4.3 Update renderPriceRange in InventoryModule.tsx
  - Match the same three-mode display logic as formatRange
  - Only max → "₦X" (no "Max" prefix), only min → "₦X+", both → "₦min – ₦max"

- [x] 4.4 Update handleSubmit minPrice default in InventoryModule.tsx
  - Remove the line that defaults minPrice to retailPrice when not set
  - Allow minPrice to stay 0/undefined when not entered
  - Update the product save payload: `minPrice: minP > 0 ? minP : undefined` (not defaulting to maxP)

- [x] 4.5 Update formatSaleRate and formatSoldRange for new pricing model
  - Review and update the legacy sale rate formatting to handle the case where a product only has minPrice (no max) or only has retailPrice
  - Ensure historical sale records still display correctly

- [x] 4.6 Write price display property test
  - Property: generate random (minPrice, retailPrice) pairs, verify formatRange output:
    - min>0, max>0, min≠max → range
    - min>0, max=0 → "₦{min}+"
    - min=0, max>0 → "₦{max}" (no suffix)
    - min=0, max=0 → "₦0"
  - Round-trip: parse(formatRange(p)) should be able to reconstruct the pricing mode

### Phase 5: Backup Recovery Bug Fix

- [x] 5.1 Fix tryRecoverFromJsonBackup stop-after-first-success
  - Change the loop to break/return after the first file that yields ANY recovered data (sales > 0 OR products > 0 OR users > 0), not only when sales > 0
  - Currently it only returns when `adopted.sales > 0` — fix to also return on `adopted.products > 0` or `adopted.users > 0`

- [x] 5.2 Add barcode deduplication in adoptBackupPayload
  - In the newProducts filter: add a check that the product's barcode doesn't already exist in the live cache
  - Build a Set of existing barcodes from cacheProducts and filter newProducts by both ID and barcode

- [x] 5.3 Add numeric stockQty validation in isValidBackupPayload
  - Validate that each product in the `products` array has a numeric `stockQty` field
  - Reject payloads where any product has a non-numeric or missing stockQty

- [x] 5.4 Add defensive stockQty preservation assertion in adoptBackupPayload
  - After the merge, assert that no existing product's stockQty was modified
  - This is a safety net in addition to the Set-based deduplication

- [x] 5.5 Write backup recovery preservation property test
  - Property: for random live product sets and multiple backup payloads with overlapping IDs, existing stockQty values are never modified after adoptBackupPayload
  - Property: for random live product sets and backups with overlapping barcodes but different IDs, no duplicates are created
  - Property: processing >5 backup files does not corrupt inventory counts

### Phase 6: Receipt and Financial Record Branding

- [x] 6.1 Update MANDATORY_RECEIPT_FOOTER (if needed)
  - The constant already credits DroneBug Technologies — keep as is or adjust wording for Joainas Mart context
  - Ensure the footer works as the small developer credit line

- [x] 6.2 Update escpos.ts footer text
  - Replace the hardcoded footer string in escpos.ts with a reference to MANDATORY_RECEIPT_FOOTER constant (DRY fix)
  - Or update the hardcoded string to match the constant

- [x] 6.3 Update FinancialStatementPaper defaults
  - Change default `businessName` from "DIRMS StoreBox PRO" to "Joainas Mart"
  - Update the "Software Developer Verification" section to show "Joainas Mart" as the software name

- [x] 6.4 Write receipt footer verification test
  - Example test: assert MANDATORY_RECEIPT_FOOTER contains "DroneBug Technologies"
  - Example test: assert initial printer config storeName is "Joainas Mart"

### Phase 7: Version Marking and Final Verification

- [x] 7.1 Verify version consistency
  - Confirm edition.ts version = "2.0.5"
  - Confirm tauri.conf.json version = "2.0.5"
  - Confirm package.json version = "2.0.5"
  - Confirm shortDescription references v2.0.5

- [x] 7.2 Run full test suite
  - Run `npm run test` (vitest --run) to execute all property and example tests
  - Verify no existing tests break from the changes
  - Fix any test failures caused by branding or logic changes

- [x] 7.3 Run TypeScript lint check
  - Run `npm run lint` (tsc --noEmit) to verify no type errors
  - Fix any type errors introduced by the changes

- [x] 7.4 Build verification
  - Run `npm run build` to verify the frontend builds successfully
  - Check for any build warnings related to removed license dependencies
  - Verify the Rust backend compiles (if Cargo.toml was modified)

## Notes

- The Tauri identifier "com.dronebug.dirms.desktop" must remain unchanged to preserve the app data directory across updates. Changing it would orphan all existing user data.
- The negative stock reset behavior (reset to added amount, not sum) is intentional — it reflects that borrowed or credit-supplied stock is accounted separately. When the shop actually acquires stock, the count starts fresh from what was purchased.
- The price display change from "₦X (min)" to "₦X" (plain max) will affect existing products where minPrice was defaulted to retailPrice. This is a visual change only — no data migration is needed.
- The backup recovery fix changes the merge behavior to stop after the first successful adoption. This may reduce the total data recovered in edge cases where multiple backup files each contain unique records, but prevents the corruption bug which is the higher priority.
- Property-based tests use the `fast-check` library (already in devDependencies).

## Task Dependency Graph

```
Phase 1 (Branding) ──────────────────────────────────────────────
  1.1 (logo copy) → no deps
  1.2 (edition.ts) → no deps
  1.3 (tauri.conf.json) → no deps
  1.4 (index.html, metadata.json) → no deps
  1.5 (package.json) → no deps
  1.6 (component strings) → depends on 1.2 (edition version reference)
  1.7 (initialData.ts) → no deps
  1.8 (branding test) → depends on 1.2, 1.3, 1.4, 1.5

Phase 2 (License Removal) ──────────────────────────────────────
  2.1 (App.tsx gate removal) → no deps
  2.2 (DeveloperModal cleanup) → no deps
  2.3 (Rust backend) → no deps
  2.4 (delete license files) → depends on 2.1, 2.2
  2.5 (license removal test) → depends on 2.1, 2.4

Phase 3 (Depleted Stock Popup) ─────────────────────────────────
  3.1 (DepletedStockPopup component) → no deps
  3.2 (integrate into addItemToCart) → depends on 3.1
  3.3 (integrate into scan handlers) → depends on 3.1, 3.2
  3.4 (negative stock decrement) → depends on 3.2
  3.5 (negative stock reset) → depends on 3.2
  3.6 (cart quantity validation) → depends on 3.2
  3.7 (grid button state) → depends on 3.2
  3.8 (depleted stock test) → depends on 3.1, 3.2, 3.5

Phase 4 (Price Display) ────────────────────────────────────────
  4.1 (formatRange) → no deps
  4.2 (getFloorFor) → no deps
  4.3 (renderPriceRange) → depends on 4.1
  4.4 (handleSubmit minPrice) → depends on 4.1
  4.5 (formatSaleRate) → depends on 4.1
  4.6 (price display test) → depends on 4.1, 4.3

Phase 5 (Backup Recovery Fix) ──────────────────────────────────
  5.1 (stop-after-first-success) → no deps
  5.2 (barcode dedup) → no deps
  5.3 (numeric stockQty validation) → no deps
  5.4 (stockQty preservation assertion) → depends on 5.2
  5.5 (backup recovery test) → depends on 5.1, 5.2, 5.3, 5.4

Phase 6 (Receipt Branding) ─────────────────────────────────────
  6.1 (receipt footer) → depends on 1.7
  6.2 (escpos.ts) → depends on 6.1
  6.3 (FinancialStatementPaper) → depends on 1.7
  6.4 (receipt test) → depends on 6.1, 6.3

Phase 7 (Final Verification) ───────────────────────────────────
  7.1 (version consistency) → depends on 1.2, 1.3, 1.5
  7.2 (test suite) → depends on ALL phases
  7.3 (lint check) → depends on ALL phases
  7.4 (build verification) → depends on ALL phases
```

Cross-phase parallelization: Phases 1, 2, 4, and 5 have no inter-phase dependencies and can be executed in parallel. Phase 3 is independent. Phase 6 depends on Phase 1 (branding defaults). Phase 7 depends on all prior phases.

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.7", "2.1", "2.2", "2.3", "3.1", "4.1", "4.2", "5.1", "5.2", "5.3"],
      "description": "Independent tasks with no cross-phase dependencies: branding configs, license removal, popup component, pricing functions, backup recovery fixes"
    },
    {
      "wave": 2,
      "tasks": ["1.6", "1.8", "2.4", "2.5", "3.2", "3.4", "3.5", "3.6", "3.7", "4.3", "4.4", "4.5", "5.4", "6.1", "6.3"],
      "description": "Tasks depending on wave 1: component string updates, license file cleanup, popup integration, pricing UI, backup assertion, receipt defaults"
    },
    {
      "wave": 3,
      "tasks": ["3.3", "3.8", "4.6", "5.5", "6.2", "6.4", "7.1"],
      "description": "Tasks depending on wave 2: scan handler integration, property tests, escpos update, version verification"
    },
    {
      "wave": 4,
      "tasks": ["7.2", "7.3", "7.4"],
      "description": "Final verification: full test suite, lint check, build verification — depends on all prior waves"
    }
  ]
}
```
