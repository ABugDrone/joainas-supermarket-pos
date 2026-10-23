import { SaleRecord, ThermalPrinterConfig, MANDATORY_RECEIPT_FOOTER } from '../types';
import { isTauriRuntime } from './db';
import { moneyAscii } from './currency';

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

/**
 * v1.6.0: printer-safe totals in the sale's stamped currency
 * (e.g. "NGN 1,500.00"). Thermal codepages cannot print ₦/€/₹ glyphs.
 */
function stamped(n: number, code?: string): string {
  return moneyAscii(n, code);
}

// ---------------------------------------------------------------------------
// Custom business logo as an ESC/POS raster bit image (GS v 0).
//
// The receipt used to be text-only, so a logo configured in Hardware Config
// could never reach the paper. This renders the logo (custom upload or the
// bundled /logo.png) into a 1-bit bitmap and emits it as a GS v 0 block,
// which every modern thermal printer understands. Any failure — broken image,
// missing canvas — resolves to null and the receipt simply falls back to the
// bold business-name header it already had.
// ---------------------------------------------------------------------------

const LOGO_THRESHOLD = 170; // luminance cutoff: below this a pixel prints black
const LOGO_MAX_HEIGHT = 160; // dots — keeps a square logo from swallowing the roll

function rasterWidthFor(paperWidth: ThermalPrinterConfig['paperWidth']): number {
  // Full raster width of the printable area: 58mm → 384 dots, 80mm → 576 dots.
  return paperWidth === '58mm' ? 384 : 576;
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Unable to load logo image: ${src}`));
    img.src = src;
  });
  return img;
}

/**
 * Renders `src` to a centered, 1-bit GS v 0 raster block sized for the paper.
 * Returns null when the image cannot be rendered so callers can fall back.
 */
export async function buildLogoRaster(
  src: string,
  paperWidth: ThermalPrinterConfig['paperWidth'],
): Promise<number[] | null> {
  try {
    const img = await loadImageElement(src);
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) return null;

    // ~45% of the printable width, never taller than LOGO_MAX_HEIGHT.
    const maxW = Math.max(48, Math.round(rasterWidthFor(paperWidth) * 0.45));
    const scale = Math.min(maxW / nw, LOGO_MAX_HEIGHT / nh);
    const w = Math.max(8, Math.round(nw * scale));
    const h = Math.max(8, Math.round(nh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Transparent PNGs must land on white paper, not on black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const rgba = ctx.getImageData(0, 0, w, h).data;
    const bytesPerRow = Math.ceil(w / 8);
    const pixels: number[] = [];

    for (let y = 0; y < h; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= w) continue;
          const i = (y * w + x) * 4;
          const luminance =
            0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          if (luminance < LOGO_THRESHOLD) byte |= 0x80 >> bit; // 1 = print black
        }
        pixels.push(byte);
      }
    }

    // GS v 0 m xL xH yL yH <bitmap>  (m = 0 normal mode)
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = h & 0xff;
    const yH = (h >> 8) & 0xff;
    return [...bytes(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH), ...pixels];
  } catch {
    return null; // never let a broken logo abort the receipt
  }
}

// Build the full ESC/POS byte stream for a receipt.
// Use a slightly narrower character width than the paper's max to leave a
// hardware margin on Xprinter (≈2-3mm each side), so the rightmost digit
// of RATE/AMT is never hidden (see photo: 25,000 clipped to 25,00).
export function buildEscPos(
  sale: SaleRecord,
  config: ThermalPrinterConfig,
  logoRaster: number[] | null = null,
): Uint8Array {
  const width = config.paperWidth === '58mm' ? 30 : 45;
  const out: number[] = [];

  out.push(...INIT, ...densityCommand(config.printDensity));
  out.push(...ALIGN_CENTER);

  // Custom logo (raster) sits above the store name, centered. When the raster
  // could not be built, only the name header below is printed — same as before.
  if (config.showLogo && logoRaster && logoRaster.length) {
    out.push(...logoRaster, ...LINE);
  }

  // Store header — centered via the printer's native ALIGN_CENTER command
  // (no manual space-padding). Manual padding combined with ALIGN_CENTER
  // double-shifted the text to the right on some firmware, and on printers
  // that ignore alignment it still left the header visibly left-of-centre
  // because the padded width (45) rarely matched the real printable width.
  // Letting the firmware do the centering is the most reliable approach
  // and matches the on-screen preview which uses text-center.
  const headerName = config.businessName || config.storeName;
  if (config.showLogo) {
    out.push(...SIZE_DOUBLE_H, ...BOLD_ON);
    out.push(...encodeLine(headerName));
    out.push(...SIZE_NORMAL, ...BOLD_OFF);
  } else {
    out.push(...BOLD_ON, ...encodeLine(headerName), ...BOLD_OFF);
  }

  if (config.tagline) {
    out.push(...encodeLine(config.tagline));
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
  out.push(...encodeLine(`TOTAL: ${stamped(sale.totalAmount, sale.currency)}`));
  out.push(...SIZE_NORMAL, ...BOLD_OFF);

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
    // Best-effort logo raster: resolves to null on any failure, in which case
    // buildEscPos prints the name-only header exactly as it always did.
    let logoRaster: number[] | null = null;
    if (config.showLogo) {
      logoRaster = await buildLogoRaster(
        config.logoDataUrl || '/logo.png',
        config.paperWidth,
      );
    }
    const data = buildEscPos(sale, config, logoRaster);
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
