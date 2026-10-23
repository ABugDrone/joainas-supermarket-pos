import React from 'react';
import { Search, Trash2, ShoppingCart, Printer, Package, ScanBarcode, Table2, LayoutGrid, ArrowLeft } from 'lucide-react';
import { Product, Customer, CartItem, SaleRecord, ThermalPrinterConfig, UserRole, Category, Capability, isUncountedKind } from '../types';
import { formatNaira, playPOSBeep, recordAuditLog, getClockGate } from '../utils/storage';
import { useCurrency } from '../hooks/useCurrency';
import { refreshGate, signalClockLogout } from '../utils/trustedTime';
import { getCurrencyCode } from '../utils/currency';
import { useClockGate } from '../hooks/useClockGate';
import { useToast } from './Toast';
import { CartPreviewModal } from './CartPreviewModal';
import { NumberInput } from './NumberInput';
import { QtyInput } from './QtyInput';
import { getCeilingFor, getFloorFor, getDefaultRate, formatRange, validateUnitPrice, NO_CEILING } from '../utils/pricing';
import { applyStockAddition, resolveDepletedStockAction } from '../utils/stock';
import { cartToLines, reconcileCart, PosWorkspace } from '../utils/workspace';
import { hasActiveClockOverride } from '../utils/clockOverride';
import { DepletedStockPopup } from './DepletedStockPopup';
import { StockAdjustModal } from './StockAdjustModal';

interface POSModuleProps {
  products: Product[];
  customers: Customer[];
  categories?: Category[];
  printerConfig: ThermalPrinterConfig;
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities?: Capability[];
  onCompleteSale: (sale: SaleRecord) => void;
  onUpdateProduct?: (product: Product) => void;
  onOpenCustomerModal: () => void;
  // Per-user workspace continuity: restore this account's saved bill on
  // mount, and report every bill change up for snapshot-on-logout.
  initialPosWorkspace?: PosWorkspace | null;
  onPosWorkspaceChange?: (w: PosWorkspace) => void;
}

