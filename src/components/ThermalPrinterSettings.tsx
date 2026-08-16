import React from 'react';
import { Settings, Printer, Save, CheckCircle, Barcode } from 'lucide-react';
import { ThermalPrinterConfig, UserRole, Product, Category, Capability } from '../types';
import { recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';
import { BarcodeGenerator } from './BarcodeGenerator';

interface ThermalPrinterSettingsProps {
  config: ThermalPrinterConfig;
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities?: Capability[];
  products?: Product[];
  categories?: Category[];
  onSave: (newConfig: ThermalPrinterConfig) => void;
  onUpdateProducts?: (products: Product[]) => void;
}

export const ThermalPrinterSettings: React.FC<ThermalPrinterSettingsProps> = ({
  config,
  currentUser,
  currentUserRole,
  currentUserCapabilities = [],
  products = [],
  categories = [],
  onSave,
  onUpdateProducts = (_products: Product[]) => {},
}) => {
  const { showToast } = useToast();
  const [subTab, setSubTab] = React.useState<'receipt' | 'barcode'>('receipt');
  const [formData, setFormData] = React.useState<ThermalPrinterConfig>({ ...config });
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Updated Thermal Printer Settings',
      `Updated receipt configuration (${formData.paperWidth}, store name: "${formData.storeName}").`
    );
    showToast('Thermal printer and receipt configuration updated successfully.', 'success');

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-[#161b22] text-[#e2e8f0] rounded-2xl shadow-lg border border-[#30363d] font-sans">
      <div className="flex items-center justify-between border-b border-[#30363d] pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 rounded-xl">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Printer & Scanner Module</h2>
            <p className="text-xs text-slate-400">
              Configure thermal receipt printing and generate/print product barcode labels.
            </p>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-1.5 rounded-lg text-sm font-semibold animate-pulse">
            <CheckCircle className="w-4 h-4" />
            Printer Config Saved!
          </div>
        )}
      </div>

      {/* Sub-tabs: Receipt Printer / Barcode Generator */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setSubTab('receipt')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition border flex items-center gap-2 ${
            subTab === 'receipt'
              ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
              : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'
          }`}
        >
          <Printer className="w-4 h-4" />
          Receipt Printer
        </button>
        <button
          type="button"
          onClick={() => setSubTab('barcode')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition border flex items-center gap-2 ${
            subTab === 'barcode'
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
              : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'
          }`}
        >
          <Barcode className="w-4 h-4" />
          Barcode Generator
        </button>
      </div>

      {subTab === 'receipt' ? (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Store Name (Header)
            </label>
            <input
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm font-semibold text-white focus:border-cyan-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Store Tagline
            </label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Store Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Phone Numbers
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Point Reward Rate (Points per ₦1,000)
            </label>
            <input
              type="number"
              value={formData.pointRate}
              onChange={(e) => setFormData({ ...formData, pointRate: parseFloat(e.target.value) || 1 })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Receipt Header Note
            </label>
            <input
              type="text"
              value={formData.receiptHeaderNote}
              onChange={(e) => setFormData({ ...formData, receiptHeaderNote: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Receipt Footer Note / Return Policy
            </label>
            <input
              type="text"
              value={formData.receiptFooterNote}
              onChange={(e) => setFormData({ ...formData, receiptFooterNote: e.target.value })}
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-400" />
            Hardware & Paper Settings
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                Paper Width
              </label>
              <select
                value={formData.paperWidth}
                onChange={(e) => setFormData({ ...formData, paperWidth: e.target.value as '80mm' | '58mm' })}
                className="w-full rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              >
                <option value="80mm" className="bg-[#161b22]">80mm Standard POS Thermal Paper</option>
                <option value="58mm" className="bg-[#161b22]">58mm Mini Portable Thermal Paper</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                Print Density
              </label>
              <select
                value={formData.printDensity}
                onChange={(e) => setFormData({ ...formData, printDensity: e.target.value as 'Normal' | 'High' | 'Draft' })}
                className="w-full rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              >
                <option value="Normal" className="bg-[#161b22]">Normal</option>
                <option value="High" className="bg-[#161b22]">High Contrast (Bold)</option>
                <option value="Draft" className="bg-[#161b22]">Draft Eco Mode</option>
              </select>
            </div>

            <div className="flex flex-col justify-end space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.showLogo}
                  onChange={(e) => setFormData({ ...formData, showLogo: e.target.checked })}
                  className="w-4 h-4 rounded accent-cyan-400"
                />
                Show Store Logo on Header
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoPrintOnSale}
                  onChange={(e) => setFormData({ ...formData, autoPrintOnSale: e.target.checked })}
                  className="w-4 h-4 rounded accent-cyan-400"
                />
                Auto-Open Receipt on Checkout
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition active:scale-95 border border-cyan-400/50"
          >
            <Save className="w-4 h-4" />
            Save Printer & Receipt Configuration
          </button>
        </div>
      </form>
      ) : (
        <BarcodeGenerator
          products={products}
          categories={categories}
          currentUser={currentUser}
          currentUserRole={currentUserRole}
          currentUserCapabilities={currentUserCapabilities}
          onUpdateProducts={onUpdateProducts}
        />
      )}
    </div>
  );
};
