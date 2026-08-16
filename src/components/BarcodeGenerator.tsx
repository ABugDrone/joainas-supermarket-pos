import React from 'react';
import JsBarcode from 'jsbarcode';
import {
  Barcode,
  Printer,
  RefreshCw,
  CheckSquare,
  FileText,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { Product, UserRole, Capability, Category } from '../types';
import { recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';

interface BarcodeGeneratorProps {
  products: Product[];
  categories?: Category[];
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities: Capability[];
  onUpdateProducts: (products: Product[]) => void;
}

// Generate a unique 7-digit barcode in the store's "200XXXX" series.
const generateRandomBarcode = (existing: Set<string>): string => {
  let code = '';
  do {
    code = `200${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existing.has(code));
  return code;
};

// Render a product's barcode to a data-URL PNG via JSBarcode.
const renderBarcodeDataUrl = (code: string): string => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 16,
      height: 60,
      width: 2,
      margin: 4,
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Failed to render barcode', e);
    return '';
  }
};

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  products,
  categories = [],
  currentUser,
  currentUserRole,
  currentUserCapabilities,
  onUpdateProducts,
}) => {
  const { showToast } = useToast();
  const isAdmin = currentUserCapabilities.includes('admin');

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [printFormat, setPrintFormat] = React.useState<'label' | 'sheet'>('label');
  const [printQueue, setPrintQueue] = React.useState<Product[]>([]);

  const productsWithoutBarcode = React.useMemo(
    () => products.filter((p) => !p.barcode || !p.barcode.trim()),
    [products]
  );

  const categoryColor = React.useCallback(
    (name: string): string =>
      categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.color || '#6366f1',
    [categories]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllMissing = () => {
    setSelectedIds(new Set(productsWithoutBarcode.map((p) => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleGenerate = () => {
    if (selectedIds.size === 0) {
      showToast('Select at least one product without a barcode first.', 'warning');
      return;
    }

    const existing = new Set(products.map((p) => p.barcode).filter(Boolean));
    let changed = false;
    const updated = products.map((p) => {
      if (selectedIds.has(p.id) && (!p.barcode || !p.barcode.trim())) {
        changed = true;
        return { ...p, barcode: generateRandomBarcode(existing) };
      }
      return p;
    });

    if (!changed) {
      showToast('Selected products already have barcodes.', 'info');
      return;
    }

    onUpdateProducts(updated);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Generated Product Barcodes',
      `Assigned ${selectedIds.size} random barcode(s) to products missing barcodes.`
    );
    showToast(`Generated barcodes for ${selectedIds.size} product(s).`, 'success');
  };

  // Render live barcode previews for all products that have a barcode.
  React.useEffect(() => {
    const next: Record<string, string> = {};
    products.forEach((p) => {
      if (p.barcode && p.barcode.trim()) {
        next[p.id] = renderBarcodeDataUrl(p.barcode);
      }
    });
    setPreviews(next);
  }, [products]);

  const handlePrint = (queue: Product[]) => {
    if (queue.length === 0) {
      showToast('No products selected to print labels for.', 'warning');
      return;
    }
    setPrintQueue(queue);
    setTimeout(() => window.print(), 150);
  };

  const printSelected = () => {
    if (selectedIds.size === 0) {
      showToast('Select at least one product to print labels for.', 'warning');
      return;
    }
    const queue = products.filter((p) => selectedIds.has(p.id) && p.barcode && p.barcode.trim());
    handlePrint(queue);
  };

  const printAllWithBarcode = () => {
    const queue = products.filter((p) => p.barcode && p.barcode.trim());
    handlePrint(queue);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 rounded-xl">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Barcode Generator & Label Printing</h2>
              <p className="text-xs text-slate-400">
                Assign random barcodes to products that have none, then print labels to attach.
              </p>
            </div>
          </div>

          {!isAdmin && (
            <div className="flex items-center gap-2 text-amber-400 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-lg text-xs font-bold">
              <AlertTriangle className="w-4 h-4" />
              Admin access required to generate barcodes
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Total Products</p>
            <p className="text-2xl font-black text-white">{products.length}</p>
          </div>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Have Barcode</p>
            <p className="text-2xl font-black text-emerald-400">
              {products.filter((p) => p.barcode && p.barcode.trim()).length}
            </p>
          </div>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Missing Barcode</p>
            <p className="text-2xl font-black text-rose-400">{productsWithoutBarcode.length}</p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectAllMissing}
          className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-200 font-bold text-xs hover:bg-[#21262d] transition flex items-center gap-2"
        >
          <CheckSquare className="w-4 h-4 text-indigo-400" />
          Select all without barcode
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-400 font-bold text-xs hover:bg-[#21262d] transition"
        >
          Clear selection
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!isAdmin}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Generate Barcodes ({selectedIds.size})
        </button>
      </div>

      {/* Print Options */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-4 shadow-sm flex flex-wrap items-center gap-3">
        <span className="text-xs font-black uppercase text-slate-300">Print Format:</span>
        <div className="flex rounded-xl overflow-hidden border border-[#30363d]">
          <button
            type="button"
            onClick={() => setPrintFormat('label')}
            className={`px-4 py-2 text-xs font-bold transition ${
              printFormat === 'label'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#0d1117] text-slate-300 hover:bg-[#21262d]'
            }`}
          >
            Label Printer
          </button>
          <button
            type="button"
            onClick={() => setPrintFormat('sheet')}
            className={`px-4 py-2 text-xs font-bold transition ${
              printFormat === 'sheet'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#0d1117] text-slate-300 hover:bg-[#21262d]'
            }`}
          >
            A4 Sheet
          </button>
        </div>
        <span className="text-[10px] text-slate-500">
          {printFormat === 'label'
            ? 'Individual 50×30mm labels (e.g. Dymo / Zebra).'
            : 'Grid of 21 labels per A4 page — print then cut.'}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={printSelected}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg flex items-center gap-2"
        >
          <Printer className="w-4 h-4" />
          Print Selected
        </button>
        <button
          type="button"
          onClick={printAllWithBarcode}
          className="px-4 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-200 font-bold text-xs hover:bg-[#21262d] transition flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Print All
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0d1117] border-b border-[#30363d] flex justify-between items-center">
          <span className="font-extrabold text-xs uppercase text-slate-300 tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-400" />
            Product Catalog Barcode Status ({products.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-[#30363d]">
                <th className="py-3 px-4 w-10">✓</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Barcode Preview</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    No products in the catalog yet.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const hasBarcode = !!(p.barcode && p.barcode.trim());
                  return (
                    <tr key={p.id} className="hover:bg-[#1f242d] transition">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="w-4 h-4 accent-indigo-500"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-white max-w-[220px] truncate">{p.name}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-300 font-semibold">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: categoryColor(p.category) }}
                          ></span>
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                        {hasBarcode ? p.barcode : <span className="text-slate-600">— none —</span>}
                      </td>
                      <td className="py-3 px-4">
                        {hasBarcode && previews[p.id] ? (
                          <img
                            src={previews[p.id]}
                            alt={p.barcode}
                            className="h-9 w-auto object-contain bg-white rounded p-0.5"
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {hasBarcode ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            Has Barcode
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/60 text-rose-400 border border-rose-800/60">
                            No Barcode
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print-only label sheet */}
      <div id="printable-barcode-labels" data-format={printFormat}>
        {printQueue.map((p) => (
          <div key={p.id} className="barcode-label">
            <img
              src={renderBarcodeDataUrl(p.barcode)}
              alt={p.barcode}
              className="barcode-img"
            />
            <div className="label-text">
              <div className="label-name">{p.name}</div>
              <div className="label-price">{p.category}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};