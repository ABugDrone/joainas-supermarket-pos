# Design Document

## Overview

This update rebrands the DIRMS StoreBox PRO desktop application to "Joainas Mart", removes the offline license activation system, implements a depleted-stock sales popup for inventory-authorized users, refines price display logic for single-minimum or single-maximum pricing, fixes a backup-recovery bug that corrupts inventory stock counts when more than five backup JSON files accumulate, and updates to version 2.0.5. The update preserves all existing data across upgrades from any prior version (v1.x, v2.0.x).

## Architecture

The application is a Tauri desktop app with a Rust backend (`src-tauri/`) and a React/TypeScript frontend (`src/`). Key subsystems affected:

- **Branding**: `src/config/edition.ts`, `src-tauri/tauri.conf.json`, `index.html`, `metadata.json`, `package.json`, and component-level string literals across `src/components/`.
- **License**: `src/components/ActivationGate.tsx`, `src/utils/license.ts`, `src-tauri/src/license.rs`, and the gate logic in `src/App.tsx`.
- **POS/Sales**: `src/components/POSModule.tsx` — stock blocking in `addItemToCart`, barcode scan handlers, cart quantity change handler.
- **Inventory**: `src/components/InventoryModule.tsx` — `renderPriceRange`, `handleSubmit` (minPrice defaults), stock update.
- **Pricing**: `src/utils/pricing.ts` — `formatRange()`, `getFloorFor()`.
- **Storage/Backup**: `src/utils/storage.ts` — `tryRecoverFromJsonBackup()`, `adoptBackupPayload()`, `isValidBackupPayload()`.
- **Receipts**: `src/types.ts` (`MANDATORY_RECEIPT_FOOTER`), `src/components/ThermalReceiptModal.tsx`, `src/components/FinancialStatementPaper.tsx`, `src/utils/escpos.ts`.
- **Initial Data**: `src/data/initialData.ts` — printer config and developer info defaults.
- **Permissions**: `src/utils/permissions.ts` — `isAdmin()`, `can()`.

The data layer uses an in-memory cache (`cacheProducts`, `cacheSales`, `cacheCustomers`, `cacheUsers`) backed by a SQLite database and autosave snapshots. The update path relies on `tryRecoverFromJsonBackup()`, `tryMergeSiblingDatabases()`, `hasInstallEvidence()`, and legacy key migration to detect prior installations and merge orphaned data.

## Components and Interfaces

### 1. Branding Rebrand

Update all branding constants and string literals from "DIRMS StoreBox PRO" / "DIRMS" to "Joainas Mart". Copy the logo from `assets/Joainas Mart logo.png` to `public/logo.png` (replacing the existing one). Update all component alt-text and hardcoded brand strings.

**Files to update for branding:**
- `src/config/edition.ts` — appName, shortName, version
- `src-tauri/tauri.conf.json` — productName, window title, shortDescription, copyright
- `index.html` — title, splash text
- `metadata.json` — name, description
- `package.json` — name, version
- `src/components/DesktopShell.tsx` — sidebar brand text, mobile logo text
- `src/components/LoginModal.tsx` — alt text, brand
- `src/components/DeveloperModal.tsx` — title, version display
- `src/components/LicenseAgreement.tsx` — version label
- `src/components/FirstTimeAdminSetup.tsx` — alt text
- `src/components/ThermalPrinterSettings.tsx` — KNOWN_DEFAULTS list, default text
- `src/components/FinancialStatementPaper.tsx` — default business name, developer verification
- `src/components/AdminModule.tsx` — backup app name
- `src/data/initialData.ts` — INITIAL_PRINTER_CONFIG, DEVELOPER_INFO
- `public/logo.png` — replace with Joainas Mart logo

### 2. License System Removal

Remove the `ActivationGate` render from `src/App.tsx`. Remove or bypass the `activated` state check. Remove the `ActivationGate` import. In the Rust backend, completely remove `get_license_status`, `import_license`, `activate_license`, `deactivate_license` command registrations from the Tauri builder. Remove `license.rs` module registration. Remove `src/utils/license.ts` imports from `DeveloperModal.tsx`.

