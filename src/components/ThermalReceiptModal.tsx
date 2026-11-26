import React from 'react';
import { Printer, X, Copy, Check, Volume2, Image as ImageIcon, FileDown, AlertTriangle } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { SaleRecord, ThermalPrinterConfig, MANDATORY_RECEIPT_FOOTER } from '../types';
import { formatNaira, playPOSBeep, pickReceiptSavePath, writeBinaryFile, openInDefaultApp } from '../utils/storage';
import { formatMoney, moneyAscii } from '../utils/currency';
import { buildSaleDisplay } from '../utils/saleLines';
import { printReceipt } from '../utils/escpos';
import { discountSummaryRows, saleFinancials } from '../utils/discounts';
import { isTauriRuntime } from '../utils/db';
import { BRANDED_NAME_LINE, BRAND_EXPANSION } from '../config/edition';
import { useToast } from './Toast';

/** v2.1.0 — the header comes from Hardware Config, with Alhaji Rabiu Global Entreprises defaults.
 * The DIRMS logo is only the fallback when no custom logo is uploaded. */
const RECEIPT_BRAND_ICON = '/receipt-icon.png';

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

  // v2.0.9 — box-first rows, loose pieces afterwards, balanced wholesale
  // footnote under every box row. One shared model for preview, PDF and print.
  const receiptLines = buildSaleDisplay(sale.items, { code: sale.currency });

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

  // v2.1.0 — fully customizable receipt details. Business Name (then Store
  // Name) wins; Alhaji Rabiu Global Entreprises is only the default.
  const headerName =
    (config.businessName || '').trim() ||
    (config.storeName || '').trim() ||
    BRANDED_NAME_LINE;
  const headerTagline = (config.tagline || '').trim() || BRAND_EXPANSION;
  const getEscPosText = () => {
    let text = `================================\n`;
    text += `       ${headerName}\n`;
    text += `  ${headerTagline}\n`;
    text += `================================\n`;
    if (config.receiptHeaderNote) text += `  ${config.receiptHeaderNote}\n`;
    if (config.address) text += `Address: ${config.address}\n`;
    if (config.phone) text += `Tel: ${config.phone}\n`;
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

    // v2.0.9 — box rows first, loose pieces afterwards under their own
    // heading, with the wholesale-per-piece footnote under every box row.
    const copyLines = buildSaleDisplay(sale.items, { code: sale.currency, ascii: true });
    const fin = saleFinancials(sale);
    let headingDone = false;
    copyLines.lines.forEach((line) => {
      if (copyLines.hasGroups && line.kind === 'piece' && !headingDone) {
        text += `---------- LOOSE PIECES ----------\n`;
        headingDone = true;
      }
      const name = line.name.substring(0, 16).padEnd(16, ' ');
      const qty = line.qty.toString().padStart(3, ' ');
      const rate = line.rateLabel.padStart(7, ' ');
      const amt = line.amountLabel.padStart(8, ' ');
      text += `${qty} ${name} ${rate} ${amt}\n`;
      if (line.kind !== 'plain') text += `   ${line.detail}\n`;
      line.noteLines.forEach((note) => { text += `   ${note}\n`; });
      line.discountNoteLines.forEach((note) => { text += `   ${note}\n`; });
    });

    text += `--------------------------------\n`;
    discountSummaryRows(fin).forEach((row) => {
      const amount = `${row.negative ? '-' : ''}${moneyAscii(row.amount, sale.currency)}`;
      text += `${row.label.toUpperCase().padEnd(16)}${amount.padStart(15)}\n`;
    });
    text += `PAID (ADVANCE): ${moneyAscii(sale.advancePayment, sale.currency)}\n`;
    text += `BALANCE DUE:    ${moneyAscii(sale.balanceDue, sale.currency)}\n`;
    text += `PAYMENT METHOD: ${sale.paymentMethod}\n`;
    if ((sale as any).cashAmount !== undefined || (sale as any).transferAmount !== undefined) {
      if ((sale as any).cashAmount !== undefined) text += `Cash: ${moneyAscii((sale as any).cashAmount, sale.currency)}\n`;
      if ((sale as any).transferAmount !== undefined) text += `Transfer: ${moneyAscii((sale as any).transferAmount, sale.currency)}\n`;
      if ((sale as any).paymentNote) text += `Note: ${(sale as any).paymentNote}\n`;
    }
    text += `--------------------------------\n`;
    text += `${config.receiptFooterNote}\n`;
    text += `${MANDATORY_RECEIPT_FOOTER}\n`;
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
            {/* Store Header — v2.1.0: every line comes from Hardware Config */}
            <div className="text-center mb-3 pb-3 border-b-2 border-gray-700">
              {config.showLogo !== false && (
                <img
                  src={config.logoDataUrl || RECEIPT_BRAND_ICON}
                  alt={headerName}
                  className="mx-auto mb-2 object-contain"
                  style={{ maxWidth: config.paperWidth === '58mm' ? 80 : 104, maxHeight: 56 }}
                />
              )}
              <div className="font-black text-lg tracking-tight text-black leading-tight">{headerName}</div>
              <div className="text-[11px] text-gray-800 font-bold mt-0.5">{headerTagline}</div>
              {config.receiptHeaderNote && (
                <div className="text-xs text-gray-800 font-bold mt-1">{config.receiptHeaderNote}</div>
              )}
              {config.address && <div className="text-xs text-gray-700 font-medium mt-1">{config.address}</div>}
              {config.phone && <div className="text-xs text-gray-700 font-medium">Tel: {config.phone}</div>}
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
                {receiptLines.lines.map((line, idx) => (
                  <React.Fragment key={line.key}>
                    {receiptLines.hasGroups && idx === receiptLines.pieceStartIndex && (
                      <tr className="bg-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-700">
                        <td colSpan={4} className="py-1 text-center">— Loose pieces —</td>
                      </tr>
                    )}
                    <tr className="text-[12px]">
                      <td className="py-1.5 font-black align-top text-left">
                        {line.qty}
                        <span className="block text-[8px] font-bold uppercase text-gray-600">{line.unit}{line.qty === 1 ? '' : 's'}</span>
                      </td>
                      <td className="py-1.5 pr-1 align-top break-words font-bold text-gray-900" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {line.name}
                        {line.kind !== 'plain' && (
                          <span className="block text-[10px] font-black text-blue-800">({line.detail})</span>
                        )}
                        {line.noteLines.length > 0 && (
                          <span className="mt-1 block border-t border-dashed border-gray-400 pt-1 text-[8px] font-semibold leading-tight text-gray-600">
                            {line.noteLines.map((note, ni) => (
                              <span key={ni} className="block">{note}</span>
                            ))}
                          </span>
                        )}
                        {line.discountNoteLines.map((note, ni) => (
                          <span key={ni} className="mt-0.5 block text-[9px] font-black leading-tight text-amber-700">{note}</span>
                        ))}
                      </td>
                      <td className="py-1.5 text-right align-top text-gray-800 font-semibold" style={{ whiteSpace: 'nowrap' }}>{line.rateLabel}</td>
                      <td className="py-1.5 text-right font-black align-top text-black" style={{ whiteSpace: 'nowrap' }}>
                        {line.amountLabel}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Totals — v2.1.0: every discount reconciled to the saved total */}
            <div className="border-t-2 border-black pt-2 mt-2 space-y-1.5 text-[13px]">
              {discountSummaryRows(saleFinancials(sale)).map((row, i) => (
                <div
                  key={`${row.kind}-${i}`}
                  className={`flex justify-between ${
                    row.kind === 'net'
                      ? 'text-xl font-black text-black'
                      : row.negative
                        ? 'font-black text-amber-700'
                        : row.kind === 'saved'
                          ? 'font-bold text-amber-700'
                          : 'font-bold text-gray-800'
                  }`}
                >
                  <span>{row.label}:</span>
                  <span>{row.negative ? '− ' : ''}{formatMoney(row.amount, sale.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between font-black text-gray-900">
                <span>Paid:</span>
                <span>{formatMoney(sale.advancePayment, sale.currency)}</span>
              </div>
              {sale.balanceDue > 0 && (
                <div className="flex justify-between font-black text-red-700">
                  <span>Balance Due:</span>
                  <span>{formatMoney(sale.balanceDue, sale.currency)}</span>
                </div>
              )}
              {sale.balanceDue < 0 && (
                <div className="flex justify-between font-black text-emerald-700">
                  <span>Change:</span>
                  <span>{formatMoney(Math.abs(sale.balanceDue), sale.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-800 font-bold pt-1 border-t-2 border-gray-700">
                <span>Method:</span>
                <span className="font-black uppercase">{sale.paymentMethod}</span>
              </div>
              {(sale as any).cashAmount !== undefined && (
                <div className="flex justify-between text-xs text-gray-800 font-bold">
                  <span>Cash:</span>
                  <span>{formatMoney((sale as any).cashAmount, sale.currency)}</span>
                </div>
              )}
              {(sale as any).transferAmount !== undefined && (
                <div className="flex justify-between text-xs text-gray-800 font-bold">
                  <span>Transfer:</span>
                  <span>{formatMoney((sale as any).transferAmount, sale.currency)}</span>
                </div>
              )}
              {(sale as any).paymentNote && (
                <div className="text-xs text-gray-800 italic border border-gray-300 rounded px-1 py-0.5">Note: {(sale as any).paymentNote}</div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-800 font-bold border-t-2 border-gray-700 pt-3 mt-3 space-y-1">
              <p className="font-black text-black">{config.receiptFooterNote}</p>
              <p className="text-[10px]">{MANDATORY_RECEIPT_FOOTER}</p>
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
