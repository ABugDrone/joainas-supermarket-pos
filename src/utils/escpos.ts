import { SaleRecord, ThermalPrinterConfig, MANDATORY_RECEIPT_FOOTER } from '../types';
import { isTauriRuntime } from './db';
import { moneyAscii } from './currency';
import { BRANDED_NAME_LINE, BRAND_EXPANSION } from '../config/edition';
import { buildSaleDisplay } from './saleLines';
import { discountSummaryRows, saleFinancials } from './discounts';

// ---------------------------------------------------------------------------
// Native ESC/POS thermal printing.
//
// The desktop app prints receipts by spooling RAW ESC/POS bytes straight to
// the Windows printer queue — no browser print dialog, no A4 page, no wasted
// paper. The layout is driven entirely by the commands below so the receipt
// always starts at the very top edge of the 58mm/80mm roll.
//
// In the browser (localhost dev) there is no native printer, so we fall back
// to window.print() with the @media print CSS.
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

function bytes(...args: number[]): number[] {
  return args;
}

const INIT = bytes(ESC, 0x40); // ESC @ — reset printer
const BOLD_ON = bytes(ESC, 0x45, 1); // ESC E 1 — emphasized text on
const BOLD_OFF = bytes(ESC, 0x45, 0); // ESC E 0 — emphasized text off
const SIZE_NORMAL = bytes(GS, 0x21, 0x00); // GS ! 0 — 1x1
const SIZE_DOUBLE_H = bytes(GS, 0x21, 0x08); // GS ! 8 — 2x height only
const ALIGN_LEFT = bytes(ESC, 0x61, 0x00); // ESC a 0
const ALIGN_CENTER = bytes(ESC, 0x61, 0x01); // ESC a 1
const ALIGN_RIGHT = bytes(ESC, 0x61, 0x02); // ESC a 2
const FEED_2 = bytes(ESC, 0x64, 0x02); // ESC d 2 — feed 2 lines
const FEED_3 = bytes(ESC, 0x64, 0x03); // ESC d 3 — feed 3 lines
const CUT = bytes(GS, 0x56, 0x42, 0x00); // GS V 66 — partial cut

// v2.0.9 — the GS ( K "select print density" command is deliberately NOT
// sent. Its payload ends in the printable bytes 0x31 ('1') and 0x50 ('P');
// printers without GS ( K support printed a literal "1P" at the top-left of
// every receipt, joined onto the business name. Print darkness is a hardware
// setting on the printer itself. Do not reintroduce this command.
function encodeLine(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x100) {
      out.push(code);
    } else {
      out.push(0x3f); // '?' for characters the printer can't render
    }
  }
  out.push(0x0a);
  return out;
}

function centerLine(text: string, width: number): string {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function divider(char: string, width: number): string {
  return char.repeat(width);
}

/** Word-wrap the small unit/wholesale footnotes to the paper width. */
function wrapPlain(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rows: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      rows.push(current);
      current = word;
    }
  }
  if (current) rows.push(current);
  return rows;
}

function itemLine(qty: string, name: string, rate: string, amt: string, width: number): string {
  const per = 4;
  const nameW = width - per - 9 - 8; // qty(4) + name + rate(9) + amt(8)
  const n = name.length > nameW ? name.substring(0, nameW - 1) + '.' : name.padEnd(nameW);
  return `${qty.padEnd(per)}${n} ${rate.padStart(8)} ${amt.padStart(8)}`;
}

/**
 * v1.6.0: printer-safe totals in the sale's stamped currency
 * (e.g. "NGN 1,500.00"). Thermal codepages cannot print ₦/€/₹ glyphs.
 */
function stamped(n: number, code?: string): string {
  return moneyAscii(n, code);
}

