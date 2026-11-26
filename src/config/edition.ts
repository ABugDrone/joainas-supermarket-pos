// Alhaji Rabiu Global Entreprises v2.1.0 — full/professional custom build.
// Formerly Rabiu Entreprises; the old name is kept only in migration logic
// and release notes, never in the app UI. Built on trusted-clock hardening,
// currency selection, the installment ledger, service units, box-first sale
// lines, discounts/coupons and box-derived wholesale piece pricing.

export const EDITION = {
  appName: 'Alhaji Rabiu Global Entreprises',
  shortName: 'Alhaji Rabiu Global Entreprises',
  version: '2.1.0',
  editionLabel: 'Full Build',
  isOpenSource: false,
  // All themes are unlocked. STOREBOX WHITE matches the old Rabiu build.
  defaultThemeId: 'storebox-white' as const,
  openSourceThemeIds: [] as readonly string[],
  // This is a fully unlocked custom build: no upsell, no upgrade price.
  premiumPrice: '',
  premiumPriceEUR: '',
  premiumPriceNGN: '',
  premiumPriceNote: '',
  upgradeTarget: 'Alhaji Rabiu Global Entreprises Full Build',
  // Developer/support contact stays with Dronebug Technologies & Services.
  supportEmail: 'dronebugtechnologies@gmail.com',
  supportWhatsAppNumber: '2347035716349',
  supportWhatsAppDisplay: '+2347035716349',
  supportFacebook: 'https://web.facebook.com/azeez.yun',
} as const;

/** Default tagline/subtitle; no old-company name is shown in the UI. */
export const BRAND_EXPANSION = 'Inventory Management System';

/**
 * v2.1.0 — one identity everywhere: app, window, backups, receipts and
 * financial reports all read "Alhaji Rabiu Global Entreprises".
 * The header name is user-configurable in Hardware Config; these are defaults.
 */
export const BRANDED_DOCUMENT_NAME = 'Alhaji Rabiu Global Entreprises';
export const BRANDED_NAME_LINE = 'Alhaji Rabiu Global Entreprises';
export const BRANDED_NICKNAME_LINE = '';

/** Every feature is already unlocked; these strings remain for safe imports. */
export const UPGRADE_MESSAGE = 'All features are unlocked in this full build.';
export const UPGRADE_PRICE_LINE = '';

/** Custom full builds never require a license-key activation. */
export const LICENSED_APP_NAMES: readonly string[] = [];
export const requiresLicenseActivation: boolean = false;

/** Every theme may be selected in this full build. */
export function isThemeAvailable(_themeId: string): boolean {
  return true;
}

export const gmailComposeUrl = (subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    EDITION.supportEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const whatsappDmUrl = (text: string) =>
  `https://wa.me/${EDITION.supportWhatsAppNumber}?text=${encodeURIComponent(text)}`;

export const premiumInquiryText = (feature: string) =>
  `Hello, I am using ${EDITION.shortName} v${EDITION.version} (${EDITION.editionLabel}) and need help with "${feature}". Please assist.`;
