import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Category,
  Customer,
  Expenditure,
  Product,
  SaleRecord,
  isUncountedKind,
} from '../../types';

// ============================================================
// DATASET TABLES
// One place that knows the exact columns of every exportable dataset.
// The same header text is used by CSV, XLSX and PDF so a file re-imported
// later maps back cleanly.
// ============================================================

export type DatasetId = 'products' | 'sales' | 'customers' | 'expenditures' | 'categories';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ImportMode = 'add' | 'replace' | 'none';

export interface DataTable {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

export interface ExportPayload {
  products: Product[];
  sales: SaleRecord[];
  customers: Customer[];
  expenditures: Expenditure[];
  categories: Category[];
}

export const DATASET_LABELS: Record<DatasetId, string> = {
  products: 'Inventory',
  sales: 'Sales Records',
  customers: 'Customers',
  expenditures: 'Expenditures',
  categories: 'Categories',
};

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel (XLSX)',
  pdf: 'PDF',
};

const money = (n: number | undefined | null): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

const rootFor = (p: Product): string => {
  if (p.kind === 'service') return 'Services';
  if (p.kind === 'edible') return 'Edibles';
  const cat = String(p.category || '').toLowerCase();
  if (cat === 'services') return 'Services';
  if (cat === 'edibles') return 'Edibles';
  return 'Products';
};

export function buildDataTable(id: DatasetId, data: ExportPayload): DataTable {
  switch (id) {
    case 'products':
      return {
        title: 'Inventory',
        columns: [
          'S/N',
          'Barcode',
          'Product Name',
          'Category',
          'Subcategory',
          'Cost Price',
          'Min Price',
          'Max Price',
          'Available Qty',
          'Unit',
          'Reorder Level',
        ],
        rows: data.products.map((p, i) => [
          i + 1,
          p.barcode,
          p.name,
          rootFor(p),
          p.category,
          money(p.costPrice),
          money(p.minPrice ?? 0),
          money(p.retailPrice),
          isUncountedKind(p) ? 'NULL' : p.stockQty,
          p.unit,
          isUncountedKind(p) ? 'NULL' : p.reorderLevel,
        ]),
      };
    case 'sales':
      return {
        title: 'Sales Records',
        columns: [
          'S/N',
          'Receipt No',
          'Date',
          'Time',
          'Cashier',
          'Customer',
          'Product',
          'Qty',
          'Rate',
          'Amount',
          'Subtotal',
          'Total',
          'Paid',
          'Balance',
          'Payment Method',
        ],
        rows: data.sales.flatMap((s, i) => {
          const items = s.items.length > 0 ? s.items : [];
          if (items.length === 0) {
            return [[
              i + 1, s.receiptNo, s.date, s.time, s.cashier,
              s.customerName || 'General Customer', '', '', '', '',
              money(s.subtotal), money(s.totalAmount), money(s.advancePayment),
              money(s.balanceDue), s.paymentMethod,
            ]];
          }
          return items.map((it, idx) => [
            idx === 0 ? i + 1 : '',
            idx === 0 ? s.receiptNo : '',
            idx === 0 ? s.date : '',
            idx === 0 ? s.time : '',
            idx === 0 ? s.cashier : '',
            idx === 0 ? s.customerName || 'General Customer' : '',
            it.product.name,
            it.quantity,
            money(it.rate),
            money(it.amount),
            idx === 0 ? money(s.subtotal) : '',
            idx === 0 ? money(s.totalAmount) : '',
            idx === 0 ? money(s.advancePayment) : '',
            idx === 0 ? money(s.balanceDue) : '',
            idx === 0 ? s.paymentMethod : '',
          ]);
        }),
      };
    case 'customers':
      return {
        title: 'Customers',
        columns: [
          'S/N',
          'Customer Name',
          'Account Type',
          'Phone',
          'Address',
          'Balance',
          'Points',
          'Advance Payment',
          'Created At',
        ],
        rows: data.customers.map((c, i) => [
          i + 1,
          c.fullName,
          c.accountType || 'individual',
          c.phone || '',
          c.address || '',
          money(c.balance),
          c.points ?? 0,
          money(c.advancePayment ?? 0),
          c.createdAt || '',
        ]),
      };
    case 'expenditures':
      return {
        title: 'Expenditures',
        columns: ['S/N', 'Date', 'Description', 'Category', 'Amount', 'Recorded By', 'Currency'],
        rows: data.expenditures.map((e, i) => [
          i + 1,
          e.date,
          e.description,
          e.category,
          money(e.amount),
          e.createdBy,
          e.currency || '',
        ]),
      };
    case 'categories':
      return {
        title: 'Categories',
        columns: ['S/N', 'Name', 'Parent Root', 'Kind', 'Color', 'Description'],
        rows: data.categories.map((c, i) => [
          i + 1,
          c.name,
          c.parentRoot || '',
          c.kind || '',
          c.color || '',
          c.description || '',
        ]),
      };
  }
}

