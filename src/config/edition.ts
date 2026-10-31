// Joainas Mart v2.0.6 — full build, all features unlocked.
// Carries all v1.5.x trusted-clock hardening plus v1.6.0 currency selection,
// plus installment ledger, service units and logo receipts.

export const EDITION = {
  appName: 'Joainas Mart Inventory Management System',
  shortName: 'Joainas Mart',
  version: '2.0.6',
  editionLabel: 'Professional',
  isOpenSource: false,
  // Default theme — STOREBOX WHITE for the Joainas Mart build.
  defaultThemeId: 'storebox-white' as const,
  // Legacy premium price, kept for reference (no upsell in this build).
  premiumPrice: '₦250,000',
  supportEmail: 'dronebugtechnologies@gmail.com',
  supportWhatsAppNumber: '2347035716349',
  supportWhatsAppDisplay: '+2347035716349',
  supportFacebook: 'https://web.facebook.com/azeez.yun',
} as const;

export const gmailComposeUrl = (subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    EDITION.supportEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const whatsappDmUrl = (text: string) =>
  `https://wa.me/${EDITION.supportWhatsAppNumber}?text=${encodeURIComponent(text)}`;

export const premiumInquiryText = (feature: string) =>
  `Hello, I am using ${EDITION.shortName} v${EDITION.version} and want help with "${feature}". Please assist.`;
