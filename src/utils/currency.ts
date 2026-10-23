// ============================================================
// DISPLAY CURRENCY (v1.6.0) — global currency selection.
//
// The app was Naira-hardcoded (formatNaira + dozens of ₦ literals). This
// module makes the shop currency a setting: full ISO-4217 table below with
// NGN first as the default, per-currency decimal places (JPY 0, KWD 3,
// most 2), and an ASCII-safe renderer for thermal printers (most ESC/POS
// codepages cannot print ₦/€/₹ glyphs, so receipts use codes: "NGN 1,500").
//
// Persistence mirrors the trusted-clock anchor: in-memory cache, vault
// (app_settings) + localStorage mirror, hydrated once in initStorage.
// Changing the setting broadcasts 'dirms-currency' — components subscribe
// via useCurrency() for instant live updates. Historical records keep the
// code they were stamped with (old rows without one read as NGN), so a
// currency change never rewrites history.
// ============================================================

import { dbGetSetting, dbSetSetting, isTauriRuntime } from './db';

export interface CurrencyInfo {
  /** ISO-4217 code, e.g. 'NGN'. */
  code: string;
  /** Display symbol, e.g. '₦'. Latin-safe where a standard form exists. */
  symbol: string;
  /** English name, e.g. 'Nigerian Naira'. */
  name: string;
  /** Fraction digits per ISO-4217 (0 for JPY, 3 for KWD, 2 for most). */
  decimals: number;
}

export const DEFAULT_CURRENCY_CODE = 'NGN';
const LS_KEY = 'dirms_display_currency_v1';
const DB_KEY = 'display_currency';
export const CURRENCY_EVENT = 'dirms-currency';

// ISO-4217 minor units: everything defaults to 2 except these sets.
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF',
  'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

function decimalsFor(code: string): number {
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
}