// Build the full ESC/POS byte stream for a receipt.
// Use a slightly narrower character width than the paper's max to leave a
// hardware margin on Xprinter (≈2-3mm each side), so the rightmost digit
// of RATE/AMT is never hidden (see photo: 25,000 clipped to 25,00).
export function buildEscPos(
  sale: SaleRecord,
  config: ThermalPrinterConfig,
): Uint8Array {
  const width = config.paperWidth === '58mm' ? 30 : 45;
  const out: number[] = [];

  // Only the universally supported INIT (ESC @) is sent before the header.
  // Sending any unsupported command here makes its trailing bytes print as
  // stray text above the store name — this is what produced the old "1P".
  out.push(...INIT);
  out.push(...ALIGN_CENTER);

  // Store header — centered via the printer's native ALIGN_CENTER command
  // (no manual space-padding). Manual padding combined with ALIGN_CENTER
  // double-shifted the text to the right on some firmware, and on printers
  // that ignore alignment it still left the header visibly left-of-centre
  // because the padded width (45) rarely matched the real printable width.
  // Letting the firmware do the centering is the most reliable approach
  // and matches the on-screen preview which uses text-center.
  // v2.1.0 — receipt details are fully customizable in Hardware Config.
  // Business Name (then Store Name) wins; DIRMS Storebox is the default.
  const headerName =
    (config.businessName || '').trim() ||
    (config.storeName || '').trim() ||
    BRANDED_NAME_LINE;
  if (config.showLogo) {
    out.push(...SIZE_DOUBLE_H, ...BOLD_ON);
    out.push(...encodeLine(headerName));
    out.push(...SIZE_NORMAL, ...BOLD_OFF);
  } else {
    out.push(...BOLD_ON, ...encodeLine(headerName), ...BOLD_OFF);
  }

  const tagline = (config.tagline || '').trim() || BRAND_EXPANSION;
  if (tagline) {
    out.push(...encodeLine(tagline));
  }
  if (config.receiptHeaderNote) {
    out.push(...encodeLine(config.receiptHeaderNote));
  }
  if (config.address) {
    out.push(...encodeLine(config.address));
  }
  if (config.phone) {
    out.push(...encodeLine(`Tel: ${config.phone}`));
  }

  out.push(...ALIGN_LEFT);
  out.push(...encodeLine(divider('-', width)));

  // Transaction info.
  out.push(...encodeLine(`Receipt: ${sale.receiptNo}`));
  out.push(...encodeLine(`${sale.date}  ${sale.time}`));
  out.push(...encodeLine(`Cashier: ${sale.cashier}`));
  if (sale.customerName) {
    out.push(...encodeLine(`Customer: ${sale.customerName}`));
  }
  if (sale.customerPhone) {
    out.push(...encodeLine(`Phone: ${sale.customerPhone}`));
  }
  out.push(...encodeLine(`Type: ${sale.priceType.toUpperCase()} SALE`));

  out.push(...encodeLine(divider('-', width)));

  // Items table.
  out.push(...BOLD_ON);
  out.push(...encodeLine(itemLine('QTY', 'ITEM', 'RATE', 'AMT', width)));
  out.push(...BOLD_OFF);
  out.push(...encodeLine(divider('-', width)));

  // v2.0.9 — every box (carton/pack) transaction comes first, loose pieces
  // follow under their own heading, and ordinary items come last. Box rows
  // also carry the balanced wholesale-per-piece footnote.
  const display = buildSaleDisplay(sale.items, { code: sale.currency, ascii: true });
  const fin = saleFinancials(sale);
  let piecesHeadingDone = false;
  for (const line of display.lines) {
    if (display.hasGroups && line.kind === 'piece' && !piecesHeadingDone) {
      out.push(...encodeLine(divider('-', width)));
      out.push(...encodeLine(centerLine('LOOSE PIECES', width)));
      out.push(...encodeLine(divider('-', width)));
      piecesHeadingDone = true;
    }
    out.push(
      ...encodeLine(
        itemLine(String(line.qty), line.name, line.rateLabel, line.amountLabel, width),
      ),
    );
    if (line.kind !== 'plain') {
      for (const chunk of wrapPlain(line.detail, width - 2)) {
        out.push(...encodeLine(`  ${chunk}`));
      }
    }
    for (const note of [...line.noteLines, ...line.discountNoteLines]) {
      for (const chunk of wrapPlain(note, width - 2)) {
        out.push(...encodeLine(`  ${chunk}`));
      }
    }
  }

  out.push(...encodeLine(divider('=', width)));

  // Totals — v2.1.0. All discount rows come from one reconciled breakdown so
  // the printed subtotal minus deductions always equals the saved TOTAL.
  for (const row of discountSummaryRows(fin)) {
    if (row.kind === 'net') out.push(...SIZE_DOUBLE_H, ...BOLD_ON);
    const amount = `${row.negative ? '-' : ''}${stamped(row.amount, sale.currency)}`;
    out.push(...encodeLine(`${row.label.padEnd(16)}${amount.padStart(12)}`));
    if (row.kind === 'net') out.push(...SIZE_NORMAL, ...BOLD_OFF);
  }

  out.push(...BOLD_ON);
  out.push(...encodeLine(`Paid: ${stamped(sale.advancePayment, sale.currency)}`));
  if (sale.balanceDue > 0) {
    out.push(...encodeLine(`Balance Due: ${stamped(sale.balanceDue, sale.currency)}`));
  } else if (sale.balanceDue < 0) {
    out.push(...encodeLine(`Change: ${stamped(Math.abs(sale.balanceDue), sale.currency)}`));
  }
  out.push(...BOLD_OFF);

  out.push(...encodeLine(divider('-', width)));
  out.push(...encodeLine(`Method: ${sale.paymentMethod.toUpperCase()}`));
  if ((sale as any).cashAmount !== undefined) {
    out.push(...encodeLine(`Cash: ${stamped((sale as any).cashAmount, sale.currency)}`));
  }
  if ((sale as any).transferAmount !== undefined) {
    out.push(...encodeLine(`Transfer: ${stamped((sale as any).transferAmount, sale.currency)}`));
  }
  if ((sale as any).paymentNote) {
    out.push(...encodeLine(`Note: ${(sale as any).paymentNote}`));
  }

  // Footer — also natively centered (see header note).
  out.push(...encodeLine(divider('-', width)));
  out.push(...ALIGN_CENTER);
  if (config.receiptFooterNote) {
    out.push(...BOLD_ON, ...encodeLine(config.receiptFooterNote), ...BOLD_OFF);
  }
  out.push(...encodeLine(MANDATORY_RECEIPT_FOOTER));

  out.push(...FEED_3, ...CUT);

  return new Uint8Array(out);
}