// ============================================================
// CSV (RFC 4180 — quotes doubled, commas/newlines wrapped)
// ============================================================

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(table: DataTable): string {
  const lines = [table.columns.map(csvCell).join(',')];
  for (const row of table.rows) lines.push(row.map(csvCell).join(','));
  // BOM keeps Excel from mangling accented names / the naira sign.
  return `\uFEFF${lines.join('\r\n')}`;
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ============================================================
// XLSX (SheetJS)
// ============================================================

export function toXlsxBytes(table: DataTable): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, table.title.slice(0, 31));
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

export function parseXlsxBytes(bytes: Uint8Array): string[][] {
  const book = XLSX.read(bytes, { type: 'array' });
  const first = book.SheetNames[0];
  if (!first) return [];
  const sheet = book.Sheets[first];
  const aoa = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return aoa.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : []));
}

// ============================================================
// PDF (export only — a printout, never parsed back)
// ============================================================

export function toPdfBytes(table: DataTable, subtitle?: string): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.text(`Joainas Mart — ${table.title}`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    subtitle || `Generated ${new Date().toLocaleString()} · ${table.rows.length} row(s)`,
    40,
    58
  );
  doc.setTextColor(0);

  autoTable(doc, {
    head: [table.columns],
    body: table.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))),
    startY: 72,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 27, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Page ${page}`, pageWidth - 50, doc.internal.pageSize.getHeight() - 16);
    },
  });

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

// ============================================================
// FILE NAME HELPERS
// ============================================================

export function exportFileName(id: DatasetId, format: ExportFormat): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = id === 'products' ? 'inventory' : id === 'sales' ? 'sales_records' : id;
  return `joainas_${slug}_${date}.${format}`;
}

export function buildExportBytes(
  id: DatasetId,
  format: ExportFormat,
  data: ExportPayload
): { bytes: Uint8Array | null; text: string | null } {
  const table = buildDataTable(id, data);
  if (format === 'csv') return { bytes: null, text: toCsv(table) };
  if (format === 'xlsx') return { bytes: toXlsxBytes(table), text: null };
  return { bytes: toPdfBytes(table), text: null };
}

// ============================================================
// IMPORT PARSING
// ============================================================

const norm = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function headerIndex(headers: string[], aliases: string[]): number {
  const wanted = aliases.map(norm);
  for (let i = 0; i < headers.length; i++) {
    if (wanted.includes(norm(headers[i]))) return i;
  }
  return -1;
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const raw = String(value).trim();
  if (raw === '' || /^(null|n\/a|na|none|-)$/i.test(raw)) return null;
  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Drop the leading "S/N" column when present and locate the header row. */
export function normalizeImportTable(raw: string[][]): ParsedTable {
  if (raw.length === 0) return { headers: [], rows: [] };
  let headerRow = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const joined = norm(raw[i].join(' '));
    if (joined.includes('product name') || joined.includes('receipt no') || joined.includes('customer name')) {
      headerRow = i;
      break;
    }
  }
  const headers = raw[headerRow].map((h) => String(h).trim());
  const rows = raw.slice(headerRow + 1);
  return { headers, rows };
}

// ============================================================
// PRODUCT IMPORT PLANNER
// Barcode is the identity. Existing rows are updated; new rows added.
// Quantity semantics are explicit (add / replace / none) and a row that
// fails validation is skipped without touching the rest of the file.
// ============================================================

export interface ProductImportRow {
  rowNumber: number;
  barcode: string;
  name: string;
  action: 'add' | 'update' | 'skip' | 'error';
  beforeQty: number | null;
  afterQty: number | null;
  message?: string;
}

export interface ProductImportPlan {
  rows: ProductImportRow[];
  products: Product[];
  newCategories: Category[];
  counts: { add: number; update: number; skip: number; error: number };
  warnings: string[];
  fingerprint: string;
}

export function planProductImport(
  parsed: ParsedTable,
  current: Product[],
  mode: ImportMode,
  filename: string
): ProductImportPlan {
  const h = parsed.headers;
  const idx = {
    barcode: headerIndex(h, ['barcode', 'bar code', 'code']),
    name: headerIndex(h, ['product name', 'name', 'item name']),
    category: headerIndex(h, ['category', 'product category', 'parent category']),
    subcategory: headerIndex(h, ['subcategory', 'sub category', 'product category subcategory']),
    cost: headerIndex(h, ['cost price', 'cost']),
    min: headerIndex(h, ['min price', 'minimum price', 'min']),
    max: headerIndex(h, ['max price', 'maximum price', 'retail price', 'selling price', 'max']),
    qty: headerIndex(h, ['available qty', 'available unit', 'available quantity', 'stock', 'stock qty', 'quantity', 'qty']),
    unit: headerIndex(h, ['unit', 'measure']),
    reorder: headerIndex(h, ['reorder level', 'reorder', 'minimum stock']),
  };

  const byBarcode = new Map<string, Product>();
  for (const p of current) byBarcode.set(String(p.barcode).trim().toLowerCase(), p);

  const nextProducts = current.map((p) => ({ ...p }));
  const nextById = new Map(nextProducts.map((p) => [p.id, p]));
  const knownCategories = new Set<string>();
  const newCategories: Category[] = [];
  const rows: ProductImportRow[] = [];
  const warnings: string[] = [];
  const seenBarcodes = new Map<string, number>();
  const counts = { add: 0, update: 0, skip: 0, error: 0 };

  const cell = (row: string[], i: number): string => (i >= 0 ? String(row[i] ?? '').trim() : '');

  parsed.rows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    let barcode = cell(raw, idx.barcode);
    const name = cell(raw, idx.name);
    if (!name && !barcode) return; // blank line

    if (!barcode) {
      barcode = `AUTO-${Date.now().toString().slice(-6)}${String(rowNumber).padStart(3, '0')}`;
      warnings.push(`Row ${rowNumber}: no barcode — assigned ${barcode}. Print a label for it.`);
    }

    const key = barcode.toLowerCase();
    if (seenBarcodes.has(key)) {
      warnings.push(`Row ${rowNumber}: barcode ${barcode} also appears on row ${seenBarcodes.get(key)} — the last row wins.`);
    }
    seenBarcodes.set(key, rowNumber);

    const cost = parseNumber(cell(raw, idx.cost));
    const min = parseNumber(cell(raw, idx.min));
    const max = parseNumber(cell(raw, idx.max));
    const qty = parseNumber(cell(raw, idx.qty));
    const reorder = parseNumber(cell(raw, idx.reorder));

    if ([cost, min, max, qty, reorder].some((n) => Number.isNaN(n as number))) {
      rows.push({ rowNumber, barcode, name: name || barcode, action: 'error', beforeQty: null, afterQty: null, message: 'A price or quantity cell is not a number.' });
      counts.error++;
      return;
    }
    if (cost !== null && cost < 0) {
      rows.push({ rowNumber, barcode, name: name || barcode, action: 'error', beforeQty: null, afterQty: null, message: 'Cost price cannot be negative.' });
      counts.error++;
      return;
    }
    if (min !== null && max !== null && min > max && max > 0) {
      rows.push({ rowNumber, barcode, name: name || barcode, action: 'error', beforeQty: null, afterQty: null, message: `Minimum price (${min}) is greater than maximum price (${max}).` });
      counts.error++;
      return;
    }
    if (qty !== null && qty < 0) {
      rows.push({ rowNumber, barcode, name: name || barcode, action: 'error', beforeQty: null, afterQty: null, message: 'Available quantity cannot be negative.' });
      counts.error++;
      return;
    }

    const existing = byBarcode.get(key);
    const categoryName = cell(raw, idx.subcategory) || cell(raw, idx.category) || existing?.category || 'Groceries';
    const unit = (cell(raw, idx.unit) || existing?.unit || 'piece') as Product['unit'];
    const kind: Product['kind'] =
      /^services$/i.test(categoryName) ? 'service' : /^edibles$/i.test(categoryName) ? 'edible' : (existing?.kind || 'product');

    if (existing) {
      const target = nextById.get(existing.id)!;
      const beforeQty = isUncountedKind(existing) ? null : existing.stockQty;
      let afterQty = beforeQty;
      if (beforeQty !== null) {
        if (mode === 'add' && qty !== null) afterQty = beforeQty + Math.trunc(qty);
        else if (mode === 'replace' && qty !== null) afterQty = Math.trunc(qty);
      }

      const updated: Product = {
        ...target,
        name: name || target.name,
        category: categoryName,
        kind,
        unit,
        costPrice: cost !== null ? cost : target.costPrice,
        minPrice: min !== null ? min : target.minPrice,
        retailPrice: max !== null ? max : target.retailPrice,
        wholesalePrice: max !== null ? max : target.wholesalePrice,
        stockQty: afterQty === null ? target.stockQty : afterQty,
        reorderLevel: reorder !== null ? Math.trunc(reorder) : target.reorderLevel,
      };

      const changed = JSON.stringify(updated) !== JSON.stringify(target);
      if (!changed) {
        rows.push({ rowNumber, barcode, name: updated.name, action: 'skip', beforeQty, afterQty, message: 'No change.' });
        counts.skip++;
      } else {
        nextById.set(existing.id, updated);
        const at = nextProducts.findIndex((p) => p.id === existing.id);
        if (at >= 0) nextProducts[at] = updated;
        rows.push({ rowNumber, barcode, name: updated.name, action: 'update', beforeQty, afterQty });
        counts.update++;
      }
    } else {
      const counted = kind === 'product';
      const stockQty = counted ? Math.trunc(qty ?? 0) : 0;
      const created: Product = {
        id: `prod-${Date.now()}-${rowNumber}-${Math.floor(Math.random() * 1000)}`,
        barcode,
        name: name || barcode,
        category: categoryName,
        kind,
        unit,
        costPrice: cost ?? 0,
        minPrice: min ?? 0,
        retailPrice: max ?? 0,
        wholesalePrice: max ?? 0,
        priceTiers: [],
        stockQty,
        reorderLevel: reorder !== null ? Math.trunc(reorder) : 5,
      } as Product;
      nextProducts.push(created);
      nextById.set(created.id, created);
      byBarcode.set(key, created);
      rows.push({
        rowNumber,
        barcode,
        name: created.name,
        action: 'add',
        beforeQty: null,
        afterQty: counted ? stockQty : null,
      });
      counts.add++;
    }

    if (categoryName && !knownCategories.has(categoryName.toLowerCase())) {
      knownCategories.add(categoryName.toLowerCase());
      if (!current.some((p) => p.category.toLowerCase() === categoryName.toLowerCase())) {
        newCategories.push({
          id: `cat-${Date.now()}-${newCategories.length}`,
          name: categoryName,
          color: '#6366f1',
          kind,
          parentRoot: kind === 'service' ? 'Services' : kind === 'edible' ? 'Edibles' : 'Products',
          createdAt: new Date().toISOString(),
        } as Category);
      }
    }
  });

  const fingerprint = `${filename}|${parsed.rows.length}|${(parsed.rows[0] || []).join('|')}|${(parsed.rows[parsed.rows.length - 1] || []).join('|')}`;
  return { rows, products: nextProducts, newCategories, counts, warnings, fingerprint };
}

// ============================================================
// SALES IMPORT PLANNER
// Historical receipts only: never changes stock, never overwrites an
// existing receipt number.
// ============================================================

export interface SalesImportPlan {
  sales: SaleRecord[];
  added: number;
  skipped: number;
  errors: string[];
  fingerprint: string;
}

export function planSalesImport(
  parsed: ParsedTable,
  current: SaleRecord[],
  filename: string
): SalesImportPlan {
  const h = parsed.headers;
  const idx = {
    receipt: headerIndex(h, ['receipt no', 'receipt', 'receipt number', 'invoice no']),
    date: headerIndex(h, ['date', 'sale date']),
    time: headerIndex(h, ['time', 'sale time']),
    cashier: headerIndex(h, ['cashier', 'cashier username', 'staff']),
    customer: headerIndex(h, ['customer', 'customer name']),
    product: headerIndex(h, ['product', 'product name', 'item']),
    qty: headerIndex(h, ['qty', 'quantity']),
    rate: headerIndex(h, ['rate', 'price']),
    amount: headerIndex(h, ['amount', 'line total']),
    subtotal: headerIndex(h, ['subtotal']),
    total: headerIndex(h, ['total', 'total amount']),
    paid: headerIndex(h, ['paid', 'advance payment']),
    balance: headerIndex(h, ['balance', 'balance due']),
    method: headerIndex(h, ['payment method', 'method']),
  };

  const existing = new Set(current.map((s) => s.receiptNo.trim().toLowerCase()));
  const errors: string[] = [];
  const added: SaleRecord[] = [];
  let skipped = 0;

  interface Group {
    receipt: string;
    date: string;
    time: string;
    cashier: string;
    customer: string;
    subtotal: number;
    total: number;
    paid: number;
    balance: number;
    method: string;
    items: Array<{ name: string; qty: number; rate: number; amount: number }>;
  }
  const groups = new Map<string, Group>();
  const cell = (row: string[], i: number): string => (i >= 0 ? String(row[i] ?? '').trim() : '');

  parsed.rows.forEach((row, i) => {
    const receipt = cell(row, idx.receipt);
    if (!receipt) {
      if (cell(row, idx.product)) errors.push(`Row ${i + 2}: missing receipt number — skipped.`);
      return;
    }
    const key = receipt.toLowerCase();
    if (existing.has(key)) {
      skipped++;
      return;
    }
    const g: Group = groups.get(key) || {
      receipt,
      date: cell(row, idx.date) || new Date().toISOString().split('T')[0],
      time: cell(row, idx.time) || '00:00:00',
      cashier: cell(row, idx.cashier) || 'Imported',
      customer: cell(row, idx.customer),
      subtotal: parseNumber(cell(row, idx.subtotal)) || 0,
      total: parseNumber(cell(row, idx.total)) || 0,
      paid: parseNumber(cell(row, idx.paid)) || 0,
      balance: parseNumber(cell(row, idx.balance)) || 0,
      method: cell(row, idx.method) || 'Cash',
      items: [],
    };
    const product = cell(row, idx.product);
    const qty = parseNumber(cell(row, idx.qty));
    if (product && qty !== null && qty > 0) {
      const rate = parseNumber(cell(row, idx.rate)) || 0;
      const amount = parseNumber(cell(row, idx.amount)) || rate * qty;
      g.items.push({ name: product, qty: Math.trunc(qty), rate, amount });
    }
    groups.set(key, g);
  });

  for (const g of groups.values()) {
    const total = g.total || g.items.reduce((s, it) => s + it.amount, 0);
    const subtotal = g.subtotal || total;
    added.push({
      id: `sale-import-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      receiptNo: g.receipt,
      items: g.items.map((it, idx) => ({
        product: {
          id: `imported-${norm(it.name).replace(/\s+/g, '-')}-${idx}`,
          barcode: '',
          name: it.name,
          category: 'Imported',
          unit: 'piece',
          costPrice: 0,
          minPrice: 0,
          retailPrice: it.rate,
          wholesalePrice: it.rate,
          stockQty: 0,
          reorderLevel: 0,
        } as Product,
        quantity: it.qty,
        priceType: 'retail',
        rate: it.rate,
        amount: it.amount,
      })),
      subtotal,
      totalAmount: total,
      advancePayment: g.paid,
      balanceDue: g.balance || Math.max(0, total - g.paid),
      paymentMethod: g.method as SaleRecord['paymentMethod'],
      priceType: 'retail',
      customerName: g.customer || undefined,
      pointsEarned: 0,
      cashier: g.cashier,
      date: g.date,
      time: g.time,
      timestamp: Date.now(),
    } as SaleRecord);
  }

  const fingerprint = `${filename}|${parsed.rows.length}|${(parsed.rows[0] || []).join('|')}|${(parsed.rows[parsed.rows.length - 1] || []).join('|')}`;
  return { sales: added, added: added.length, skipped, errors, fingerprint };
}

