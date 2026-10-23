import React from 'react';
import { PackagePlus, X } from 'lucide-react';
import { Product } from '../types';
import { formatMoney } from '../utils/currency';
import { NumberInput } from './NumberInput';
import { applyStockAddition } from '../utils/stock';

interface StockAdjustModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (newQty: number, added: number) => void;
}

/**
 * Restock dialog. For negative stock the entered quantity RESETS the count
 * (-3 + 5 becomes 5), matching the depleted-stock property.
 */
export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({ product, onClose, onSave }) => {
  const [amount, setAmount] = React.useState(1);

  React.useEffect(() => {
    if (product) setAmount(1);
  }, [product?.id]);

  if (!product) return null;

  const current = Number.isFinite(product.stockQty) ? product.stockQty : 0;
  const next = applyStockAddition(current, amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Add Stock</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm font-bold text-white">{product.name}</div>
            <div className="text-xs text-slate-400 mt-1">
              Current stock:{' '}
              <span className={current < 0 ? 'text-red-400 font-bold' : 'text-cyan-400 font-bold'}>
                {current}
              </span>{' '}
              {product.unit}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              Quantity received
            </label>
            <NumberInput
              integer
              min={1}
              value={amount}
              onValueChange={setAmount}
              placeholder="e.g., 10"
              className="w-full rounded-lg border border-[#30363d] px-3 py-2 bg-[#0d1117] text-white text-sm outline-none focus:border-cyan-500"
            />
          </div>

          <div className="rounded-lg bg-[#0d1117] border border-[#30363d] px-3 py-2 text-xs text-slate-300">
            New stock:{' '}
            <span className="font-bold text-cyan-300">
              {next} {product.unit}
            </span>
            {current < 0 && (
              <span className="block text-[10px] text-amber-400 mt-1">
                Negative stock resets to the quantity received.
              </span>
            )}
            <span className="block text-[10px] text-slate-500 mt-1">
              Stock value at max price: {formatMoney(next * (product.retailPrice || product.minPrice || 0))}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[#30363d] text-slate-300 text-xs font-bold hover:bg-[#1f2630]"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(next, amount)}
              disabled={amount <= 0}
              className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold"
            >
              Save Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
