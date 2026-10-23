import React from 'react';
import { X, Printer, User, Clock, CreditCard, Package, Eye } from 'lucide-react';
import { SaleRecord } from '../types';
import { formatNaira } from '../utils/storage';
import { formatMoney } from '../utils/currency';
import { formatSoldRange, formatSaleRate, isLegacySale } from '../utils/pricing';

interface SaleDetailModalProps {
  sale: SaleRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onReprint: (sale: SaleRecord) => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({ sale, isOpen, onClose, onReprint }) => {
  if (!isOpen || !sale) return null;

  const totalQty = sale.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Header */}
        <div className="bg-[var(--bg-header)] px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-[var(--text-primary)] text-sm">Sale Preview — {sale.receiptNo}</h3>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                <Clock className="w-3 h-3" /> {sale.date} • {sale.time} • Cashier: <strong className="text-[var(--text-secondary)]">{sale.cashier}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Customer + Payment summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl p-4">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Customer
              </div>
              <div className="font-black text-[var(--text-primary)] mt-1">{sale.customerName || 'General Customer'}</div>
              <div className="text-xs text-[var(--text-muted)]">{sale.customerPhone || ''}</div>
              {sale.customerId && <div className="text-[10px] text-[var(--text-muted)] mt-1">ID: {sale.customerId}</div>}
            </div>
            <div className="bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl p-4">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Payment
              </div>
              <div className="font-black text-[var(--text-primary)] mt-1">{sale.paymentMethod}</div>
              <div className="text-xs text-[var(--text-muted)]">Paid: <strong className="text-emerald-500">{formatMoney(sale.advancePayment, sale.currency)}</strong> • Balance: <strong className={sale.balanceDue>0?'text-amber-500': sale.balanceDue<0?'text-cyan-500':'text-[var(--text-muted)]'}>{formatMoney(sale.balanceDue, sale.currency)}{sale.balanceDue<0?' (Change)':''}</strong></div>
              {(sale.cashAmount!==undefined || sale.transferAmount!==undefined) && (
                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                  {sale.cashAmount!==undefined && <span>Cash: {formatMoney(sale.cashAmount, sale.currency)} </span>}
                  {sale.transferAmount!==undefined && <span>• Transfer: {formatMoney(sale.transferAmount, sale.currency)}</span>}
                </div>
              )}
              {sale.paymentNote && <div className="text-xs italic text-amber-600 mt-1 border-t border-[var(--border-color)] pt-1">Note: {sale.paymentNote}</div>}
            </div>
          </div>

          {/* Items breakdown — thematic table */}
          <div>
            <h4 className="font-black text-xs uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-[var(--accent-color)]" /> Product Breakdown — {sale.items.length} items • {totalQty} total qty
            </h4>
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--accent-color)] text-white font-black uppercase text-[11px] tracking-wider">
                      <th className="py-2.5 px-3">S/N</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((it, idx) => (
                      <tr key={idx} className={`border-b border-[var(--border-color)] last:border-0 ${idx%2===0?'bg-[var(--bg-surface)]':'bg-[var(--bg-app)]'} hover:bg-[var(--bg-hover)] transition`}>
                        <td className="py-3 px-3 font-bold text-[var(--text-muted)]">{idx+1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[var(--text-primary)]">{it.product.name}</div>
                          <div className="text-[10px] text-[var(--text-muted)] uppercase">{it.product.category} • {it.product.unit}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-black text-[var(--text-primary)]">{it.quantity}</td>
                        <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                          <div title={isLegacySale(sale.date) ? `Sold ${formatMoney(it.rate, sale.currency)}` : `Sold ${formatMoney(it.rate, sale.currency)} (min) — range stays ${formatSoldRange(it.rate, it.ceilingAtSale ?? it.product.retailPrice ?? it.rate, sale.currency)}`}>
                            {formatSaleRate(it.rate, it.ceilingAtSale ?? it.product.retailPrice ?? it.rate, sale.date, sale.currency)}
                          </div>
                          {!isLegacySale(sale.date) && <div className="text-[10px] opacity-70">sold min</div>}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[var(--accent-color)]">{formatMoney(it.amount, sale.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--bg-app)] border-t-2 border-[var(--accent-color)] font-black">
                      <td colSpan={2} className="py-3 px-3 text-right text-[var(--text-secondary)]">TOTAL</td>
                      <td className="py-3 px-3 text-center text-[var(--text-primary)]">{totalQty}</td>
                      <td className="py-3 px-3 text-right text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-3 text-right text-[var(--accent-color)] text-sm">{formatMoney(sale.totalAmount, sale.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl p-3 text-center">
              <div className="text-[10px] font-black uppercase text-[var(--text-muted)]">Subtotal</div>
              <div className="font-black text-[var(--text-primary)]">{formatMoney(sale.subtotal, sale.currency)}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
              <div className="text-[10px] font-black uppercase text-emerald-600">Paid</div>
              <div className="font-black text-emerald-600">{formatMoney(sale.advancePayment, sale.currency)}</div>
            </div>
            <div className={`border rounded-xl p-3 text-center ${sale.balanceDue>0?'bg-amber-500/10 border-amber-500/30 text-amber-600': sale.balanceDue<0?'bg-cyan-500/10 border-cyan-500/30 text-cyan-600':'bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)]'}`}>
              <div className="text-[10px] font-black uppercase">{sale.balanceDue<0?'Change Due':'Balance Due'}</div>
              <div className="font-black">{formatMoney(Math.abs(sale.balanceDue), sale.currency)}</div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-header)] px-6 py-4 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button onClick={onClose} className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-secondary)] font-bold text-sm hover:bg-[var(--bg-hover)] transition">Close Preview</button>
          <button onClick={() => { onReprint(sale); onClose(); }} className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-black text-sm shadow-md flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
