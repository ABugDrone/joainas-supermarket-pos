import React from 'react';
import { Printer, X, FileSpreadsheet, Image as ImageIcon, FileDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { FinancialStatementData, FinancialStatementPaper } from './FinancialStatementPaper';
import { formatNaira, playPOSBeep, pickReceiptSavePath, writeBinaryFile } from '../utils/storage';
import { useToast } from './Toast';

interface FinancialStatementModalProps {
  data: FinancialStatementData;
  periodLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FinancialStatementModal: React.FC<FinancialStatementModalProps> = ({
  data,
  periodLabel,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handlePrint = () => {
    playPOSBeep();
    window.print();
  };

  const handleExportPng = async () => {
    const node = document.getElementById('printable-financial-statement');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const byteString = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const fileName = `Financial_Statement_${data.fromDate}_to_${data.toDate}.png`;
      const path = await pickReceiptSavePath(fileName, 'png');
      if (!path) return;
      await writeBinaryFile(path, bytes);
      showToast('Financial statement saved as PNG.', 'success');
    } catch (e) {
      console.error('PNG export failed', e);
      showToast('Failed to export financial statement as PNG.', 'error');
    }
  };

  const handleExportPdf = async () => {
    const node = document.getElementById('printable-financial-statement');
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
      pdf.addImage(dataUrl, 'PNG', 10, 10, imgWidth, imgHeight);
      const fileName = `Financial_Statement_${data.fromDate}_to_${data.toDate}.pdf`;
      const path = await pickReceiptSavePath(fileName, 'pdf');
      if (!path) return;
      const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
      await writeBinaryFile(path, pdfBytes);
      showToast('Financial statement saved as PDF.', 'success');
    } catch (e) {
      console.error('PDF export failed', e);
      showToast('Failed to export financial statement as PDF.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden my-8 animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Financial Statement Preview</h3>
              <p className="text-sm text-[var(--text-muted)]">{periodLabel}</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6 pb-0">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] py-3 px-4 text-sm font-semibold text-white shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            Print (A4)
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

        {/* A4 Paper Preview */}
        <div className="overflow-y-auto max-h-[60vh] bg-[var(--bg-app)] p-6 m-6 rounded-xl border border-[var(--border-color)] flex flex-col items-center shadow-inner">
          <div className="w-full flex items-center justify-between text-xs text-[var(--text-muted)] mb-3 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--success)]"></span>
              A4 Paper
            </span>
            <span>Net: {formatNaira(data.netProfit)}</span>
          </div>

          <div className="financial-statement-scale origin-top scale-[0.85]">
            <FinancialStatementPaper id="printable-financial-statement" data={data} periodLabel={periodLabel} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)]">
          <span>
            Paper: <strong className="text-[var(--text-secondary)]">A4 (210 × 297 mm)</strong>
          </span>
          <span className="text-[var(--text-muted)]">Statement of Profit and Loss</span>
        </div>
      </div>
    </div>
  );
};