// Print via the native Tauri backend. Resolves to true when the job was
// spooled to the printer successfully.
export async function printViaNative(
  sale: SaleRecord,
  config: ThermalPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!isTauriRuntime()) {
    return { ok: false, error: 'Not running in the desktop app.' };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    // Text-only receipt. A bitmap logo is deliberately not sent: many thermal
    // firmware revisions print the raster payload as garbage instead of an
    // image, so the bold/double-height business name is the header.
    const data = buildEscPos(sale, config);
    const printer = config.printerName || '';
    await invoke('print_raw', { printer, data: Array.from(data) });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export async function listNativePrinters(): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('list_printers')) as string[];
  } catch {
    return [];
  }
}

export async function getDefaultNativePrinter(): Promise<string> {
  if (!isTauriRuntime()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('get_default_printer')) as string;
  } catch {
    return '';
  }
}

// Top-level entry used by the UI. Uses native ESC/POS in the desktop app,
// falls back to the browser print dialog when developing in localhost.
export async function printReceipt(
  sale: SaleRecord,
  config: ThermalPrinterConfig,
): Promise<{ usedNative: boolean; error?: string }> {
  if (isTauriRuntime()) {
    const result = await printViaNative(sale, config);
    return { usedNative: true, error: result.error };
  }
  window.print();
  return { usedNative: false };
}