// NGN first (default), then alphabetical by code.
const CURRENCY_DEFS: CurrencyDef[] = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'AED', symbol: 'DH', name: 'UAE Dirham' },
  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani' },
  { code: 'ALL', symbol: 'L', name: 'Albanian Lek' },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
  { code: 'ANG', symbol: 'NAƒ', name: 'Netherlands Antillean Guilder' },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'AWG', symbol: 'Afl', name: 'Aruban Florin' },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat' },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark' },
  { code: 'BBD', symbol: 'Bds$', name: 'Barbadian Dollar' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar' },
  { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc' },
  { code: 'BMD', symbol: 'BM$', name: 'Bermudian Dollar' },
  { code: 'BND', symbol: 'B$', name: 'Brunei Dollar' },
  { code: 'BOB', symbol: 'Bs', name: 'Bolivian Boliviano' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'BSD', symbol: 'B$', name: 'Bahamian Dollar' },
  { code: 'BTN', symbol: 'Nu', name: 'Bhutanese Ngultrum' },
  { code: 'BWP', symbol: 'P', name: 'Botswanan Pula' },
  { code: 'BYN', symbol: 'Br', name: 'Belarusian Ruble' },
  { code: 'BZD', symbol: 'BZ$', name: 'Belize Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'CDF', symbol: 'CDF', name: 'Congolese Franc' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón' },
  { code: 'CUP', symbol: 'CUP', name: 'Cuban Peso' },
  { code: 'CVE', symbol: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'DOP', symbol: 'RD$', name: 'Dominican Peso' },
  { code: 'DZD', symbol: 'DA', name: 'Algerian Dinar' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'FJD', symbol: 'FJ$', name: 'Fijian Dollar' },
  { code: 'FKP', symbol: 'FK£', name: 'Falkland Islands Pound' },
  { code: 'GBP', symbol: '£', name: 'British Pound Sterling' },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'GIP', symbol: '£', name: 'Gibraltar Pound' },
  { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi' },
  { code: 'GNF', symbol: 'FG', name: 'Guinean Franc' },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal' },
  { code: 'GYD', symbol: 'G$', name: 'Guyanese Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'HNL', symbol: 'L', name: 'Honduran Lempira' },
  { code: 'HTG', symbol: 'G', name: 'Haitian Gourde' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'IQD', symbol: 'IQD', name: 'Iraqi Dinar' },
  { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar' },
  { code: 'JOD', symbol: 'JD', name: 'Jordanian Dinar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'KGS', symbol: 'с', name: 'Kyrgyzstani Som' },
  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel' },
  { code: 'KMF', symbol: 'CF', name: 'Comorian Franc' },
  { code: 'KPW', symbol: '₩', name: 'North Korean Won' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar' },
  { code: 'KYD', symbol: 'KY$', name: 'Cayman Islands Dollar' },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge' },
  { code: 'LAK', symbol: '₭', name: 'Lao Kip' },
  { code: 'LBP', symbol: 'L£', name: 'Lebanese Pound' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'LRD', symbol: 'L$', name: 'Liberian Dollar' },
  { code: 'LSL', symbol: 'L', name: 'Lesotho Loti' },
  { code: 'LYD', symbol: 'LD', name: 'Libyan Dinar' },
  { code: 'MAD', symbol: 'DH', name: 'Moroccan Dirham' },
  { code: 'MDL', symbol: 'MDL', name: 'Moldovan Leu' },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary' },
  { code: 'MKD', symbol: 'MKD', name: 'Macedonian Denar' },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tögrög' },
  { code: 'MOP', symbol: 'MOP$', name: 'Macanese Pataca' },
  { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya' },
  { code: 'MUR', symbol: 'Rs', name: 'Mauritian Rupee' },
  { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa' },
  { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical' },
  { code: 'NAD', symbol: 'N$', name: 'Namibian Dollar' },
  { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Córdoba' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'OMR', symbol: 'RO', name: 'Omani Rial' },
  { code: 'PAB', symbol: 'B/.', name: 'Panamanian Balboa' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guaraní' },
  { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'RSD', symbol: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  { code: 'SAR', symbol: 'SR', name: 'Saudi Riyal' },
  { code: 'SBD', symbol: 'SI$', name: 'Solomon Islands Dollar' },
  { code: 'SCR', symbol: 'SR', name: 'Seychellois Rupee' },
  { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'SHP', symbol: '£', name: 'Saint Helena Pound' },
  { code: 'SLE', symbol: 'Le', name: 'Sierra Leonean Leone' },
  { code: 'SOS', symbol: 'Sh', name: 'Somali Shilling' },
  { code: 'SRD', symbol: 'SR$', name: 'Surinamese Dollar' },
  { code: 'SSP', symbol: 'SSP', name: 'South Sudanese Pound' },
  { code: 'STN', symbol: 'Db', name: 'São Tomé and Príncipe Dobra' },
  { code: 'SVC', symbol: '₡', name: 'Salvadoran Colón' },
  { code: 'SYP', symbol: 'S£', name: 'Syrian Pound' },
  { code: 'SZL', symbol: 'E', name: 'Eswatini Lilangeni' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'TJS', symbol: 'SM', name: 'Tajikistani Somoni' },
  { code: 'TMT', symbol: 'T', name: 'Turkmenistani Manat' },
  { code: 'TND', symbol: 'DT', name: 'Tunisian Dinar' },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'TTD', symbol: 'TT$', name: 'Trinidad and Tobago Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'UYI', symbol: 'UYI', name: 'Uruguayan Peso (Indexed Units)' },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
  { code: 'UZS', symbol: 'soʻm', name: 'Uzbekistani Som' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'VUV', symbol: 'Vt', name: 'Vanuatu Vatu' },
  { code: 'WST', symbol: 'WS$', name: 'Samoan Tala' },
  { code: 'XAF', symbol: 'CFA', name: 'Central African CFA Franc' },
  { code: 'XCD', symbol: 'EC$', name: 'East Caribbean Dollar' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  { code: 'XPF', symbol: 'CFP', name: 'CFP Franc' },
  { code: 'YER', symbol: 'YR', name: 'Yemeni Rial' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'ZMW', symbol: 'K', name: 'Zambian Kwacha' },
  { code: 'ZWG', symbol: 'ZWG', name: 'Zimbabwean Gold' },
];

export const CURRENCIES: CurrencyInfo[] = CURRENCY_DEFS.map((d) => ({
  ...d,
  decimals: decimalsFor(d.code),
}));

function lookup(code: string | null | undefined): CurrencyInfo | null {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  return CURRENCIES.find((c) => c.code === upper) ?? null;
}

let memCode: string | null = null;

function writeLocalCurrency(code: string): void {
  try {
    localStorage.setItem(LS_KEY, code);
  } catch {
    /* storage full/blocked — vault copy still protects Tauri installs */
  }
}

/** Current ISO code: memory → localStorage → NGN default. Never throws. */
export function getCurrencyCode(): string {
  if (memCode && lookup(memCode)) return memCode;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const found = lookup(raw);
    if (found) {
      memCode = found.code;
      return found.code;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_CURRENCY_CODE;
}

/** Resolve a code to full info; unknown/empty falls back to current, then NGN. */
export function resolveCurrency(code?: string | null): CurrencyInfo {
  return (
    lookup(code ?? null) ??
    lookup(getCurrencyCode()) ??
    (CURRENCIES[0] as CurrencyInfo)
  );
}

export function getCurrency(): CurrencyInfo {
  return resolveCurrency(getCurrencyCode());
}

export function getCurrencySymbol(code?: string | null): string {
  return resolveCurrency(code).symbol;
}

/**
 * Merge the vault copy (called once during initStorage, beside the clock
 * anchor hydrate). Vault wins when valid; otherwise the local mirror stands.
 */
export async function hydrateCurrency(): Promise<CurrencyInfo> {
  if (isTauriRuntime()) {
    try {
      const raw = await dbGetSetting(DB_KEY);
      const found = lookup(raw);
      if (found) {
        memCode = found.code;
        writeLocalCurrency(found.code);
        return found;
      }
    } catch {
      /* vault read failed — local mirror still rules this session */
    }
  }
  return getCurrency();
}

/**
 * Change the shop currency. Persists everywhere (best-effort, never throws)
 * and broadcasts so subscribed UI updates instantly.
 */
export async function setCurrency(code: string): Promise<CurrencyInfo> {
  const cur = lookup(code) ?? (CURRENCIES[0] as CurrencyInfo);
  memCode = cur.code;
  writeLocalCurrency(cur.code);
  if (isTauriRuntime()) {
    try {
      await dbSetSetting(DB_KEY, cur.code);
    } catch {
      /* vault write failed — local mirror still holds the value */
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: cur }));
    }
  } catch {
    /* non-DOM environment */
  }
  return cur;
}

function group(num: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/** Screen display: symbol + grouped amount (e.g. ₦1,500.00, JP¥150). */
export function formatMoney(amount: number, code?: string | null): string {
  const cur = resolveCurrency(code);
  const out = `${cur.symbol}${group(Math.abs(amount), cur.decimals)}`;
  return amount < 0 ? `-${out}` : out;
}

/**
 * Printer-safe display: ISO code + grouped amount (e.g. "NGN 1,500.00").
 * Thermal printers on standard codepages cannot print ₦/€/₹ glyphs.
 */
export function moneyAscii(amount: number, code?: string | null): string {
  const cur = resolveCurrency(code);
  const out = `${cur.code} ${group(Math.abs(amount), cur.decimals)}`;
  return amount < 0 ? `-${out}` : out;
}
