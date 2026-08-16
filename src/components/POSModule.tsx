import React from 'react';
import { Search, Trash2, ShoppingCart, Printer, Package, ScanBarcode } from 'lucide-react';
import { Product, Customer, CartItem, SaleRecord, ThermalPrinterConfig, UserRole, Category } from '../types';
import { formatNaira, playPOSBeep, recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';
import { CartPreviewModal } from './CartPreviewModal';

interface POSModuleProps {
  products: Product[];
  customers: Customer[];
  categories?: Category[];
  printerConfig: ThermalPrinterConfig;
  currentUser: string;
  currentUserRole: UserRole;
  onCompleteSale: (sale: SaleRecord) => void;
  onOpenCustomerModal: () => void;
}

export const POSModule: React.FC<POSModuleProps> = ({
  products,
  customers,
  categories = [],
  printerConfig,
  currentUser,
  currentUserRole,
  onCompleteSale,
  onOpenCustomerModal,
}) => {
  const { showToast } = useToast();

  const [barcodeQuery, setBarcodeQuery] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState<string>(products[0]?.id || '');
  const [quantity, setQuantity] = React.useState<number>(1);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string>(customers[0]?.id || '');
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [advancePayment, setAdvancePayment] = React.useState<number>(0);
  const [paymentMethod, setPaymentMethod] = React.useState<'Cash' | 'POS Transfer' | 'Store Credit / Account'>('Cash');
  const [isCartPreviewOpen, setIsCartPreviewOpen] = React.useState(false);
  const barcodeInputRef = React.useRef<HTMLInputElement>(null);

  // Category color lookup — products are classified by category color.
  const categoryColorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.name.toLowerCase(), c.color || '#6366f1'));
    return map;
  }, [categories]);

  // Stock status: green = healthy, orange = low, red = depleted/out of stock.
  const getStockStatus = (p: Product): 'good' | 'low' | 'out' => {
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
    setAdvancePayment(cartSubtotal);
  }, [cartSubtotal]);

  // Handle barcode scanner search
  const handleBarcodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeQuery.trim()) return;

    let matched = products.find(
      (p) => p.barcode === barcodeQuery.trim() || p.name.toLowerCase().includes(barcodeQuery.toLowerCase())
    );

    if (matched) {
      setSelectedProductId(matched.id);
      playPOSBeep();
      if (matched.barcode === barcodeQuery.trim()) {
        addItemToCart(matched, quantity);
        setBarcodeQuery('');
        // Keep focus on the scan field so the next item can be scanned immediately.
        barcodeInputRef.current?.focus();
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

  const addItemToCart = (prod: Product, qty: number) => {
    if (!prod) return;
    if (qty <= 0) return;

    let rate = prod.retailPrice;
    playPOSBeep();

    setCart((prev) => {
      let existingIdx = prev.findIndex((item) => item.product.id === prod.id);
      if (existingIdx > -1) {
        let updated = [...prev];
        let newQty = updated[existingIdx].quantity + qty;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          amount: newQty * rate,
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
            amount: qty * rate,
          },
        ];
      }
    });

    showToast(`Added ${qty} ${prod.unit} of ${prod.name} to cart.`, 'success');
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
    setCart((prev) => {
      let updated = [...prev];
      let item = updated[index];
      updated[index] = {
        ...item,
        quantity: newQty,
        amount: newQty * item.rate,
      };
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

  // Final Checkout Execution
  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('Cart is empty! Add items before completing sale.', 'warning');
      return;
    }

    let totalAmount = cartSubtotal;
    let balanceDue = Math.max(0, totalAmount - advancePayment);
    let pointsEarned = Math.floor((totalAmount / 1000) * (printerConfig.pointRate || 2));

    let newSale: SaleRecord = {
      id: `sale-${Date.now()}`,
      receiptNo: `JM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      items: cart,
      subtotal: totalAmount,
      totalAmount,
      advancePayment,
      balanceDue,
      paymentMethod,
      priceType: 'retail',
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.fullName || 'General Customer',
      customerPhone: selectedCustomer?.phone || 'N/A',
      pointsEarned,
      cashier: currentUser,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-GB'),
      timestamp: Date.now(),
    };

    onCompleteSale(newSale);

    // Record activity audit log
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Completed Checkout Sale',
      `Processed receipt ${newSale.receiptNo} totaling ${formatNaira(totalAmount)} via ${paymentMethod}.`
    );

    setCart([]);
    setAdvancePayment(0);
    setIsCartPreviewOpen(false);
    playPOSBeep();
    showToast(`Sale completed successfully! Receipt ${newSale.receiptNo} sent to thermal printer.`, 'success');
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] font-sans text-[#e2e8f0]">
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
                placeholder="Type product name or scan barcode..."
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

        {/* Visual Product Grid (Tap Any Product To Add To Bill!) */}
        <div className="pos-dark-section bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3 border-b border-[#30363d] pb-2">
            <h3 className="font-black text-sm text-white tracking-wide flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" />
              <span>TAP ANY ITEM TO ADD TO BILL</span>
            </h3>
            <span className="text-xs font-bold text-slate-400 bg-[#0d1117] px-2.5 py-1 rounded-lg border border-[#30363d]">
              {products.length} Items Available
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-y-auto max-h-[600px] p-1">
            {products
              .filter((p) => {
                if (!barcodeQuery) return true;
                return (
                  p.name.toLowerCase().includes(barcodeQuery.toLowerCase()) ||
                  p.category.toLowerCase().includes(barcodeQuery.toLowerCase()) ||
                  p.barcode.includes(barcodeQuery)
                );
              })
              .map((p) => {
                const stockStatus = getStockStatus(p);
                const stockColor = getStockColor(stockStatus);
                const catColor = getCategoryColor(p);
                const isOut = stockStatus === 'out';

                return (
                  <div
                    key={p.id}
                    onClick={() => addItemToCart(p, 1)}
                    className="pos-grid-card group relative rounded-2xl cursor-pointer flex flex-col transition-all duration-150 hover:scale-[1.03] hover:shadow-xl active:scale-[0.98] overflow-hidden"
                    style={{
                      borderLeft: `4px solid ${stockColor}`,
                      borderTop: `3px solid ${catColor}`,
                      borderRight: `2px solid ${catColor}`,
                      borderBottom: `2px solid ${catColor}`,
                      background: '#131a27',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                      opacity: isOut ? 0.5 : 1,
                    }}
                  >
                    {/* Category Color Top Accent */}
                    <div
                      className="w-full h-1.5"
                      style={{ backgroundColor: catColor }}
                    />

                    {/* Product Name */}
                    <div className="w-full px-3.5 pt-3 pb-1 flex items-start justify-center text-center min-h-[64px]">
                      <h4 className="font-semibold text-[13px] leading-[1.4] line-clamp-3 text-white group-hover:text-cyan-300 transition">
                        {p.name}
                      </h4>
                    </div>

                    {/* Price */}
                    <div className="w-full px-3 pb-1 text-center">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-black text-white shadow-sm"
                        style={{ backgroundColor: catColor }}
                      >
                        {formatNaira(p.retailPrice)}
                      </span>
                    </div>

                    {/* Stock Badge */}
                    <div className="w-full pb-3 pt-1 flex items-center justify-center">
                      <span
                        className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-bold text-white min-w-[36px]"
                        style={{ backgroundColor: stockColor }}
                      >
                        {isOut ? 'OUT' : p.stockQty}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
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

            {/* Cart Items Table / Cards */}
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
                    className="bg-[#0d1117] border border-[#30363d] p-3 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h5 className="font-extrabold text-xs text-white truncate">{item.product.name}</h5>
                      <div className="text-[10px] text-slate-400 font-bold">
                        {formatNaira(item.rate)} × {item.quantity} ={' '}
                        <strong className="text-cyan-400 font-extrabold">{formatNaira(item.amount)}</strong>
                      </div>
                    </div>

                    {/* Quantity Adjustment Touch Buttons */}
                    <div className="flex items-center gap-1.5 bg-[#161b22] p-1 rounded-lg border border-[#30363d]">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(idx, item.quantity - 1)}
                        className="w-7 h-7 rounded-md bg-[#21262d] hover:bg-[#30363d] text-white font-black text-sm flex items-center justify-center transition"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-black text-sm text-white">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(idx, item.quantity + 1)}
                        className="w-7 h-7 rounded-md bg-[#21262d] hover:bg-[#30363d] text-white font-black text-sm flex items-center justify-center transition"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItemFromCart(idx)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/60 transition"
                      title="Delete Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
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
                  { name: 'POS Transfer', label: '💳 POS / CARD' },
                  { name: 'POS Transfer', label: '📱 TRANSFER' },
                  { name: 'Store Credit / Account', label: '📝 DEBT / CREDIT' },
                ].map((m, i) => (
                  <button
                    key={i}
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

            {/* Giant Green Complete Sale Button */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className={`w-full py-4 px-6 rounded-2xl font-black text-base uppercase tracking-wider shadow-xl transition flex items-center justify-center gap-3 ${
                cart.length === 0
                  ? 'bg-[#21262d] text-slate-500 border border-[#30363d] cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-4 ring-emerald-500/30 active:scale-98'
              }`}
            >
              <Printer className="w-6 h-6" />
              <span>PRINT RECEIPT & FINISH SALE ({formatNaira(cartSubtotal)})</span>
            </button>
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
    </div>
  );
};