export const POSModule: React.FC<POSModuleProps> = ({
  products,
  customers,
  categories = [],
  printerConfig,
  currentUser,
  currentUserRole,
  currentUserCapabilities = [],
  onCompleteSale,
  onUpdateProduct,
  onOpenCustomerModal,
  initialPosWorkspace,
  onPosWorkspaceChange,
}) => {
  const { showToast } = useToast();
  const { symbol: curSym } = useCurrency();

  const [barcodeQuery, setBarcodeQuery] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState<string>(products[0]?.id || '');
  const [quantity, setQuantity] = React.useState<number>(1);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string>(customers[0]?.id || '');
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [depletedPrompt, setDepletedPrompt] = React.useState<{ product: Product; qty: number } | null>(null);
  const [restockForSale, setRestockForSale] = React.useState<{ product: Product; qty: number } | null>(null);
  const canManageStock =
    currentUserCapabilities.includes('admin') || currentUserCapabilities.includes('inventory');
  const [advancePayment, setAdvancePayment] = React.useState<number>(0);
  const [paymentMethod, setPaymentMethod] = React.useState<'Cash' | 'Transfer' | 'POS/Card' | 'Cash + Transfer' | 'Store Credit / Account'>('Cash');
  const [cashAmount, setCashAmount] = React.useState<number>(0);
  const [transferAmount, setTransferAmount] = React.useState<number>(0);
  const [paymentNote, setPaymentNote] = React.useState<string>('');
  const [isCartPreviewOpen, setIsCartPreviewOpen] = React.useState(false);
  const [showProducts, setShowProducts] = React.useState(false);
  const [isTableMode, setIsTableMode] = React.useState(false);
  const [showOverlayProducts, setShowOverlayProducts] = React.useState(false);
  // Sales inventory view: List by default, user can choose Grid or List (fix for 368+ items)
  const [productViewMode, setProductViewMode] = React.useState<'grid'|'list'>('list');
  const [gridPage, setGridPage] = React.useState(1);
  const GRID_PAGE_SIZE = 50;
  // v1.5.1 trusted clock: live block banner — appears/disappears in real
  // time as the OS clock moves (no refresh needed).
  const liveGate = useClockGate();
  const clockBlockedMsg = liveGate.ok ? null : liveGate.reason;
  // v2.0.6: a non-admin signed in under a clock warning keeps a runtime
  // override. Sales continue and are tagged for ADMIN reconciliation.
  const clockOverrideActive = hasActiveClockOverride();
  const barcodeInputRef = React.useRef<HTMLInputElement>(null);
  const overlaySearchRef = React.useRef<HTMLInputElement>(null);

  // Restore this account's saved bill once the catalog is available
  // (products arrive async after storage-ready). Runs once per mount.
  const workspaceAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (workspaceAppliedRef.current) return;
    if (products.length === 0) return;
    workspaceAppliedRef.current = true;
    if (!initialPosWorkspace) return;
    const w = initialPosWorkspace;
    if (w.cart && w.cart.length > 0) {
      const { items, notes } = reconcileCart(w.cart, products);
      if (items.length > 0) setCart(items);
      notes.forEach((n) => showToast(n, 'info'));
      if (items.length > 0) showToast('Your saved bill was restored.', 'success');
    }
    if (w.customerId && customers.some((c) => c.id === w.customerId)) {
      setSelectedCustomerId(w.customerId);
    }
    if (w.paymentMethod) setPaymentMethod(w.paymentMethod as any);
    if (typeof w.cashAmount === 'number') setCashAmount(w.cashAmount);
    if (typeof w.transferAmount === 'number') setTransferAmount(w.transferAmount);
    if (typeof w.paymentNote === 'string') setPaymentNote(w.paymentNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Report every bill change up so logout/sleep can snapshot it.
  React.useEffect(() => {
    if (!onPosWorkspaceChange) return;
    onPosWorkspaceChange({
      cart: cartToLines(cart),
      customerId: selectedCustomerId,
      paymentMethod,
      cashAmount,
      transferAmount,
      paymentNote,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, selectedCustomerId, paymentMethod, cashAmount, transferAmount, paymentNote]);

  // Full-screen bill dataset preview: hidden by default — user opens manually via View Bill Table.
  // Products inside overlay also hidden by default (like grid view) so bill is fully visible without scroll.
  React.useEffect(() => {
    if (cart.length === 0 && isTableMode) {
      setIsTableMode(false);
      setShowOverlayProducts(false);
    }
  }, [cart.length]);
  React.useEffect(() => {
    if (!isTableMode) setShowOverlayProducts(false);
  }, [isTableMode]);

  // --- Global barcode-scan capture ----------------------------------------
  // Handheld USB scanners work like keyboards: they "type" the barcode and
  // then press Enter. If the scan input loses focus (cashier taps a product
  // tile, or the WebView focus moves) those keystrokes used to go nowhere.
  // This window-level listener buffers the burst of keys and treats an
  // Enter-terminated sequence as a barcode scan — regardless of which element
  // has focus. It also decodes keys by PHYSICAL key (e.code), so a different
  // Windows keyboard layout on another PC cannot mangle the scanned digits.
  const scanBufferRef = React.useRef('');
  const lastScanKeyRef = React.useRef(0);
  // Holds the latest closure so the listener is attached only once.
  const processScanRef = React.useRef<(code: string) => void>(() => {});
  processScanRef.current = (raw: string) => {
    const code = raw.trim();
    const norm = code.replace(/[^a-zA-Z0-9]/g, '');
    if (!norm) {
      showToast('Scanner input was empty.', 'warning');
      return;
    }
    const matched =
      products.find((p) => p.barcode === code) ||
      products.find((p) => p.barcode.replace(/[^a-zA-Z0-9]/g, '') === norm) ||
      products.find((p) => p.name.toLowerCase().includes(code.toLowerCase()));
    if (matched) {
      setSelectedProductId(matched.id);
      requestAddToCart(matched, quantity);
    } else {
      playPOSBeep();
      showToast(`No product found for code "${code}"`, 'warning');
    }
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isFormField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      // When a real input is focused, let normal typing / form-submit handle
      // the scan (existing behaviour). The global path is the fallback for
      // scans that arrive while focus is elsewhere.
      if (isFormField) return;

      const now = Date.now();
      const code = e.code || '';
      let ch: string | null = null;
      if (code.startsWith('Digit')) ch = code.slice(5); // Digit0-Digit9
      else if (code.startsWith('Numpad')) ch = code.slice(6); // Numpad0-Numpad9
      else if (code.startsWith('Key')) ch = code.slice(3).toUpperCase(); // KeyA-KeyZ

      if (ch !== null && ch.length === 1) {
        // A slow key (>150ms gap) starts a new burst — human typing is much
        // slower than a scanner burst.
        if (now - lastScanKeyRef.current > 150) scanBufferRef.current = '';
        scanBufferRef.current += ch;
        lastScanKeyRef.current = now;
        if (scanBufferRef.current.length > 48) scanBufferRef.current = '';
        return;
      }

      if (e.key === 'Enter' && scanBufferRef.current.length >= 3) {
        e.preventDefault();
        const raw = scanBufferRef.current;
        scanBufferRef.current = '';
        lastScanKeyRef.current = 0;
        processScanRef.current(raw);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Category color lookup — products are classified by category color.
  const categoryColorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.name.toLowerCase(), c.color || '#6366f1'));
    return map;
  }, [categories]);

  // Stock status: services & edibles are never low/out (uncounted).
  const getStockStatus = (p: Product): 'good' | 'low' | 'out' => {
    if (isUncountedKind(p)) return 'good';
    if (p.stockQty <= 0) return 'out';
    if (p.stockQty <= p.reorderLevel) return 'low';
    return 'good';
  };

  const getStockColor = (status: 'good' | 'low' | 'out'): string => {
    if (status === 'out') return '#ef4444';
    if (status === 'low') return '#f97316';
    return '#22c55e';
  };

  const getCategoryColor = (p: Product): string =>
    categoryColorMap.get(p.category.toLowerCase()) || '#6366f1';

  // Smart filtered products for sales inventory (used by both Grid and List, supports 1B via pagination)
  const filteredProducts = React.useMemo(() => {
    if (!barcodeQuery.trim()) {
      // No search: return all (Show Products will paginate) — smart search hides until 2 letters, handled in UI layer
      return products;
    }
    const q = barcodeQuery.trim().toLowerCase();
    if (q.length < 2) return []; // smart search: wait for 2 letters
    const q2 = q.slice(0, 2);
    return products.filter((p) => {
      return (
        p.name.toLowerCase().slice(0, 2) === q2 ||
        p.category.toLowerCase().slice(0, 2) === q2 ||
        p.unit.toLowerCase().slice(0, 2) === q2 || // "hour"/"job"/"design" services
        p.barcode.toLowerCase().startsWith(q) ||
        p.name.toLowerCase().startsWith(q) ||
        p.category.toLowerCase().startsWith(q) ||
        p.unit.toLowerCase().startsWith(q) ||
        p.name.toLowerCase().includes(q) // fallback includes for broader match
      );
    });
  }, [products, barcodeQuery]);

  const totalGridPages = Math.max(1, Math.ceil(filteredProducts.length / GRID_PAGE_SIZE));
  const paginatedGridProducts = React.useMemo(() => {
    const start = (gridPage - 1) * GRID_PAGE_SIZE;
    return filteredProducts.slice(start, start + GRID_PAGE_SIZE);
  }, [filteredProducts, gridPage]);

  React.useEffect(() => {
    setGridPage(1);
  }, [barcodeQuery, productViewMode]);

  const selectedProduct = React.useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0];
  }, [products, selectedProductId]);

  const selectedCustomer = React.useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0];
  }, [customers, selectedCustomerId]);

  const currentRate = React.useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.retailPrice;
  }, [selectedProduct]);

  // Calculate Subtotal & Total Amount (All prices already contain tax and discount)
  const cartSubtotal = React.useMemo(() => {
    return cart.reduce((sum, item) => sum + item.amount, 0);
  }, [cart]);

  // Sync default advance payment when cart changes
  React.useEffect(() => {
    if (paymentMethod === 'Cash + Transfer') {
      // keep manual split but ensure total reflects if cart changes and both were zero
      if (cashAmount + transferAmount === 0 && cartSubtotal > 0) {
        setCashAmount(cartSubtotal);
        setTransferAmount(0);
        setAdvancePayment(cartSubtotal);
      }
      return;
    }
    setAdvancePayment(cartSubtotal);
  }, [cartSubtotal, paymentMethod, cashAmount, transferAmount]);

  // When switching to Cash + Transfer, prefill cash with total
  React.useEffect(() => {
    if (paymentMethod === 'Cash + Transfer' && cartSubtotal > 0) {
      if (cashAmount === 0 && transferAmount === 0) {
        setCashAmount(cartSubtotal);
        setTransferAmount(0);
        setAdvancePayment(cartSubtotal);
      }
    }
  }, [paymentMethod]);

  // Keep advancePayment as sum for split
  React.useEffect(() => {
    if (paymentMethod === 'Cash + Transfer') {
      setAdvancePayment((cashAmount || 0) + (transferAmount || 0));
    }
  }, [cashAmount, transferAmount, paymentMethod]);

  // Handle barcode scanner search
  const handleBarcodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeQuery.trim()) return;

    const code = barcodeQuery.trim();
    const norm = code.replace(/[^a-zA-Z0-9]/g, '');
    const matched =
      products.find((p) => p.barcode === code) ||
      products.find((p) => p.barcode.replace(/[^a-zA-Z0-9]/g, '') === norm) ||
      products.find((p) => p.name.toLowerCase().includes(code.toLowerCase()));

    if (matched) {
      setSelectedProductId(matched.id);
      const matchedByBarcode =
        matched.barcode === code ||
        matched.barcode.replace(/[^a-zA-Z0-9]/g, '') === norm;
      if (matchedByBarcode) {
        requestAddToCart(matched, quantity);
        setBarcodeQuery('');
        // Keep focus on the scan field so the next item can be scanned immediately.
        barcodeInputRef.current?.focus();
      } else if (isUncountedKind(matched)) {
        // Name match on a service/edible (auto barcodes like 200xxxx are never
        // typed by hand) — add it straight to the bill at qty 1, the default.
        requestAddToCart(matched, 1);
        setBarcodeQuery('');
        barcodeInputRef.current?.focus();
      } else {
        // Name match on a product: select only, so nothing ever auto-adds goods.
        showToast(`Selected ${matched.name} — tap + Add to put it on the bill.`, 'info');
      }
    } else {
      showToast(`No product found matching barcode or code "${barcodeQuery}"`, 'warning');
    }
  };

  // Focus the scan field so a USB/handheld barcode scanner is ready to input.
  const focusScanner = () => {
    barcodeInputRef.current?.focus();
    barcodeInputRef.current?.select();
    showToast('Scanner ready — scan a barcode now.', 'info');
  };

  /**
   * Entry point for every "add to bill" action (scan, grid, list, search).
   * Checks available stock first and opens the depleted-stock dialog instead
   * of failing with a toast.
   */
  const requestAddToCart = (prod: Product, qty: number) => {
    if (!prod || qty <= 0) return;
    if (isUncountedKind(prod)) {
      addItemToCart(prod, qty, false);
      return;
    }

    const existingLine = cart.find((i) => i.product.id === prod.id);
    if (existingLine?.allowNegativeStock) {
      // Already selling this line into negative stock — keep going.
      addItemToCart(prod, qty, true);
      return;
    }
    const alreadyInCart = existingLine?.quantity || 0;
    const remaining = prod.stockQty - alreadyInCart;
    if (qty <= remaining) {
      addItemToCart(prod, qty, false);
      return;
    }

    playPOSBeep();
    const action = resolveDepletedStockAction(
      { ...prod, stockQty: Math.max(0, remaining) },
      currentUserCapabilities
    );
    if (action === 'popup') {
      setDepletedPrompt({ product: prod, qty });
      return;
    }
    if (remaining > 0) {
      showToast(
        `Only ${remaining} ${prod.unit} of ${prod.name} left (${alreadyInCart} already on the bill).`,
        'warning'
      );
    } else {
      showToast(`${prod.name} is out of stock. Ask an inventory manager to add stock.`, 'error');
    }
  };

  const addItemToCart = (prod: Product, qty: number, allowNegativeStock: boolean = false) => {
    if (!prod) return;
    if (qty <= 0) return;

    const isService = isUncountedKind(prod);
    const ceiling = getCeilingFor(prod, qty);
    const floor = getFloorFor(prod, qty);
    const rate = getDefaultRate(prod, qty);

    let didAdd = false;
    let blockedReason: string | null = null;
    setCart((prev) => {
      const alreadyInCart = prev.find((i) => i.product.id === prod.id)?.quantity || 0;
      if (!isService && !allowNegativeStock && alreadyInCart + qty > prod.stockQty) {
        blockedReason = `Only ${prod.stockQty} unit(s) of ${prod.name} in stock (${alreadyInCart} already on the bill). Restock inventory to sell more.`;
        return prev;
      }
      didAdd = true;
      const existingIdx = prev.findIndex((item) => item.product.id === prod.id);
      if (existingIdx > -1) {
        const updated = [...prev];
        const prevItem = updated[existingIdx];
        const newQty = prevItem.quantity + qty;
        const newCeiling = getCeilingFor(prod, newQty);
        const newFloor = getFloorFor(prod, newQty);
        // if existing rate exceeds new ceiling, clamp it
        let keepRate = prevItem.rate;
        if (keepRate > newCeiling) {
          keepRate = newCeiling;
          setTimeout(() => showToast(`${prod.name} qty ${newQty}: selling price adjusted to max ${formatNaira(newCeiling)} for this quantity.`, 'info'), 0);
        }
        // also respect floor
        if (keepRate < newFloor && newFloor > 0) keepRate = newFloor;
        updated[existingIdx] = {
          ...prevItem,
          quantity: newQty,
          rate: keepRate,
          ceilingAtSale: newCeiling,
          floorAtSale: newFloor,
          allowNegativeStock: prevItem.allowNegativeStock || allowNegativeStock,
          amount: newQty * keepRate,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            product: prod,
            quantity: qty,
            priceType: 'retail',
            rate,
            ceilingAtSale: ceiling,
            floorAtSale: floor,
            allowNegativeStock,
            amount: qty * rate,
          },
        ];
      }
    });
    if (blockedReason) {
      setTimeout(() => showToast(blockedReason!, 'warning'), 0);
    } else if (didAdd) {
      playPOSBeep();
      showToast(`Added ${qty} ${prod.unit} of ${prod.name} at ${formatNaira(rate)} each. Price can be adjusted in bill.`, 'success');
    }
  };

  const handleDepletedAddStock = () => {
    if (!depletedPrompt) return;
    setRestockForSale(depletedPrompt);
    setDepletedPrompt(null);
  };

  const handleDepletedSellAnyway = () => {
    if (!depletedPrompt) return;
    const { product, qty } = depletedPrompt;
    setDepletedPrompt(null);
    addItemToCart(product, qty, true);
  };

  const handleRestockForSale = (newQty: number, added: number) => {
    if (!restockForSale) return;
    const updated = { ...restockForSale.product, stockQty: newQty };
    onUpdateProduct?.(updated);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Added Inventory Stock',
      `Added ${added} ${updated.unit} to "${updated.name}" from the sales screen — stock ${restockForSale.product.stockQty} → ${newQty}.`
    );
    showToast(`Stock for "${updated.name}" updated to ${newQty}.`, 'success');
    addItemToCart(updated, restockForSale.qty, false);
    setRestockForSale(null);
  };

  const removeItemFromCart = (index: number) => {
    let item = cart[index];
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (item) {
      showToast(`Removed ${item.product.name} from cart.`, 'info');
    }
  };

  const updateCartQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeItemFromCart(index);
      return;
    }
    let blocked = false;
    let blockedMsg = '';
    let ceilingAdjusted = false;
    setCart((prev) => {
      const item = prev[index];
      if (item && !isUncountedKind(item.product) && !item.allowNegativeStock && newQty > item.product.stockQty) {
        blocked = true;
        blockedMsg = `Only ${item.product.stockQty} unit(s) of ${item.product.name} in stock. Restock inventory to sell more.`;
        return prev;
      }
      const updated = [...prev];
      const cur = updated[index];
      if (!cur) return prev;
      const newCeiling = getCeilingFor(cur.product, newQty);
      const newFloor = getFloorFor(cur.product, newQty);
      let newRate = cur.rate;
      if (newRate > newCeiling) { newRate = newCeiling; ceilingAdjusted = true; }
      if (newFloor > 0 && newRate < newFloor) newRate = newFloor;
      updated[index] = {
        ...cur,
        quantity: newQty,
        rate: newRate,
        ceilingAtSale: newCeiling,
        floorAtSale: newFloor,
        amount: newQty * newRate,
      };
      return updated;
    });
    if (blocked) setTimeout(() => showToast(blockedMsg, 'warning'), 0);
    if (ceilingAdjusted) setTimeout(() => showToast(`Selling price adjusted to max for new quantity.`, 'info'), 0);
  };

  const updateCartRate = (index: number, newRate: number) => {
    const item = cart[index];
    if (!item) return;
    const ceiling = item.ceilingAtSale ?? getCeilingFor(item.product, item.quantity);
    const floor = item.floorAtSale ?? getFloorFor(item.product, item.quantity);
    const err = validateUnitPrice(newRate, ceiling, floor);
    if (err) {
      showToast(err, 'error');
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const cur = updated[index];
      if (!cur) return prev;
      updated[index] = { ...cur, rate: newRate, amount: newRate * cur.quantity };
      return updated;
    });
  };

  // Open Sales Cart Preview Modal
  const handleOpenCartPreview = () => {
    if (cart.length === 0) {
      showToast('Cart is empty! Add items before previewing invoice.', 'warning');
      return;
    }

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Previewed Sales Cart Invoice',
      `Previewed cart invoice with ${cart.length} items totaling ${formatNaira(cartSubtotal)} for customer ${selectedCustomer?.fullName || 'Walk-in'}.`
    );

    setIsCartPreviewOpen(true);
  };

  // Final Checkout Execution — supports saveOnly vs printAndSave
  const handleCheckout = (opts?: { saveOnly?: boolean }) => {
    if (cart.length === 0) {
      showToast('Cart is empty! Add items before completing sale.', 'warning');
      return;
    }

    // v2.0.6 trusted clock: a non-admin override session keeps trading. The
    // sale is recorded normally and tagged for the ADMIN; without an override
    // a genuine mid-session rollback still refuses the sale and signs out.
    const overrideActive = hasActiveClockOverride();
    try {
      const gate = getClockGate();
      if (!gate.ok) {
        if (!overrideActive) {
          try {
            refreshGate();
          } catch {
            /* banner syncs on the next monitor tick */
          }
          recordAuditLog(
            currentUser,
            currentUserRole,
            'Blocked Sale — System Clock Tamper',
            `Checkout of ${cart.length} item(s) refused. ${gate.reason}`
          );
          showToast('Sales are blocked: the system clock was changed by more than 30 minutes. You are being signed out.', 'error');
          try {
            signalClockLogout();
          } catch {
            /* App shell performs the actual sign-out */
          }
          return;
        }
        recordAuditLog(
          currentUser,
          currentUserRole,
          'Checkout Under Clock Override',
          `Checkout of ${cart.length} item(s) allowed under FLASHALERT. ${gate.reason} The sale will be tagged and must be reconciled by an ADMIN.`
        );
      }
    } catch {}

    let totalAmount = cartSubtotal;
    // For Cash + Transfer, amounts are entered manually; otherwise advance is total (or 0 for debt)
    let effectiveAdvance = advancePayment;
    let cashAmt: number | undefined;
    let transferAmt: number | undefined;
    let note: string | undefined;
    if (paymentMethod === 'Cash + Transfer') {
      cashAmt = Math.max(0, cashAmount || 0);
      transferAmt = Math.max(0, transferAmount || 0);
      effectiveAdvance = cashAmt + transferAmt;
      note = paymentNote.trim() || undefined;
      // Build mini report note if user left it empty but there's overpay/underpay
      if (!note) {
        const diff = effectiveAdvance - totalAmount;
        if (diff > 0) note = `Over-transfer ${formatNaira(diff)} given as cash change`;
        else if (diff < 0) note = `Balance due ${formatNaira(Math.abs(diff))}`;
      }
    } else if (paymentMethod === 'Store Credit / Account') {
      effectiveAdvance = 0;
    } else {
      effectiveAdvance = totalAmount;
    }
    let balanceDue = totalAmount - effectiveAdvance; // can be negative for overpay change

    let newSale: SaleRecord = {
      id: `sale-${Date.now()}`,
      receiptNo: `RCT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      items: cart,
      subtotal: totalAmount,
      totalAmount,
      advancePayment: effectiveAdvance,
      balanceDue,
      paymentMethod: paymentMethod as any,
      cashAmount: cashAmt,
      transferAmount: transferAmt,
      paymentNote: note,
      priceType: 'retail',
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.fullName || 'General Customer',
      customerPhone: selectedCustomer?.phone || 'N/A',
      pointsEarned: 0,
      cashier: currentUser,
      date: new Date().toLocaleDateString('en-CA'),
      time: new Date().toLocaleTimeString('en-GB'),
      timestamp: Date.now(),
      currency: getCurrencyCode(),
      clockOverride: overrideActive || undefined,
    };

    (onCompleteSale as any)(newSale, { saveOnly: !!opts?.saveOnly });

    // Record activity audit log
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Completed Checkout Sale',
      `Processed receipt ${newSale.receiptNo} totaling ${formatNaira(totalAmount)} via ${paymentMethod}${opts?.saveOnly ? ' (saved only, no print)' : ' (print & save)'}.`
    );
    if (overrideActive) {
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Sale Completed Under Clock Override',
        `Receipt ${newSale.receiptNo} (${formatNaira(totalAmount)}) was completed while the system clock was unverified. ` +
        `Stock and cash moved normally; this sale is tagged for ADMIN reconciliation when the clock is verified.`
      );
    }

    setCart([]);
    setAdvancePayment(0);
    setCashAmount(0);
    setTransferAmount(0);
    setPaymentNote('');
    setIsCartPreviewOpen(false);
    playPOSBeep();
    if (opts?.saveOnly) {
      showToast(`Sale saved (no print) — ${newSale.receiptNo} recorded. Export as PDF/PNG from Sales if needed.`, 'success');
    } else {
      showToast(`Sale completed — ${newSale.receiptNo} saved and ready to print.`, 'success');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] font-sans text-[#e2e8f0]">
      {/* v2.0.6 trusted clock: override sessions keep selling; the persistent
          top FLASHALERT carries the ADMIN awareness warning. */}
      {clockBlockedMsg && (
        <div
          className={
            clockOverrideActive
              ? 'w-full shrink-0 bg-amber-950/90 border border-amber-500/60 rounded-2xl p-4 text-amber-100 shadow-xl'
              : 'w-full shrink-0 bg-red-950/90 border border-red-500/60 rounded-2xl p-4 text-red-100 shadow-xl'
          }
        >
          <div className="font-black text-sm">
            {clockOverrideActive
              ? '⚠ Clock unverified — sales continue under FLASHALERT'
              : '⛔ Sales blocked — possible system clock problem'}
          </div>
          <p className={`text-xs mt-1 ${clockOverrideActive ? 'text-amber-200/90' : 'text-red-200/90'}`}>
            {clockOverrideActive
              ? 'This session is allowed to sell. Every sale is recorded and tagged in the audit trail so the ADMIN can reconcile stock and cash when they return.'
              : 'There is a possible problem with the system clock, or the date and time have been tampered with. Make sure the date and time are correct.'}
          </p>
          <p className={`text-xs mt-1 ${clockOverrideActive ? 'text-amber-200/90' : 'text-red-200/90'}`}>{clockBlockedMsg}</p>
          <p className={`text-xs mt-1 ${clockOverrideActive ? 'text-amber-200/80' : 'text-red-200/90'}`}>
            {clockOverrideActive
              ? 'The FLASHALERT stays on screen after logout and restart until an ADMIN verifies the clock.'
              : 'Correct the computer date/time, then try again. While it stands, sales, receipts and reports cannot be trusted.'}
          </p>
        </div>
      )}
      <div className="flex flex-col xl:flex-row gap-6 flex-1">
      {/* LEFT PANEL: Visual Product Selector Grid & Filters */}
      <div className="w-full xl:w-7/12 flex flex-col gap-4">
        {/* Search & Category Filter Header */}
        <div className="pos-dark-section bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm space-y-3">
          {/* Barcode / Name Search Input */}
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-cyan-400" />
            <form onSubmit={handleBarcodeSubmit}>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Type product or service name, unit or scan barcode..."
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                className="w-full pl-11 pr-12 py-3 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-input)] text-sm font-bold text-[var(--text-primary)] focus:border-cyan-500 outline-none transition shadow-inner"
              />
            </form>
            <button
              type="button"
              onClick={focusScanner}
              title="Focus scanner input"
              className="absolute right-2.5 top-2 p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 hover:bg-cyan-900/70 hover:text-cyan-100 transition active:scale-95"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Category Filter Pills (dynamic from store categories + colors) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {['All', ...categories.map((c) => c.name)].map((cat) => {
              const catObj = categories.find(
                (c) => c.name.toLowerCase() === cat.toLowerCase()
              );
              const isActive =
                cat === 'All'
                  ? !barcodeQuery
                  : barcodeQuery.toLowerCase() === cat.toLowerCase();
              const pillColor = catObj ? catObj.color || '#6366f1' : '#6366f1';
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    if (cat === 'All') setBarcodeQuery('');
                    else setBarcodeQuery(cat);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition border min-w-max flex items-center gap-1.5 ${
                    isActive
                      ? 'text-white shadow-md'
                      : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'
                  }`}
                  style={isActive ? { backgroundColor: pillColor, borderColor: pillColor } : undefined}
                >
                  {cat !== 'All' && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: pillColor }}
                    ></span>
                  )}
                  {cat === 'All' ? 'ALL PRODUCTS' : cat.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visual Product Selector — stays GRID (stock grid unchanged) */}
        <div className="pos-dark-section bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm flex-1 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 border-b border-[#30363d] pb-2 gap-2">
            <h3 className="font-black text-sm text-white tracking-wide flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" />
              <span>TAP ANY ITEM TO ADD TO BILL</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase hidden sm:inline">
                {productViewMode === 'list' ? 'List' : 'Grid'} • {filteredProducts.length} shown
              </span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 bg-[#0d1117] px-2.5 py-1 rounded-lg border border-[#30363d]">
                {products.length} Items
              </span>
              {/* Grid/List toggle — List by default, Grid still useful for 1B via pagination */}
              <div className="flex rounded-lg overflow-hidden border border-[#30363d]">
                <button
                  type="button"
                  onClick={() => setProductViewMode('list')}
                  className={`px-2.5 py-1 text-xs font-black flex items-center gap-1 ${productViewMode === 'list' ? 'bg-cyan-600 text-white' : 'bg-[#0d1117] text-slate-400 hover:bg-[#21262d]'}`}
                >
                  <Table2 className="w-3.5 h-3.5" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setProductViewMode('grid')}
                  className={`px-2.5 py-1 text-xs font-black flex items-center gap-1 ${productViewMode === 'grid' ? 'bg-cyan-600 text-white' : 'bg-[#0d1117] text-slate-400 hover:bg-[#21262d]'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grid
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowProducts((v) => !v)}
                className={`text-xs font-bold px-3 py-1 rounded-lg border transition ${showProducts ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'}`}
              >
                {showProducts ? 'Hide Products' : 'Show Products'}
              </button>
              {cart.length > 3 && !isTableMode && (
                <button
                  type="button"
                  onClick={() => setIsTableMode(true)}
                  className="text-xs font-bold px-3 py-1 rounded-lg border bg-cyan-600 text-white border-cyan-500 flex items-center gap-1"
                >
                  <Table2 className="w-3.5 h-3.5" /> View Bill Table
                </button>
              )}
            </div>
          </div>

          {/* Products hidden by default until searched (smart 2-letter) — Grid/List toggle, paginated to 1B */}
          {!(showProducts || barcodeQuery.trim()) ? (
            <div className="py-10 text-center border-2 border-dashed border-[#30363d] rounded-2xl bg-[#0d1117]">
              <Package className="w-10 h-10 stroke-1 text-slate-600 mx-auto mb-2" />
              <p className="font-black text-sm text-slate-300">Products hidden</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Type 2 letters to smart-search or click <strong className="text-cyan-400">Show Products</strong> to browse. List view is default; Grid paginates to 1B.</p>
              <button type="button" onClick={() => setShowProducts(true)} className="mt-3 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold">
                Show Products ({productViewMode === 'list' ? 'List' : 'Grid'})
              </button>
            </div>
          ) : barcodeQuery.trim().length === 1 ? (
            <div className="py-8 text-center border border-[var(--border-color)] bg-[var(--bg-app)] rounded-xl text-xs font-bold text-[var(--text-muted)]">
              Type at least 2 letters for smart search — only products starting with those letters will show.
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-8 text-center border border-[var(--border-color)] bg-[var(--bg-app)] rounded-xl text-xs font-bold text-[var(--text-muted)]">
              No products match “{barcodeQuery}” — try another prefix or category.
            </div>
          ) : productViewMode === 'list' ? (
            // List view (default) — table, paginated, works for 1B
            <div className="flex flex-col gap-2">
              <div className="rounded-xl border border-[var(--border-color)] overflow-hidden bg-[var(--bg-surface)]">
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--accent-color)] text-white font-black uppercase text-[11px] tracking-wider">
                        <th className="py-2.5 px-3">S/N</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Price</th>
                        <th className="py-2.5 px-3 text-center">Unit</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                        <th className="py-2.5 px-3 text-center">Add</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedGridProducts.map((p, idx) => {
                        const stockStatus = getStockStatus(p);
                        const stockColor = getStockColor(stockStatus);
                        const catColor = getCategoryColor(p);
                        const isOut = stockStatus === 'out';
                        const sn = (gridPage - 1) * GRID_PAGE_SIZE + idx + 1;
                        return (
                          <tr key={p.id} className={`border-b border-[var(--border-color)] last:border-0 ${idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-app)]'} hover:bg-[var(--bg-hover)] transition`}>
                            <td className="py-2.5 px-3 font-bold text-[var(--text-muted)]">{sn}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor }}></span>
                                <span className="truncate max-w-[180px]" title={p.name}>{p.name}</span>
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[180px]">{p.barcode}</div>
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">{p.category}</td>
                            <td className="py-2.5 px-3 text-right font-black text-[var(--accent-color)]">
                              {formatRange(p)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px] text-[var(--text-muted)]">{p.unit}</td>
                            <td className="py-2.5 px-3 text-center"><span className="inline-flex px-2 py-1 rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: stockColor }}>{isOut ? 'OUT' : p.stockQty}</span></td>
                            <td className="py-2.5 px-3 text-center">
                              <button onClick={() => requestAddToCart(p, 1)} className="px-3 py-1 rounded-lg text-xs font-black bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white">+ Add</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Pagination for List — handles 1B */}
              {totalGridPages > 1 && (
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-[var(--text-muted)]">
                  <span>{filteredProducts.length} total • Page {gridPage} / {totalGridPages}</span>
                  <div className="flex gap-1.5">
                    <button disabled={gridPage === 1} onClick={() => setGridPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] disabled:opacity-40">Prev</button>
                    <button disabled={gridPage === totalGridPages} onClick={() => setGridPage((p) => Math.min(totalGridPages, p + 1))} className="px-3 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--accent-color)] text-white disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Grid view — fixed card height, pagination prevents 368 DOM collapse to lines
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-y-auto max-h-[600px] min-h-[200px] p-1 content-start">
              {paginatedGridProducts.map((p) => {
                const stockStatus = getStockStatus(p);
                const stockColor = getStockColor(stockStatus);
                const catColor = getCategoryColor(p);
                const isOut = stockStatus === 'out';

                return (
                  <div
                    key={p.id}
                    onClick={() => requestAddToCart(p, 1)}
                    title={p.name}
                    className={`pos-grid-card group relative rounded-2xl flex flex-col overflow-hidden min-h-[148px] cursor-pointer transition-all duration-150 hover:shadow-xl active:scale-[0.98]`}
                    style={{
                      borderLeft: `4px solid ${stockColor}`,
                      borderTop: `3px solid ${catColor}`,
                      borderRight: `2px solid ${catColor}`,
                      borderBottom: `2px solid ${catColor}`,
                      background: '#131a27',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                      opacity: isOut ? 0.72 : 1,
                      minHeight: '148px',
                      contain: 'layout paint',
                    }}
                  >
                    <div className="w-full h-1.5 shrink-0" style={{ backgroundColor: catColor }} />
                    <div className="w-full px-3.5 pt-2 pb-1 flex-1 flex items-start justify-center text-center">
                      <h4 className="font-semibold text-[13px] leading-[1.35] text-white group-hover:text-cyan-300 transition [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden break-words w-full">
                        {p.name}
                      </h4>
                    </div>
                    <div className="w-full px-3 pb-1 text-center shrink-0">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[12px] font-black text-white shadow-sm whitespace-nowrap max-w-[90%] truncate" style={{ backgroundColor: catColor }} title={formatRange(p)}>
                        {formatRange(p)}
                      </span>
                      <div className="text-[10px] font-bold text-slate-400 mt-1 truncate" title={p.unit}>{p.unit}</div>
                    </div>
                    <div className="w-full pb-2 pt-1 flex items-center justify-center min-h-[28px] shrink-0">
                      {isOut ? (
                        <span className="w-full mx-2 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full text-[10px] font-black text-white tracking-wide" style={{ backgroundColor: stockColor }}>
                          ⛔ OUT OF STOCK
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-bold text-white min-w-[36px]" style={{ backgroundColor: stockColor }}>
                          {p.stockQty}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
              {/* Pagination for Grid — handles 1B */}
              {totalGridPages > 1 && (
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-[var(--text-muted)]">
                  <span>{filteredProducts.length} total • Page {gridPage} / {totalGridPages}</span>
                  <div className="flex gap-1.5">
                    <button disabled={gridPage === 1} onClick={() => setGridPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] disabled:opacity-40">Prev</button>
                    <button disabled={gridPage === totalGridPages} onClick={() => setGridPage((p) => Math.min(totalGridPages, p + 1))} className="px-3 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--accent-color)] text-white disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Customer's Bill / Cart & Super Easy Checkout */}
      <div className="w-full xl:w-5/12 flex flex-col gap-4">
        {/* Pricing Mode Toggle & Customer Select */}
        <div className="pos-dark-section bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm space-y-3">
          {/* Customer Selector */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-black text-slate-300 uppercase">
                1. Select Customer:
              </label>
              <button
                type="button"
                onClick={onOpenCustomerModal}
                className="text-xs font-bold text-cyan-400 hover:underline"
              >
                + Register New Customer
              </button>
            </div>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-extrabold text-white focus:border-cyan-500 outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#161b22] text-white">
                  {c.fullName} ({c.phone || 'No phone'}) - Debt: {formatNaira(c.balance)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="pos-dark-section bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm flex-1 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#30363d] mb-3">
              <h3 className="font-black text-sm text-white tracking-wide flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-cyan-400" />
                <span>CUSTOMER BILL ({cart.length} ITEMS)</span>
              </h3>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-bold text-rose-400 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items — Cards (scrollable; full dataset table shows in subpage when >3 items) */}
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-500 border-2 border-dashed border-[#30363d] rounded-2xl">
                  <ShoppingCart className="w-10 h-10 stroke-1 text-slate-600 mx-auto mb-2" />
                  <p className="font-black text-sm text-slate-300">Bill is currently empty</p>
                  <p className="text-xs text-slate-500 mt-1">Tap any product on the left to add it to bill!</p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0d1117] border border-[#30363d] p-3 rounded-xl flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h5 className="font-extrabold text-xs text-white truncate">{item.product.name}</h5>
                        <div className="text-[10px] text-slate-500 font-bold">
                          {item.ceilingAtSale >= NO_CEILING ? 'No max (min price set)' : `Max ${formatNaira(item.ceilingAtSale)}`} • Qty price auto-checked
                          {item.allowNegativeStock && <span className="text-amber-400"> • selling at negative stock</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItemFromCart(idx)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/60 transition shrink-0"
                        title="Delete Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Qty ({item.product.unit})</label>
                        <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-[#30363d]">
                          <button type="button" onClick={() => updateCartQuantity(idx, item.quantity - 1)} className="w-7 h-7 rounded-md bg-[#21262d] hover:bg-[#30363d] text-white font-black text-sm flex items-center justify-center">-</button>
                          <QtyInput
                            value={item.quantity}
                            onChange={(n) => updateCartQuantity(idx, n)}
                            aria-label={`Quantity for ${item.product.name}`}
                            className="flex-1 min-w-0 text-center bg-transparent text-sm font-black text-white outline-none rounded-md py-1 focus:bg-[#0d1117]"
                          />
                          <button type="button" onClick={() => updateCartQuantity(idx, item.quantity + 1)} className="w-7 h-7 rounded-md bg-[#21262d] hover:bg-[#30363d] text-white font-black text-sm flex items-center justify-center">+</button>
                        </div>
                      </div>
                      <div className="col-span-4">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Unit Price ({curSym})</label>
                        <NumberInput value={item.rate} min={0} onValueChange={(n)=> updateCartRate(idx, n)} className="w-full px-2 py-1.5 rounded-lg border border-[#30363d] bg-[#161b22] text-white text-xs font-bold outline-none focus:border-cyan-500" />
                        <span className="text-[9px] text-slate-500">{item.ceilingAtSale >= NO_CEILING ? 'No max' : `≤ ${formatNaira(item.ceilingAtSale)}`}</span>
                      </div>
                      <div className="col-span-4 text-right">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Amount</label>
                        <div className="text-xs font-black text-cyan-400 bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1.5">{formatNaira(item.amount)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cart.length > 3 && (
              <button type="button" onClick={() => setIsTableMode(true)} className="mt-2 w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs flex items-center justify-center gap-2">
                <Table2 className="w-4 h-4" /> View Full Bill Table ({cart.length} items — S/N, Product, Qty, Price, Total)
              </button>
            )}
          </div>

          {/* Payment Method Selector & Giant Finish Button */}
          <div className="pt-3 border-t border-[#30363d] space-y-3">
            {/* Payment Mode Selector Tiles */}
            <div>
              <label className="block text-xs font-black text-slate-300 uppercase mb-1.5">
                2. Choose Payment Method:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Cash', label: '💵 CASH' },
                  { name: 'Transfer', label: '📱 TRANSFER (USSD/App)' },
                  { name: 'POS/Card', label: '💳 POS / CARD' },
                  { name: 'Cash + Transfer', label: '💵+📱 CASH + TRANSFER' },
                  { name: 'Store Credit / Account', label: '📝 DEBT / CREDIT' },
                ].map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => setPaymentMethod(m.name as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition border text-left ${
                      paymentMethod === m.name
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                        : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Cash + Transfer split inputs */}
              {paymentMethod === 'Cash + Transfer' && (
                <div className="mt-3 p-3 rounded-xl bg-[#0d1117] border border-emerald-800/40 space-y-3">
                  <p className="text-[11px] font-bold text-emerald-300 uppercase">Split Payment — enter both amounts manually</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cash Paid ({curSym})</label>
                      <NumberInput
                        min={0}
                        placeholder="0"
                        value={cashAmount}
                        onValueChange={(n) => setCashAmount(Math.max(0, n))}
                        className="w-full px-3 py-2 rounded-lg border border-[#30363d] bg-[#161b22] text-white text-sm font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Transfer Paid ({curSym})</label>
                      <NumberInput
                        min={0}
                        placeholder="0"
                        value={transferAmount}
                        onValueChange={(n) => setTransferAmount(Math.max(0, n))}
                        className="w-full px-3 py-2 rounded-lg border border-[#30363d] bg-[#161b22] text-white text-sm font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mini Report / Note (optional)</label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="e.g. Over-transfer N2,000 given as cash change"
                      className="w-full px-3 py-2 rounded-lg border border-[#30363d] bg-[#161b22] text-white text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                  {/* Mini transaction report */}
                  <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-2.5 text-xs space-y-1">
                    <div className="flex justify-between text-slate-400"><span>Total Bill:</span><span className="font-bold text-white">{formatNaira(cartSubtotal)}</span></div>
                    <div className="flex justify-between text-slate-400"><span>Cash:</span><span className="font-bold text-emerald-400">{formatNaira(cashAmount || 0)}</span></div>
                    <div className="flex justify-between text-slate-400"><span>Transfer:</span><span className="font-bold text-cyan-400">{formatNaira(transferAmount || 0)}</span></div>
                    <div className="flex justify-between text-slate-300 border-t border-[#30363d] pt-1"><span>Paid Total:</span><span className="font-black text-white">{formatNaira((cashAmount || 0) + (transferAmount || 0))}</span></div>
                    <div className={`flex justify-between font-black ${((cashAmount || 0) + (transferAmount || 0)) - cartSubtotal < 0 ? 'text-amber-400' : ((cashAmount || 0) + (transferAmount || 0)) - cartSubtotal > 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                      <span>{((cashAmount || 0) + (transferAmount || 0)) - cartSubtotal > 0 ? 'Change / Overpay:' : ((cashAmount || 0) + (transferAmount || 0)) - cartSubtotal < 0 ? 'Balance Due:' : 'Balanced:'}</span>
                      <span>{formatNaira(Math.abs(((cashAmount || 0) + (transferAmount || 0)) - cartSubtotal))}</span>
                    </div>
                    {paymentNote.trim() && <div className="text-[11px] text-amber-300 italic border-t border-[#30363d] pt-1">Note: {paymentNote}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Total Amount Display */}
            <div className="bg-[#0d1117] p-3.5 rounded-2xl border border-[#30363d] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase block">Total Bill Amount:</span>
                <span className="text-2xl font-black text-emerald-400 tracking-tight">
                  {formatNaira(cartSubtotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenCartPreview}
                disabled={cart.length === 0}
                className="px-3.5 py-2 rounded-xl bg-[#21262d] border border-[#30363d] text-cyan-300 font-extrabold text-xs hover:bg-[#30363d] transition disabled:opacity-50"
              >
                👁️ Preview Receipt
              </button>
            </div>

            {/* Save / Print Actions — customer may not need receipt */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleCheckout({ saveOnly: true })}
                disabled={cart.length === 0}
                className={`py-3.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2 border ${
                  cart.length === 0
                    ? 'bg-[#21262d] text-slate-500 border-[#30363d] cursor-not-allowed'
                    : 'bg-[#21262d] hover:bg-[#30363d] text-slate-200 border-[#30363d] hover:border-slate-500'
                }`}
                title="Save to records only — no print. Export as PDF/PNG later from Sales if needed."
              >
                <span>💾 Save Only</span>
              </button>
              <button
                type="button"
                onClick={() => handleCheckout()}
                disabled={cart.length === 0}
                className={`py-3.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-xl transition flex items-center justify-center gap-2 ${
                  cart.length === 0
                    ? 'bg-[#21262d] text-slate-500 border border-[#30363d] cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-4 ring-emerald-500/30 active:scale-98'
                }`}
              >
                <Printer className="w-5 h-5" />
                <span>Print & Save</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center">Save Only records the sale (default). Print & Save also opens the receipt for printing. PDFs/PNGs can be exported later from Sales → Reprint.</p>
          </div>
        </div>
      </div>

      {/* Cart Preview Modal */}
      <CartPreviewModal
        isOpen={isCartPreviewOpen}
        onClose={() => setIsCartPreviewOpen(false)}
        cart={cart}
        priceType="retail"
        selectedCustomer={selectedCustomer}
        paymentMethod={paymentMethod}
        advancePayment={advancePayment}
        cashierName={currentUser}
        printerConfig={printerConfig}
        onConfirmCheckout={handleCheckout}
      />

      {/* Full-screen Customer Bill Dataset Preview — subpage of Sell Service */}
      {/* Auto-opens when bill >3 items; search at top picks inventory while full bill table stays visible */}
      {isTableMode && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden animate-fadeIn">
          {/* Top bar */}
          <div className="shrink-0 bg-[var(--bg-header)] border-b border-[var(--border-color)] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                <Table2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-sm text-[var(--text-primary)]">Customer Bill — Dataset Preview</h2>
                <p className="text-xs text-[var(--text-muted)]">{cart.length} items • Total {formatNaira(cartSubtotal)} • Search inventory at top while bill stays visible</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsTableMode(false)} className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] font-bold text-xs flex items-center gap-2 hover:bg-[var(--bg-hover)]">
              <ArrowLeft className="w-4 h-4" /> Back to Sell Service
            </button>
          </div>

          {/* Search + Barcode search — both on page, products hidden by default for full bill view */}
          <div className="shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-4 md:px-6 py-3 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
                <input
                  ref={overlaySearchRef}
                  type="text"
                  placeholder="Search product name or category (type 2 letters)..."
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  onFocus={() => { if (barcodeQuery.trim().length >= 2) setShowOverlayProducts(true); }}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-color)] outline-none"
                />
              </div>
              <div className="relative flex-1 flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Scan / enter barcode..."
                    value={barcodeQuery}
                    onChange={(e) => setBarcodeQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (handleBarcodeSubmit as any)(e); }}}
                    onFocus={() => { if (barcodeQuery.trim().length >= 2) setShowOverlayProducts(true); }}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-color)] outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { overlaySearchRef.current?.focus(); setShowOverlayProducts(true); showToast('Scanner ready — scan barcode now.', 'info'); }}
                  className="px-3 py-2.5 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-black text-xs flex items-center gap-1.5 shrink-0"
                  title="Focus barcode scanner"
                >
                  <ScanBarcode className="w-4 h-4" /> Scan
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--text-muted)]">
                {showOverlayProducts ? 'Inventory picks — tap + Add while bill stays visible' : 'Products hidden — bill fully visible without scroll'}
              </label>
              <button
                type="button"
                onClick={() => setShowOverlayProducts((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border transition ${showOverlayProducts ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]' : 'bg-[var(--bg-app)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)]'}`}
              >
                {showOverlayProducts ? 'Hide Products' : 'Show Products'}
              </button>
            </div>
            {showOverlayProducts && (() => {
              const qRaw = barcodeQuery.trim();
              // Smart search: remain hidden until 2 letters typed
              if (qRaw.length < 2) {
                return (
                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] py-6 text-center text-xs text-[var(--text-muted)] font-bold">
                    Type at least 2 letters to see products (smart search).
                  </div>
                );
              }
              const q = qRaw.toLowerCase();
              const q2 = q.slice(0, 2);
              const filtered = products.filter((p) => {
                // Only products whose first two letters match typed prefix (smart search)
                const name2 = p.name.toLowerCase().slice(0, 2);
                const cat2 = p.category.toLowerCase().slice(0, 2);
                return name2 === q2 || cat2 === q2 || p.barcode.startsWith(qRaw) || p.name.toLowerCase().startsWith(q) || p.category.toLowerCase().startsWith(q);
              }).slice(0, 12);
              if (filtered.length === 0) {
                return (
                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] py-6 text-center text-xs text-[var(--text-muted)] font-bold">
                    No products match “{barcodeQuery}”.
                  </div>
                );
              }
              return (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] divide-y divide-[var(--border-color)] max-h-[220px] overflow-y-auto">
                  {filtered.map((p) => {
                    const isOut = p.stockQty <= 0;
                    const catColor = getCategoryColor(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => requestAddToCart(p, 1)}
                        className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-hover)] transition"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor }}></span>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[var(--text-primary)] truncate">{p.name}</div>
                            <div className="text-[11px] text-[var(--text-muted)]">{p.category} • {p.barcode} • Stock: <strong className={isOut ? 'text-red-500' : 'text-emerald-600'}>{p.stockQty}</strong></div>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="font-black text-sm text-[var(--accent-color)]">{formatRange(p)}</span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-[var(--accent-color)] text-white">+ Add</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Bill dataset table — S/N, Product, Quantity, Price, Total — thematic — fully visible when products hidden */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden bg-[var(--bg-surface)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--accent-color)] text-white font-black uppercase text-xs tracking-wider">
                      <th className="py-3 px-4">S/N</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 text-center">Quantity</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-center">—</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => (
                      <tr key={idx} className={`border-b border-[var(--border-color)] last:border-0 ${idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-app)]'} hover:bg-[var(--bg-hover)] transition`}>
                        <td className="py-3 px-4 font-bold text-[var(--text-muted)]">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[var(--text-primary)]">{item.product.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] uppercase">{item.product.category} • {item.product.unit}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => updateCartQuantity(idx, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-primary)] font-black">-</button>
                            <QtyInput
                              value={item.quantity}
                              onChange={(n) => updateCartQuantity(idx, n)}
                              aria-label={`Quantity for ${item.product.name}`}
                              className="w-12 px-1 py-1 text-center font-black text-sm text-[var(--text-primary)] bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg outline-none focus:border-[var(--accent-color)]"
                            />
                            <button type="button" onClick={() => updateCartQuantity(idx, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-primary)] font-black">+</button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <NumberInput value={item.rate} min={0} onValueChange={(n)=>updateCartRate(idx,n)} className="w-28 ml-auto px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-bold text-right outline-none focus:border-[var(--accent-color)]" />
                          <div className="text-[9px] text-[var(--text-muted)]">{item.ceilingAtSale >= NO_CEILING ? 'No max' : `Max ${formatNaira(item.ceilingAtSale)}`}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-[var(--accent-color)]">{formatNaira(item.amount)}</td>
                        <td className="py-3 px-4 text-center">
                          <button type="button" onClick={() => removeItemFromCart(idx)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10" title="Remove"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--bg-app)] border-t-2 border-[var(--accent-color)] font-black">
                      <td colSpan={2} className="py-3 px-4 text-right text-[var(--text-secondary)]">TOTAL</td>
                      <td className="py-3 px-4 text-center text-[var(--text-primary)]">{cart.reduce((s,i)=>s+i.quantity,0)}</td>
                      <td className="py-3 px-4 text-right text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-4 text-right text-[var(--accent-color)] text-base">{formatNaira(cartSubtotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom professional action bar */}
          <div className="shrink-0 bg-[var(--bg-header)] border-t border-[var(--border-color)] px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button type="button" onClick={() => setIsTableMode(false)} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-secondary)] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[var(--bg-hover)]">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex gap-3 w-full sm:w-auto">
              <button type="button" onClick={() => { handleCheckout({ saveOnly: true }); setIsTableMode(false); }} disabled={cart.length===0} className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-sm border ${cart.length===0?'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-color)] opacity-50':'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)]'}`}>💾 Save</button>
              <button type="button" onClick={() => handleCheckout()} disabled={cart.length===0} className={`flex-1 sm:flex-none px-8 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 ${cart.length===0?'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-color)] opacity-50':'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'}`}><Printer className="w-5 h-5" /> Print & Save</button>
            </div>
          </div>
        </div>
      )}

      {depletedPrompt && (
        <DepletedStockPopup
          product={depletedPrompt.product}
          requestedQty={depletedPrompt.qty}
          canManageStock={canManageStock}
          onAddStock={handleDepletedAddStock}
          onSellAnyway={handleDepletedSellAnyway}
          onClose={() => setDepletedPrompt(null)}
        />
      )}

      <StockAdjustModal
        product={restockForSale?.product ?? null}
        onClose={() => setRestockForSale(null)}
        onSave={handleRestockForSale}
      />
      </div>
    </div>
  );
};