// ============================================================
// IMPORT FINGERPRINT MEMORY (double-import guard) + UNDO
// ============================================================

const FINGERPRINT_KEY = 'joainas_import_fingerprints_v1';
const UNDO_KEY = 'joainas_last_import_undo_v1';

interface FingerprintRecord {
  at: number;
  filename: string;
}

export function readImportFingerprints(): Record<string, FingerprintRecord> {
  try {
    const raw = localStorage.getItem(FINGERPRINT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FingerprintRecord>) : {};
  } catch {
    return {};
  }
}

export function rememberImportFingerprint(fingerprint: string, filename: string): void {
  try {
    const map = readImportFingerprints();
    map[fingerprint] = { at: Date.now(), filename };
    // Keep the newest 50 only.
    const entries = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, 50);
    localStorage.setItem(FINGERPRINT_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

export interface ImportUndoRecord {
  at: number;
  filename: string;
  dataset: DatasetId;
  beforeProducts: Product[];
  addedProductIds: string[];
  beforeSales: SaleRecord[];
  addedSaleIds: string[];
}

export function saveImportUndo(record: ImportUndoRecord): void {
  try {
    // Keep it small: the undo covers only rows the import touched.
    localStorage.setItem(UNDO_KEY, JSON.stringify(record));
  } catch {}
}

export function loadImportUndo(): ImportUndoRecord | null {
  try {
    const raw = localStorage.getItem(UNDO_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportUndoRecord;
  } catch {
    return null;
  }
}

export function clearImportUndo(): void {
  try {
    localStorage.removeItem(UNDO_KEY);
  } catch {}
}
