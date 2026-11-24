// DIRMS Storebox v2.1.0 — free / open-source edition.
// DIRMS = DroneBug Inventory & Records Management System.
// Built on the v1.5.x trusted-clock hardening, v1.6.0 currency selection,
// the installment ledger, service units and v2.0.9 box-first sale lines.
// v2.1.0: box-derived wholesale piece pricing, fully customizable receipts,
// and the open-source feature gate (PRO / customized-version upsell).

export const EDITION = {
  appName: 'DIRMS Storebox',
  shortName: 'DIRMS Storebox',
  version: '2.1.0',
  editionLabel: 'Open Source',
  isOpenSource: true,
  // Only these two themes are usable in the free edition: one light, one dark.
  defaultThemeId: 'storebox-white' as const,
  openSourceThemeIds: ['storebox-white', 'midnight-black'] as readonly string[],
  // Upgrade price shown on every locked-feature screen.
  premiumPrice: '€170 / ₦250,000 + taxes',
  premiumPriceEUR: '€170',
  premiumPriceNGN: '₦250,000',
  premiumPriceNote: 'one-time',
  upgradeTarget: 'DIRMS Storebox PRO or a customized version',
  supportEmail: 'dronebugtechnologies@gmail.com',
  supportWhatsAppNumber: '2347035716349',
  supportWhatsAppDisplay: '+2347035716349',
  supportFacebook: 'https://web.facebook.com/azeez.yun',
} as const;

/** The expansion behind the DIRMS name; used as the default tagline/subtitle. */
export const BRAND_EXPANSION = 'DroneBug Inventory & Records Management System';

/**
 * v2.1.0 — one identity everywhere: app, window, backups, receipts and
 * financial reports all read "DIRMS Storebox". There is no nickname line.
 * The header name is user-configurable in Hardware Config; these are defaults.
 */
export const BRANDED_DOCUMENT_NAME = 'DIRMS Storebox';
export const BRANDED_NAME_LINE = 'DIRMS Storebox';
export const BRANDED_NICKNAME_LINE = '';

/** Standard copy for every locked feature in the open-source edition. */
export const UPGRADE_MESSAGE = `Get ${EDITION.upgradeTarget} to unlock this feature.`;
export const UPGRADE_PRICE_LINE = `${EDITION.premiumPrice} (${EDITION.premiumPriceNote})`;

/** Free/open-source editions never require a license-key activation. */
export const LICENSED_APP_NAMES: readonly string[] = ['DIRMS Storebox PRO'];
export const requiresLicenseActivation: boolean = LICENSED_APP_NAMES.includes(
  EDITION.appName
);

/** True when a theme may be selected in the current edition. */
export function isThemeAvailable(themeId: string): boolean {
  return !EDITION.isOpenSource || EDITION.openSourceThemeIds.includes(themeId);
}

export const gmailComposeUrl = (subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    EDITION.supportEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const whatsappDmUrl = (text: string) =>
  `https://wa.me/${EDITION.supportWhatsAppNumber}?text=${encodeURIComponent(text)}`;

export const premiumInquiryText = (feature: string) =>
  `Hello, I am using ${EDITION.shortName} v${EDITION.version} (${EDITION.editionLabel}) and want the ${EDITION.upgradeTarget} to unlock "${feature}". Please assist.`;
