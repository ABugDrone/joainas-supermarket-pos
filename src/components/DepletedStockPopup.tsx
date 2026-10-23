import React from 'react';
import { AlertTriangle, PackagePlus, X } from 'lucide-react';
import { Product } from '../types';

interface DepletedStockPopupProps {
  product: Product;
  requestedQty: number;
  canManageStock: boolean;
  onAddStock: () => void;
  onSellAnyway: () => void;
  onClose: () => void;
}

/**
 * Shown when a cashier tries to add a depleted item. Managers can restock
 * on the spot; anyone with sales access may deliberately sell into negative
 * stock. The stock never silently clamps to zero.
 */
export const DepletedStockPopup: React.FC<DepletedStockPopupProps> = ({
  product,
  requestedQty,
  canManageStock,
  onAddStock,
  onSellAnyway,
  onClose,
}) => {
  const stock = Number.isFinite(product.stockQty) ? product.stockQty : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-sm">Depleted Stock</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
            <div className="text-sm font-bold text-white">{product.name}</div>
            <div className="text-xs text-amber-300 mt-1">
              {stock < 0
                ? `${Math.abs(stock)} ${product.unit} owed — you are trying to add ${requestedQty}.`
                : `No stock left — you are trying to add ${requestedQty} ${product.unit}.`}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Add stock now to keep the count accurate, or sell anyway. Selling anyway
            records the shortfall as negative stock until the next delivery.
          </p>

          <div className="flex flex-col gap-2">
            {canManageStock ? (
              <button
                onClick={onAddStock}
                className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2"
              >
                <PackagePlus className="w-4 h-4" /> Add Stock
              </button>
            ) : (
              <div className="w-full px-4 py-2.5 rounded-lg border border-[#30363d] text-center text-[11px] text-slate-400">
                Ask an inventory manager to add stock.
              </div>
            )}
            <button
              onClick={onSellAnyway}
              className="w-full px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-black"
            >
              Sell Anyway (stock goes negative)
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded-lg border border-[#30363d] text-slate-300 text-xs font-bold hover:bg-[#1f2630]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