**Approach:**
- In `App.tsx`: Remove the `if (!activated && isTauriRuntime())` block that renders `<ActivationGate>`. Remove the `activated` state and `setActivated` callback. Remove the import.
- In `DeveloperModal.tsx`: Remove the license status fetch and display.
- In Rust: Remove `license.rs` module declaration and command registrations. Remove `license.rs` file. Remove `ed25519-dalek` and `argon2` dependencies from `Cargo.toml` if no other code uses them.
- Delete `src/components/ActivationGate.tsx` and `src/utils/license.ts` to avoid confusion.

### 3. Depleted Stock Sales Popup

Create a new `DepletedStockPopup` component that intercepts the depleted-stock blocking logic in `addItemToCart`.

**Interface:**
```typescript
interface DepletedStockPopupProps {
  productName: string;
  onAddStock: (qty: number) => void;
  onSellNegative: () => void;
  onClose: () => void;
}
```

**Current behavior (to replace):**
```typescript
// In addItemToCart:
if (!isService && prod.stockQty <= 0) {
  showToast(`${prod.name} is OUT OF STOCK. Add inventory before selling.`, 'error');
  return;
}
```

**New behavior:**
- When `!isUncountedKind(prod) && prod.stockQty <= 0`:
  - If `can(user, 'inventory') || isAdmin(user)`: Show `DepletedStockPopup` with:
    - Message: "{productName} is run out. Would you add if you have it available?"
    - Integer input with placeholder (e.g., "e.g., 10") and a "Save" button → calls `updateStock(product.id, qty)` which updates the product's `stockQty` in the inventory cache, then adds the item to cart.
    - "Sell at negative stock" button → proceeds with sale, decrements `stockQty` into negative range.
    - Close/cancel → does not add to cart.
  - If user lacks inventory access: Show a toast/modal: "{productName} is run out. Please inform the admin to restock." Does not add to cart.

**Negative stock reset logic in InventoryModule:**
When adding stock to a product with negative `stockQty`, the new `stockQty` should be the added amount (not the sum):
```typescript
if (product.stockQty < 0) {
  newStockQty = addedAmount; // reset from negative to positive
} else {
  newStockQty = product.stockQty + addedAmount; // normal increment
}
```

**Cart quantity validation update:**
The existing cart quantity change handler blocks quantity increases beyond `stockQty`. This needs to allow negative stock scenarios — when selling at negative stock, the cart should not be blocked by the stock limit.

### 4. Price Display Logic Changes

Modify `formatRange()` in `src/utils/pricing.ts` and `renderPriceRange()` in `src/components/InventoryModule.tsx`:

**New formatRange logic:**
```typescript
export function formatRange(product: Product, code?: string | null): string {
  const hasTiers = product.priceTiers && product.priceTiers.length > 0;
  if (hasTiers) return `${product.priceTiers!.length} tiers`;

  const hasMin = product.minPrice !== undefined && product.minPrice !== null && product.minPrice > 0;
  const hasMax = product.retailPrice !== undefined && product.retailPrice > 0;

  if (hasMin && hasMax && product.minPrice !== product.retailPrice) {
    return `${formatMoney(product.minPrice, code)} – ${formatMoney(product.retailPrice, code)}`;
  }
  if (hasMin && !hasMax) {
    return `${formatMoney(product.minPrice, code)}+`;
  }
  if (hasMax) {
    return formatMoney(product.retailPrice, code);
  }
  return formatMoney(0, code);
}
```

**InventoryModule handleSubmit change:**
Remove the line that defaults `minPrice` to `retailPrice` when not set. Allow `minPrice` to stay 0/undefined when not entered, so the "only max" display works.

