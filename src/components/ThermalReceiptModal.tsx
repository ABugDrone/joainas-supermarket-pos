import React from 'react';
import { Printer, X, Copy, Check, Volume2, Image as ImageIcon, FileDown, AlertTriangle } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { SaleRecord, ThermalPrinterConfig } from '../types';
import { formatNaira, playPOSBeep, pickReceiptSavePath, writeBinaryFile, openInDefaultApp } from '../utils/storage';
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
      // Build the PDF at the EXACT thermal paper size (80mm/58mm wide x natural
      // receipt height). A4 was the problem: any reader (Foxit etc.) centered
      // the small receipt on the big page, wasting paper below the top edge.
      const paperW = config.paperWidth === '58mm' ? 58 : 80;
      const imgWidth = paperW;
      const imgHeight = (node.offsetHeight / node.offsetWidth) * imgWidth;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [imgWidth, imgHeight],
        compress: true,
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight);
      const fileName = `Receipt_${sale.receiptNo.replace(/[^\w-]/g, '_')}.pdf`;
      const path = await pickReceiptSavePath(fileName, 'pdf');
      if (!path) return;
      const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
      await writeBinaryFile(path, pdfBytes);
      showToast(`Receipt saved as PDF.`, 'success');
      await openInDefaultApp(path);
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
    if ((sale as any).cashAmount !== undefined || (sale as any).transferAmount !== undefined) {
      if ((sale as any).cashAmount !== undefined) text += `Cash: ${formatNaira((sale as any).cashAmount)}\n`;
      if ((sale as any).transferAmount !== undefined) text += `Transfer: ${formatNaira((sale as any).transferAmount)}\n`;
      if ((sale as any).paymentNote) text += `Note: ${(sale as any).paymentNote}\n`;
    }
    text += `--------------------------------\n`;
    text += `${config.receiptFooterNote}\n`;
    text += `Software by Dronebug Tech\n`;
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

          {/* Receipt — preview widths match printable area (76mm for 80mm roll, 54mm for 58mm) to prevent RHS clipping seen on Xprinter. Print CSS centres 76mm/54mm on the page with hardware margins. */}
          <div
            id="printable-thermal-receipt"
            data-paper={config.paperWidth}
            className={`bg-white text-black rounded-lg shadow-lg border border-gray-200 ${
              config.paperWidth === '58mm' ? 'w-[54mm] max-w-[54mm]' : 'w-[76mm] max-w-[76mm]'
            }`}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: config.paperWidth === '58mm' ? '10.5px' : '11.5px',
              lineHeight: '1.35',
              padding: config.paperWidth === '58mm' ? '2mm 1.5mm 2mm 1.5mm' : '2mm 2mm 2mm 2mm',
              boxSizing: 'border-box',
            }}
          >
            {/* Store Header */}
            <div className="text-center mb-3 pb-3 border-b-2 border-gray-700">
              {config.showLogo && (
                <img src="/logo.png" alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain" />
              )}
              <div className="font-black text-2xl tracking-tight text-black uppercase leading-tight">{config.storeName}</div>
              <div className="text-sm text-gray-800 font-bold mt-1">{config.tagline}</div>
              <div className="text-xs text-gray-700 font-medium mt-1">{config.address}</div>
              <div className="text-xs text-gray-700 font-medium">Tel: {config.phone}</div>
            </div>

            {/* Transaction Info */}
            <div className="border-t-2 border-b-2 border-gray-700 py-2 my-2 text-[13px] space-y-1">
              <div className="flex justify-between font-bold">
                <span>Receipt:</span>
                <span className="font-black">{sale.receiptNo}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Date/Time:</span>
                <span>{sale.date} {sale.time}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Cashier:</span>
                <span className="font-bold">{sale.cashier}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between font-semibold">
                  <span>Customer:</span>
                  <span className="font-black text-gray-900">{sale.customerName}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Sale Type:</span>
                <span className="uppercase font-black text-blue-800">{sale.priceType}</span>
              </div>
            </div>

            {/* Items — fixed layout so 80mm/58mm never clips RHS amounts; Item column wraps, Rate/Amt stay on one line. */}
            <table className="w-full text-left my-2 border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '10%' }} />
                <col style={{ width: '48%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '21%' }} />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-black text-[11px] font-black uppercase">
                  <th className="py-1 text-left">Qty</th>
                  <th className="py-1 text-left">Item</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-400">
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="text-[12px]">
                    <td className="py-1.5 font-black align-top text-left">{item.quantity}</td>
                    <td className="py-1.5 pr-1 align-top break-words font-bold text-gray-900" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {item.product.name}
                    </td>
                    <td className="py-1.5 text-right align-top text-gray-800 font-semibold" style={{ whiteSpace: 'nowrap' }}>{item.rate.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-black align-top text-black" style={{ whiteSpace: 'nowrap' }}>
                      {item.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="border-t-2 border-black pt-2 mt-2 space-y-1.5 text-[13px]">
              <div className="flex justify-between text-xl font-black text-black">
                <span>TOTAL:</span>
                <span>{formatNaira(sale.totalAmount)}</span>
              </div>
              <div className="flex justify-between font-black text-gray-900">
                <span>Paid:</span>
                <span>{formatNaira(sale.advancePayment)}</span>
              </div>
              {sale.balanceDue > 0 && (
                <div className="flex justify-between font-black text-red-700">
                  <span>Balance Due:</span>
                  <span>{formatNaira(sale.balanceDue)}</span>
                </div>
              )}
              {sale.balanceDue < 0 && (
                <div className="flex justify-between font-black text-emerald-700">
                  <span>Change:</span>
                  <span>{formatNaira(Math.abs(sale.balanceDue))}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-800 font-bold pt-1 border-t-2 border-gray-700">
                <span>Method:</span>
                <span className="font-black uppercase">{sale.paymentMethod}</span>
              </div>
              {(sale as any).cashAmount !== undefined && (
                <div className="flex justify-between text-xs text-gray-800 font-bold">
                  <span>Cash:</span>
                  <span>{formatNaira((sale as any).cashAmount)}</span>
                </div>
              )}
              {(sale as any).transferAmount !== undefined && (
                <div className="flex justify-between text-xs text-gray-800 font-bold">
                  <span>Transfer:</span>
                  <span>{formatNaira((sale as any).transferAmount)}</span>
                </div>
              )}
              {(sale as any).paymentNote && (
                <div className="text-xs text-gray-800 italic border border-gray-300 rounded px-1 py-0.5">Note: {(sale as any).paymentNote}</div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-800 font-bold border-t-2 border-gray-700 pt-3 mt-3 space-y-1">
              <p className="font-black text-black">{config.receiptFooterNote}</p>
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
