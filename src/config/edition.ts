// Kingzzy Akamelu Resources v2.0.9 — full build, all features unlocked.
// Carries all v1.5.x trusted-clock hardening plus v1.6.0 currency selection,
// plus installment ledger, service units, carton/pack + pieces sales and receipts.
// v2.0.9: box-first split sale lines with a balanced wholesale-per-piece note,
// and native receipts no longer spool the unsupported print-density command.

export const EDITION = {
  appName: 'Kingzzy Akamelu Resources',
  shortName: 'Kingzzy Akamelu Resources',
  version: '2.0.9',
  editionLabel: 'Professional',
  isOpenSource: false,
  // Default theme — STOREBOX WHITE for the Kingzzy Akamelu Resources build.
  defaultThemeId: 'storebox-white' as const,
  // Legacy premium price, kept for reference (no upsell in this build).
  premiumPrice: '₦250,000',
  supportEmail: 'dronebugtechnologies@gmail.com',
  supportWhatsAppNumber: '2347035716349',
  supportWhatsAppDisplay: '+2347035716349',
  supportFacebook: 'https://web.facebook.com/azeez.yun',
} as const;

/**
 * v2.0.8 — the FULL identity is used ONLY on receipts and financial reports.
 * Everywhere else (app name, dashboard, backup, database) the name is simply
 * EDITION.appName: "Kingzzy Akamelu Resources".
 * The two display lines concatenate to exactly BRANDED_DOCUMENT_NAME.
 */
export const BRANDED_DOCUMENT_NAME = 'Kingzzy Akamelu Resources(Fine boy)';
export const BRANDED_NAME_LINE = 'Kingzzy Akamelu Resources';
export const BRANDED_NICKNAME_LINE = '(Fine boy)';

/**
 * Only the DIRMS Storebox PRO edition uses the EULA + license-key activation.
 * Customized-name bundles (Kingzzy, etc.) must NEVER be gated by a license.
 */
export const LICENSED_APP_NAMES: readonly string[] = ['DIRMS Storebox PRO'];
export const requiresLicenseActivation: boolean = LICENSED_APP_NAMES.includes(
  EDITION.appName
);

export const gmailComposeUrl = (subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    EDITION.supportEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const whatsappDmUrl = (text: string) =>
  `https://wa.me/${EDITION.supportWhatsAppNumber}?text=${encodeURIComponent(text)}`;

export const premiumInquiryText = (feature: string) =>
  `Hello, I am using ${EDITION.shortName} v${EDITION.version} and want help with "${feature}". Please assist.`;