**getFloorFor change:**
Return 0 when `minPrice` is not set (no floor), instead of defaulting to `retailPrice`:
```typescript
export function getFloorFor(product: Product, qty: number): number {
  // tier logic unchanged...
  if (product.minPrice !== undefined && product.minPrice !== null && product.minPrice > 0) {
    return product.minPrice;
  }
  return 0; // no floor when minPrice not set
}
```

### 5. Backup Recovery Bug Fix

The bug: when >5 backup JSON files exist, `tryRecoverFromJsonBackup` processes up to 10 candidates and calls `adoptBackupPayload` for each valid one, potentially corrupting stock counts.

**Fix approach:**
1. In `tryRecoverFromJsonBackup`: After the first valid file that yields ANY recovered data (sales OR products OR users), stop processing remaining candidates. Currently it only returns when `adopted.sales > 0`.
2. In `adoptBackupPayload`: Add barcode deduplication — if a backup product has the same barcode as an existing live product, skip it.
3. In `isValidBackupPayload`: Validate that product entries have numeric `stockQty` fields.
4. Add a defensive assertion that existing products' `stockQty` is never modified.

### 6. Receipt and Financial Record Branding

Keep `MANDATORY_RECEIPT_FOOTER` with the DroneBug Technologies credit line. Update `INITIAL_PRINTER_CONFIG` in `initialData.ts` to use "Joainas Mart". Update `FinancialStatementPaper.tsx` defaults. Update `escpos.ts` to reference the constant instead of hardcoding the string.

## Data Models

No schema changes are required. The `Product` interface already has optional `minPrice?` and `retailPrice` (both `number`). The negative stock feature uses the existing `stockQty: number` field which supports negative values in TypeScript. The `SaleRecord` schema is unchanged.

The only data model consideration is that existing products with `minPrice === retailPrice` (due to the old default behavior) will now display as "only max" format since `minPrice !== retailPrice` will be false. This is the intended behavior change — those products were always max-only; the old code just defaulted min to max for the floor calculation.

Key existing interfaces used by this design:

```typescript
interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  kind?: 'product' | 'service' | 'edible';
  unit: ProductUnit;
  costPrice: number;
  retailPrice: number;       // max price
  wholesalePrice: number;
  minPrice?: number;         // optional floor price
  priceTiers?: PriceTier[];
  stockQty: number;           // supports negative values
  reorderLevel: number;
}
```

## Correctness Properties

### Property 1: No DIRMS Branding Remnants
For all branding config files (edition.ts, tauri.conf.json, index.html, metadata.json, package.json), the string "DIRMS" shall not appear in any user-facing value. Exception: the Tauri identifier "com.dronebug.dirms.desktop" is preserved for data directory compatibility (not user-facing).
**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8**

### Property 2: ActivationGate Not Rendered
The `App.tsx` component shall not import or render `ActivationGate`. The Rust backend shall not register any license-related Tauri commands.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Depleted Stock Popup Behavior
For all products P where `isUncountedKind(P) === false` and `P.stockQty <= 0`:
- If user has inventory capability: a popup shall be shown (not a blocking toast).
- If user lacks inventory capability: a notification shall be shown and the item shall not be added to cart.
For all products where `isUncountedKind(P) === true`: no popup shall be shown regardless of stock level.
**Validates: Requirements 4.1, 4.2, 4.3, 4.7, 5.1, 5.2, 5.3, 5.4**

### Property 4: Negative Stock Reset
For all products P where `P.stockQty < 0` and an amount A > 0 is added:
`newStockQty = A` (not `P.stockQty + A`).
For all products P where `P.stockQty >= 0` and an amount A > 0 is added:
`newStockQty = P.stockQty + A`.
**Validates: Requirements 4.4, 4.5**

### Property 5: Price Display Format
For all products P:
- If `minPrice > 0` and `retailPrice > 0` and `minPrice !== retailPrice`: display = "₦{min} – ₦{max}"
- If `minPrice > 0` and (`retailPrice` is 0 or undefined): display = "₦{min}+"
- If (`minPrice` is 0 or undefined) and `retailPrice > 0`: display = "₦{max}" (no suffix)
- If both are 0 or undefined: display = "₦0"
**Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6**

