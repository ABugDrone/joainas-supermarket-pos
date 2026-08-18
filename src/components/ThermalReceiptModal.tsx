import React from 'react';
import { Printer, X, Copy, Check, Volume2, Image as ImageIcon, FileDown, AlertTriangle } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { SaleRecord, ThermalPrinterConfig } from '../types';
import { formatNaira, playPOSBeep, pickReceiptSavePath, writeBinaryFile } from '../utils/storage';
import { printReceipt } from '../utils/escpos';
import { isTauriRuntime } from '../utils/db';
import { useToast } from './Toast';

interface ThermalReceiptModalProps {
  sale: SaleRecord | null;
  config: ThermalPrinterConfig;
  isOpen: boolean;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  sale,
  config,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);

  if (!isOpen || !sale) return null;

  const handlePrint = async () => {
    playPOSBeep();
    if (!isTauriRuntime()) {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const result = await printReceipt(sale, config);
      if (result.error) {
        showToast(result.error, 'error');
      } else {
        showToast('Receipt sent to printer.', 'success');
      }
    } catch (e) {
      console.error('Print failed', e);
      showToast('Failed to print receipt.', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleExportPng = async () => {
    const node = document.getElementById('printable-thermal-receipt');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const byteString = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const fileName = `Receipt_${sale.receiptNo.replace(/[^\w-]/g, '_')}.png`;
      const path = await pickReceiptSavePath(fileName, 'png');
      if (!path) return;
      await writeBinaryFile(path, bytes);
      showToast(`Receipt saved as PNG.`, 'success');
    } catch (e) {
      console.error('PNG export failed', e);
      showToast('Failed to export receipt as PNG.', 'error');
    }
  };

  const handleExportPdf = async () => {
    const node = document.getElementById('printable-thermal-receipt');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const imgWidth = 190;
      const imgHeight = (node.offsetHeight / node.offsetWidth) * imgWidth;
      pdf.addImage(dataUrl, 'PNG', 10, 0, imgWidth, imgHeight);
      const fileName = `Receipt_${sale.receiptNo.replace(/[^\w-]/g, '_')}.pdf`;
      const path = await pickReceiptSavePath(fileName, 'pdf');
      if (!path) return;
      const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
      await writeBinaryFile(path, pdfBytes);
      showToast(`Receipt saved as PDF.`, 'success');
    } catch (e) {
      console.error('PDF export failed', e);
      showToast('Failed to export receipt as PDF.', 'error');
    }
  };

  const getEscPosText = () => {
    let text = `================================\n`;
    text += `       ${config.storeName}\n`;
    text += `  ${config.tagline}\n`;
    text += `================================\n`;
    text += `Address: ${config.address}\n`;
    text += `Tel: ${config.phone}\n`;
    text += `--------------------------------\n`;
    text += `Receipt No: ${sale.receiptNo}\n`;
    text += `Date: ${sale.date}  Time: ${sale.time}\n`;
    text += `Cashier: ${sale.cashier}\n`;
    if (sale.customerName) {
      text += `Customer: ${sale.customerName}\n`;
      if (sale.customerPhone) text += `Phone: ${sale.customerPhone}\n`;
    }
    text += `Type: ${sale.priceType.toUpperCase()} SALE\n`;
    text += `--------------------------------\n`;
    text += `QTY  ITEM              PRICE     AMT\n`;
    text += `--------------------------------\n`;

    sale.items.forEach((item) => {
      const name = item.product.name.substring(0, 16).padEnd(16, ' ');
      const qty = item.quantity.toString().padStart(3, ' ');
      const rate = item.rate.toLocaleString().padStart(7, ' ');
      const amt = item.amount.toLocaleString().padStart(8, ' ');
      text += `${qty} ${name} ${rate} ${amt}\n`;
    });

    text += `--------------------------------\n`;
    text += `TOTAL:          ₦${sale.totalAmount.toLocaleString()}\n`;
    text += `PAID (ADVANCE): ₦${sale.advancePayment.toLocaleString()}\n`;
    text += `BALANCE DUE:    ₦${sale.balanceDue.toLocaleString()}\n`;
    text += `PAYMENT METHOD: ${sale.paymentMethod}\n`;
    text += `LOYALTY POINTS: +${sale.pointsEarned}\n`;
    text += `--------------------------------\n`;
    text += `${config.receiptFooterNote}\n`;
    text += `Software by Dronebug Tech (+2347035716349)\n`;
    text += `================================\n\n\n`;
    return text;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getEscPosText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden my-8 animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Receipt Preview</h3>
              <p className="text-sm text-[var(--text-muted)]">{sale.receiptNo}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 p-6 pb-0">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] py-3 px-4 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
          >
            {printing ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            {printing ? 'Printing...' : 'Print Receipt'}
          </button>
          <button
            onClick={handleCopyText}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] py-3 px-4 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-color)] transition"
          >
            {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
          <button
            onClick={handleExportPng}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] py-3 px-4 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-color)] transition"
          >
            <ImageIcon className="w-4 h-4" />
            Save as PNG
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] py-3 px-4 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-color)] transition"
          >
            <FileDown className="w-4 h-4" />
            Save as PDF
          </button>
        </div>

        {/* Receipt Paper */}
        <div className="overflow-y-auto max-h-[55vh] bg-[var(--bg-app)] p-6 m-6 rounded-xl border border-[var(--border-color)] flex flex-col items-center shadow-inner">
          <div className="w-full flex items-center justify-between text-xs text-[var(--text-muted)] mb-3 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--success)]"></span>
              {config.paperWidth} Paper Roll
            </span>
            <span>{sale.items.length} items</span>
          </div>

          {/* Receipt */}
          <div
            id="printable-thermal-receipt"
            data-paper={config.paperWidth}
            className={`bg-white text-black p-5 rounded-lg shadow-lg border border-gray-200 ${
              config.paperWidth === '58mm' ? 'w-[240px]' : 'w-[330px]'
            }`}
            style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '13px', lineHeight: '1.4' }}
          >
            {/* Store Header */}
            <div className="text-center mb-3 pb-3 border-b border-dashed border-gray-400">
              {config.showLogo && (
                <img src="/logo.png" alt="Logo" className="w-14 h-14 mx-auto mb-2 object-contain" />
              )}
              <div className="font-black text-lg tracking-tight text-black uppercase leading-tight">{config.storeName}</div>
              <div className="text-xs text-gray-700 font-bold mt-1">{config.tagline}</div>
              <div className="text-[11px] text-gray-600 mt-1">{config.address}</div>
              <div className="text-[11px] text-gray-600">Tel: {config.phone}</div>
            </div>

            {/* Transaction Info */}
            <div className="border-t border-b border-dashed border-gray-400 py-2 my-2 text-[12px] space-y-1">
              <div className="flex justify-between">
                <span>Receipt:</span>
                <span className="font-extrabold">{sale.receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span>Date/Time:</span>
                <span>{sale.date} {sale.time}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span className="font-semibold">{sale.cashier}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-bold text-gray-900">{sale.customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Sale Type:</span>
                <span className="uppercase font-bold text-blue-800">{sale.priceType}</span>
              </div>
            </div>

            {/* Items */}
            <table className="w-full text-left my-2 border-collapse">
              <thead>
                <tr className="border-b-2 border-black text-[11px] font-black uppercase">
                  <th className="py-1">Qty</th>
                  <th className="py-1">Item</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="text-[12px]">
                    <td className="py-1.5 font-bold align-top">{item.quantity}</td>
                    <td className="py-1.5 pr-1 align-top break-words max-w-[110px] font-semibold text-gray-900">
                      {item.product.name}
                    </td>
                    <td className="py-1.5 text-right align-top text-gray-700">{item.rate.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-black align-top text-black">
                      {item.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="border-t-2 border-black pt-2 mt-2 space-y-1 text-[12px]">
              <div className="flex justify-between text-lg font-black text-black">
                <span>TOTAL:</span>
                <span>{formatNaira(sale.totalAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-800">
                <span>Paid:</span>
                <span>{formatNaira(sale.advancePayment)}</span>
              </div>
              {sale.balanceDue > 0 && (
                <div className="flex justify-between font-black text-red-700">
                  <span>Balance:</span>
                  <span>{formatNaira(sale.balanceDue)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px] text-gray-700 pt-1 border-t border-dashed border-gray-400">
                <span>Method:</span>
                <span className="font-extrabold uppercase">{sale.paymentMethod}</span>
              </div>
              {sale.pointsEarned > 0 && (
                <div className="flex justify-between text-[11px] text-emerald-800 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                  <span>Points Earned:</span>
                  <span>+{sale.pointsEarned} pts</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-[11px] text-gray-800 border-t border-dashed border-gray-400 pt-3 mt-3 space-y-1">
              <p className="font-bold text-black">{config.receiptFooterNote}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)]">
          <span>Paper: <strong className="text-[var(--text-secondary)]">{config.paperWidth}</strong></span>
          <button
            onClick={playPOSBeep}
            className="flex items-center gap-1 text-[var(--accent-color)] hover:underline font-medium"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Test Beep
          </button>
        </div>
      </div>
    </div>
  );
};
