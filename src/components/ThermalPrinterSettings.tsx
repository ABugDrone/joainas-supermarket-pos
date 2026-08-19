import React from 'react';
import { Settings, Printer, Save, CheckCircle, Barcode, ChevronDown, ChevronRight, ExternalLink, Monitor, Cable, Usb } from 'lucide-react';
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
  const [showPrinterGuide, setShowPrinterGuide] = React.useState(false);
  const [showScannerGuide, setShowScannerGuide] = React.useState(false);

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
            <h2 className="text-xl font-bold text-white">Hardware Config</h2>
            <p className="text-xs text-slate-400">
              Configure thermal receipt printer, barcode scanner, and generate product barcode labels.
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
        {/* Printer Setup Guide */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPrinterGuide(!showPrinterGuide)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#161b22] transition"
          >
            <div className="flex items-center gap-2">
              <Cable className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-cyan-300">How to Connect Your Printer (Xprinter M813)</span>
            </div>
            {showPrinterGuide ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {showPrinterGuide && (
            <div className="px-4 pb-4 text-[12px] text-slate-300 space-y-3 border-t border-[#30363d] pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-black text-white text-[13px]">Step 1: Plug It In</h4>
                  <p>Take the USB cable that came with your printer. One end goes into the back of the <strong className="text-cyan-300">Xprinter M813</strong> (the square-shaped port). The other end goes into any USB port on your computer.</p>
                  <p>Now plug the power adapter into the printer and into a power socket. Turn the printer ON using the switch on the side.</p>
                  <p className="text-slate-400 text-[11px]">You should hear a beep and see the green light turn on.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-black text-white text-[13px]">Step 2: Install the Driver</h4>
                  <p>Run <strong className="text-cyan-300">XPrinter Driver Setup V7.77.exe</strong> from the hardware-drivers folder. Click Next through the prompts.</p>
                  <p>When the installer asks: choose <strong className="text-cyan-300">USB</strong> → <strong className="text-cyan-300">POS-80C</strong> → click <strong className="text-cyan-300">Install Now</strong>.</p>
                  <p className="text-slate-400 text-[11px]">After install, the printer will appear in Windows "Devices and Printers".</p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-black text-white text-[13px]">Step 3: Test It</h4>
                <p>Go to <strong className="text-cyan-300">Windows Control Panel → Devices and Printers</strong>. Right-click on the printer → <strong className="text-cyan-300">Printer Properties</strong> → click <strong className="text-cyan-300">Print Test Page</strong>. If a receipt prints out, you're all set!</p>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 mt-2">
                <h4 className="font-black text-white text-[12px] mb-1">Download Links & Videos</h4>
                <div className="space-y-1 text-[11px]">
                  <p>• Driver download: <a href="https://www.xprintertech.com/download" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-1">xprintertech.com/download <ExternalLink className="w-3 h-3" /></a></p>
                  <p>• Video guide: <a href="https://www.youtube.com/watch?v=1ossLw4O6uE" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-1">How to Install Xprinter Driver on Windows 10 <ExternalLink className="w-3 h-3" /></a></p>
                  <p>• Full manual: <a href="https://www.monitorpos.co.uk/thermal-printer-support" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-1">monitorpos.co.uk/thermal-printer-support <ExternalLink className="w-3 h-3" /></a></p>
                </div>
              </div>
            </div>
          )}
        </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                Printer Name
              </label>
              <input
                type="text"
                value={formData.printerName || ''}
                onChange={(e) => setFormData({ ...formData, printerName: e.target.value })}
                placeholder="XP-80C"
                className="w-full rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              />
              {typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window) ? (
                <p className="mt-1.5 text-[11px] leading-snug text-amber-400/90">
                  Web preview mode — the browser cannot connect to your printer. Install the desktop app to detect and print to the Xprinter.
                </p>
              ) : (
                <button
                type="button"
                onClick={async () => {
                  const escpos = await import('../utils/escpos');
                  const [names, def] = await Promise.all([
                    escpos.listNativePrinters(),
                    escpos.getDefaultNativePrinter(),
                  ]);
                  if (!names.length) {
                    showToast('No printers detected. Make sure the Xprinter is connected (Control Panel > Devices and Printers).', 'error');
                    return;
                  }
                  const pick =
                    def ||
                    names.find((n) => /xp-80|pos-80|80c|thermal|receipt|xprinter|80/i.test(n)) ||
                    names[0];
                  setFormData({ ...formData, printerName: pick });
                  showToast(`Printer set to "${pick}".`, 'success');
                }}
                className="mt-1.5 w-full rounded-lg border border-cyan-800/50 bg-cyan-950/40 px-2 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/40 transition"
              >
                Detect Printers
              </button>
              )}
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
        <div className="space-y-4">
          {/* Scanner Setup Guide */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowScannerGuide(!showScannerGuide)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#161b22] transition"
            >
              <div className="flex items-center gap-2">
                <Usb className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-bold text-indigo-300">How to Connect Your Scanner (ISSYZONE POS)</span>
              </div>
              {showScannerGuide ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {showScannerGuide && (
              <div className="px-4 pb-4 text-[12px] text-slate-300 space-y-3 border-t border-[#30363d] pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-black text-white text-[13px]">Step 1: Just Plug It In</h4>
                    <p>Take the USB cable from your <strong className="text-indigo-300">ISSYZONE POS</strong> scanner and plug it into any USB port on your computer. That's it — no driver needed!</p>
                    <p>The scanner works like a keyboard. When you scan a barcode, it "types" the numbers into whatever box is open on your screen.</p>
                    <p className="text-slate-400 text-[11px]">You'll hear a beep when it's ready. The red laser light means it's working.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-black text-white text-[13px]">Step 2: Test It</h4>
                    <p>Open <strong className="text-indigo-300">Notepad</strong> on your computer. Scan any barcode (like one on a product). You should see numbers appear in Notepad — that means it's working!</p>
                    <p>To use in the POS app: go to <strong className="text-indigo-300">Sell Service (F1)</strong>, click on the search box, then scan a product barcode. The product will be found automatically.</p>
                    <p className="text-slate-400 text-[11px]">The scanner is plug-and-play — it works on any computer without installing anything.</p>
                  </div>
                </div>
                <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 mt-2">
                  <h4 className="font-black text-white text-[12px] mb-1">Helpful Links</h4>
                  <div className="space-y-1 text-[11px]">
                    <p>• Windows barcode scanner setup: <a href="https://individualpos.zendesk.com/hc/en-us/articles/231335388" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">Install Handheld Barcode Scanner (Windows 10+) <ExternalLink className="w-3 h-3" /></a></p>
                    <p>• Supported POS scanners: <a href="https://learn.microsoft.com/en-us/windows/uwp/devices-sensors/pos-device-support" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">Microsoft POS Device Support <ExternalLink className="w-3 h-3" /></a></p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <BarcodeGenerator
            products={products}
            categories={categories}
            currentUser={currentUser}
            currentUserRole={currentUserRole}
            currentUserCapabilities={currentUserCapabilities}
            onUpdateProducts={onUpdateProducts}
          />
        </div>
      )}
    </div>
  );
};
