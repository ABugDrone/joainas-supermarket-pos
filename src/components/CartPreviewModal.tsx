import React from 'react';
import { HeaderLogo } from './HeaderLogo';
import { CartItem, Customer, PriceType, ThermalPrinterConfig } from '../types';
import { formatNaira } from '../utils/storage';
import { ShoppingCart, ArrowLeft, CheckCircle2, X } from 'lucide-react';

interface CartPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  priceType: PriceType;
  selectedCustomer: Customer | null;
  paymentMethod: string;
  advancePayment: number;
  cashierName: string;
  printerConfig: ThermalPrinterConfig;
  onConfirmCheckout: () => void;
}

export const CartPreviewModal: React.FC<CartPreviewModalProps> = ({
  isOpen,
  onClose,
  cart,
  priceType,
  selectedCustomer,
  paymentMethod,
  advancePayment,
  cashierName,
  printerConfig,
  onConfirmCheckout,
}) => {
  if (!isOpen) return null;

  let grandTotal = cart.reduce((sum, item) => sum + item.amount, 0);
  let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  let balanceDue = Math.max(0, grandTotal - advancePayment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto font-sans">
      <div className="w-full max-w-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl text-[var(--text-primary)] relative my-6 overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Modal Top Bar */}
        <div className="bg-[var(--bg-header)] px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[var(--text-primary)]">Order Summary</h3>
              <p className="text-sm text-[var(--text-muted)]">Review before confirming checkout</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Business Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b-2 border-[var(--accent-color)]/30 gap-4 mb-6">
            <HeaderLogo size="md" />

            <div className="text-center sm:text-right text-sm text-[var(--text-secondary)] space-y-0.5">
              <div className="font-bold text-[var(--text-primary)]">{printerConfig.storeName || 'JOAINAS MART'}</div>
              <div className="text-[var(--accent-color)] font-semibold">{printerConfig.tagline}</div>
              <div className="text-[var(--text-muted)]">{printerConfig.address}</div>
            </div>
          </div>

          {/* Customer & Transaction Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--bg-app)] p-5 rounded-xl border border-[var(--border-color)] text-sm mb-6">
            <div>
              <div className="text-[var(--text-muted)] font-semibold uppercase text-xs tracking-wide">Customer</div>
              <div className="font-bold text-[var(--text-primary)] text-base mt-1">{selectedCustomer?.fullName || 'Walk-in Customer'}</div>
              <div className="text-[var(--text-muted)] mt-0.5">Phone: <span className="text-[var(--text-secondary)]">{selectedCustomer?.phone || 'N/A'}</span></div>
            </div>

            <div className="sm:text-right">
              <div className="text-[var(--text-muted)] font-semibold uppercase text-xs tracking-wide">Transaction</div>
              <div className="font-bold text-[var(--accent-color)] mt-1 uppercase">
                Retail Pricing
              </div>
              <div className="text-[var(--text-muted)] mt-0.5">Payment: <strong className="text-[var(--success)]">{paymentMethod}</strong></div>
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden mb-6">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--bg-app)] text-[var(--text-muted)] font-semibold uppercase text-xs tracking-wider border-b border-[var(--border-color)]">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4 text-center">Unit</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => (
                  <tr key={idx} className={`border-b border-[var(--border-color)] last:border-0 transition ${
                    idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-app)]'
                  }`}>
                    <td className="py-3.5 px-4 text-[var(--text-muted)]">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{item.product.name}</div>
                      <div className="text-xs text-[var(--accent-color)] uppercase">{item.product.category}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center text-[var(--text-secondary)] font-medium uppercase text-xs">{item.product.unit}</td>
                    <td className="py-3.5 px-4 text-right text-[var(--text-secondary)] font-mono text-sm">{formatNaira(item.rate)}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-[var(--text-primary)]">{item.quantity}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-[var(--accent-color)]">{formatNaira(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[var(--bg-app)] p-5 rounded-xl border border-[var(--border-color)] gap-4">
            <div className="text-sm space-y-1">
              <div className="text-[var(--text-muted)]">
                <span>{cart.length} items</span>
                <span className="mx-2">•</span>
                <span>{totalQuantity} total qty</span>
              </div>
              <div className="text-[var(--text-muted)]">Paid: <strong className="text-[var(--success)]">{formatNaira(advancePayment)}</strong></div>
              {balanceDue > 0 && (
                <div className="text-[var(--error)] font-semibold">Balance Due: {formatNaira(balanceDue)}</div>
              )}
            </div>

            <div className="bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 px-6 py-4 rounded-xl text-right">
              <span className="text-xs font-semibold block uppercase text-[var(--accent-color)]">Grand Total</span>
              <span className="text-2xl font-black text-[var(--text-primary)]">{formatNaira(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="bg-[var(--bg-header)] px-6 py-4 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-6 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-semibold text-sm transition flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </button>

          <button
            onClick={onConfirmCheckout}
            className="w-full sm:w-auto py-3 px-8 rounded-xl bg-gradient-to-r from-[var(--accent-orange)] to-[var(--accent-orange-hover)] hover:opacity-90 text-white font-bold text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirm & Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