### Property 6: Backup Recovery Stock Preservation
For all sets of backup payloads B1...Bn (n > 5) and a live product set L:
After processing all backups via `adoptBackupPayload`, for every product P in L:
`P.stockQty` shall equal its original value (no backup merge modifies existing product stock).
Only products with IDs not in L and barcodes not in L shall be added.
**Validates: Requirements 7.1, 7.2, 7.3**

### Property 7: Backup Recovery Single-File Adoption
`tryRecoverFromJsonBackup` shall stop processing backup candidates after the first file that yields recovered data (sales OR products OR users), not only when sales > 0.
**Validates: Requirements 7.4, 7.5**

### Property 8: Version Consistency
All version fields across `edition.ts`, `tauri.conf.json`, and `package.json` shall equal "2.0.5".
**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 9: Receipt Footer Credit Preservation
For all printed receipts, the footer shall contain the text "DroneBug Technologies" as a developer credit line.
**Validates: Requirements 8.2, 8.3**

## Error Handling

- **Depleted stock popup with invalid input**: If the user enters a non-integer or zero in the stock-add input, display a validation error and do not proceed.
- **Negative stock with no retail price**: If a product is sold at negative stock but has no price set, block the sale with an error message.
- **Backup recovery with corrupt JSON**: The existing try/catch around each candidate file handles parse errors gracefully — this remains unchanged.
- **Price display with zero prices**: Display "₦0" as a fallback when neither min nor max is set.

## Testing Strategy

### Property-Based Tests (fast-check)
1. **Price Display Property**: Generate random (minPrice, retailPrice) pairs and verify `formatRange()` output matches the three display rules.
2. **Negative Stock Reset Property**: Generate random negative stockQty values and positive add amounts, verify the reset logic produces the add amount (not the sum).
3. **Backup Recovery Preservation Property**: Generate random live product sets and multiple backup payloads with overlapping product IDs, verify existing stock values are never modified after `adoptBackupPayload`.
4. **Depleted Stock Popup Trigger Property**: Generate random products with varying kind and stockQty, verify popup is shown only for non-uncounted products with stockQty <= 0.

### Integration/Example Tests
1. Rebranding spot-check: assert edition config, tauri config, and index.html contain "Joainas Mart".
2. License removal: assert App.tsx does not render ActivationGate.
3. Receipt footer: assert footer text contains "DroneBug Technologies".
4. Version consistency: assert all version fields equal "2.0.5".
5. Update compatibility: assert identifier is unchanged and recovery functions exist.

## Sequence Diagrams

### Depleted Stock Sale Flow (Inventory User)
```
User scans barcode → POSModule detects stockQty <= 0
  → isUncountedKind? No
  → hasInventoryAccess? Yes
  → Show DepletedStockPopup
    → User enters qty + Save → updateStock(product, qty) → addItemToCart(product, 1)
    → User clicks "Sell at negative" → addItemToCart(product, 1) → decrementStock(product, -1)
    → User closes popup → no action
```

### Depleted Stock Sale Flow (Non-Inventory User)
```
User scans barcode → POSModule detects stockQty <= 0
  → isUncountedKind? No
  → hasInventoryAccess? No
  → Show notification: "{name} is run out. Please inform the admin to restock."
  → Do not add to cart
```

### Backup Recovery Flow (Fixed)
```
initStorage() → tryRecoverFromJsonBackup()
  → Scan folder for *backup*.json files
  → Sort most recent first
  → For each candidate (up to 10):
    → Already processed? Skip
    → Parse + validate (isValidBackupPayload with numeric stockQty check)
    → Valid? → adoptBackupPayload (add only new products by ID AND barcode)
    → Yielded data? → Save snapshot, set marker, STOP
    → No data? → Set marker, continue to next
```
