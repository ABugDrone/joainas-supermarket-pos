import { SaleRecord, ThermalPrinterConfig } from '../types';
import { isTauriRuntime } from './db';

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

function cmd(prefix: number[], ...rest: number[]): number[] {
  return [...prefix, ...rest];
}

const INIT = bytes(ESC, 0x40); // ESC @ — reset printer
const BOLD_ON = bytes(ESC, 0x45, 1); // ESC E 1 — emphasized text on
const BOLD_OFF = bytes(ESC, 0x45, 0); // ESC E 0 — emphasized text off
const SIZE_NORMAL = bytes(GS, 0x21, 0x00); // GS ! 0 — 1x1
const SIZE_DOUBLE_H = bytes(GS, 0x21, 0x08); // GS ! 8 — 2x height only
const ALIGN_LEFT = bytes(ESC, 0x61, 0x00); // ESC a 0
const ALIGN_CENTER = bytes(ESC, 0x61, 0x01); // ESC a 1
const ALIGN_RIGHT = bytes(ESC, 0x61, 0x02); // ESC a 2
const LINE = bytes(0x0a); // LF
const FEED_2 = bytes(ESC, 0x64, 0x02); // ESC d 2 — feed 2 lines
const FEED_3 = bytes(ESC, 0x64, 0x03); // ESC d 3 — feed 3 lines
const CUT = bytes(GS, 0x56, 0x42, 0x00); // GS V 66 — partial cut

function densityCommand(density: ThermalPrinterConfig['printDensity']): number[] {
  // GS ( K pL pH fn m  (fn = 49, select print density)
  // m: 0 = standard, 1-127 = stronger, 128-255 = paler
  switch (density) {
    case 'High':
      return cmd(bytes(GS, 0x28, 0x4b), 0x02, 0x00, 0x31, 0x50); // m=80 → darker
    case 'Draft':
      return cmd(bytes(GS, 0x28, 0x4b), 0x02, 0x00, 0x31, 0xc8); // m=200 → paler
    default:
      return cmd(bytes(GS, 0x28, 0x4b), 0x02, 0x00, 0x31, 0x00); // m=0 → standard
  }
}

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

function itemLine(qty: string, name: string, rate: string, amt: string, width: number): string {
  const per = 4;
  const nameW = width - per - 9 - 8; // qty(4) + name + rate(9) + amt(8)
  const n = name.length > nameW ? name.substring(0, nameW - 1) + '.' : name.padEnd(nameW);
  return `${qty.padEnd(per)}${n} ${rate.padStart(8)} ${amt.padStart(8)}`;
}

function naira(n: number): string {
  return `N${n.toLocaleString()}`;
}

// Build the full ESC/POS byte stream for a receipt.
export function buildEscPos(sale: SaleRecord, config: ThermalPrinterConfig): Uint8Array {
  const width = config.paperWidth === '58mm' ? 32 : 48;
  const out: number[] = [];

  out.push(...INIT, ...densityCommand(config.printDensity));
  out.push(...ALIGN_CENTER);

  // Store header — always starts at the very top of the paper.
  if (config.showLogo) {
    out.push(...SIZE_DOUBLE_H, ...BOLD_ON);
    out.push(...encodeLine(centerLine(config.storeName, width)));
    out.push(...SIZE_NORMAL, ...BOLD_OFF);
  } else {
    out.push(...BOLD_ON, ...encodeLine(centerLine(config.storeName, width)), ...BOLD_OFF);
  }

  if (config.tagline) {
    out.push(...encodeLine(centerLine(config.tagline, width)));
  }
  if (config.address) {
    out.push(...encodeLine(centerLine(config.address, width)));
  }
  if (config.phone) {
    out.push(...encodeLine(centerLine(`Tel: ${config.phone}`, width)));
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

  for (const item of sale.items) {
    out.push(
      ...encodeLine(
        itemLine(
          String(item.quantity),
          item.product.name,
          item.rate.toLocaleString(),
          item.amount.toLocaleString(),
          width,
        ),
      ),
    );
  }

  out.push(...encodeLine(divider('=', width)));

  // Totals.
  out.push(...SIZE_DOUBLE_H, ...BOLD_ON);
  out.push(...encodeLine(`TOTAL: ${naira(sale.totalAmount)}`));
  out.push(...SIZE_NORMAL, ...BOLD_OFF);

  out.push(...BOLD_ON);
  out.push(...encodeLine(`Paid: ${naira(sale.advancePayment)}`));
  if (sale.balanceDue > 0) {
    out.push(...encodeLine(`Balance: ${naira(sale.balanceDue)}`));
  }
  out.push(...BOLD_OFF);

  out.push(...encodeLine(divider('-', width)));
  out.push(...encodeLine(`Method: ${sale.paymentMethod.toUpperCase()}`));
  if (sale.pointsEarned > 0) {
    out.push(...BOLD_ON);
    out.push(...encodeLine(`Points Earned: +${sale.pointsEarned}`));
    out.push(...BOLD_OFF);
  }

  // Footer.
  out.push(...encodeLine(divider('-', width)));
  out.push(...ALIGN_CENTER);
  if (config.receiptFooterNote) {
    out.push(...BOLD_ON, ...encodeLine(centerLine(config.receiptFooterNote, width)), ...BOLD_OFF);
  }
  out.push(...encodeLine('Software by Dronebug Tech (+2347035716349)'));

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
