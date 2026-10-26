import React from 'react';
import { Lock, Phone } from 'lucide-react';
import { EDITION, gmailComposeUrl, whatsappDmUrl, premiumInquiryText } from '../config/edition';

interface PremiumLockProps {
  feature: string;
  title: string;
  whatItDoes: string;
  example: string;
}

const openExternal = (url: string) => {
  // Tauri shell open when available, otherwise a normal tab.
  (async () => {
    try {
      const { isTauriRuntime } = await import('../utils/db');
      if (isTauriRuntime()) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
        return;
      }
    } catch {}
    window.open(url, '_blank', 'noopener,noreferrer');
  })();
};

/**
  * Legacy upsell gate (unused in the v1.5.1 full build — every module is
  * unlocked). Kept so no import breaks; renders nothing reachable.
 * Contact icons are icon-only (no email/number text on the buttons).
 */
export const PremiumLock: React.FC<PremiumLockProps> = ({ feature, title, whatItDoes, example }) => {
  const subject = `Rabiu Entreprises Help — ${feature}`;
  const body =
    `Hello,\n\nI am using ${EDITION.shortName} v${EDITION.version} (Full) ` +
    `and want the PREMIUM version to unlock "${feature}". Please assist.\n\nThank you.`;

  return (
    <div className="flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-2xl p-8 text-center">
        {/* Giant padlock */}
        <div className="mx-auto w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/25 to-amber-700/10 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-950/40">
          <Lock className="w-12 h-12 text-amber-400" strokeWidth={2.5} />
        </div>

        <div className="mt-4 inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">
          Premium feature · Locked
        </div>

        <h2 className="mt-3 text-xl font-black text-[var(--text-primary)]">{title}</h2>

        <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">{whatItDoes}</p>
        <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
          <span className="font-bold text-[var(--text-secondary)]">Example: </span>
          {example}
        </p>

        <div className="mt-4 p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed">
          Your locked information is still saved on this device, but encrypted to the Premium version.
          When you upgrade, everything locked today appears automatically — nothing is lost.
          <span className="block mt-1.5 font-black text-sm text-[var(--text-primary)]">
            Premium: {EDITION.premiumPrice} (one-time)
          </span>
          <span className="block mt-1 font-semibold">
            Fastest way to get Premium: Call / SMS / WhatsApp {EDITION.supportWhatsAppDisplay}.
          </span>
        </div>

        {/* Icon-only contact buttons — no email/number text on the buttons */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            onClick={() => openExternal(gmailComposeUrl(subject, body))}
            title="Contact via Gmail"
            aria-label="Contact via Gmail"
            className="w-14 h-14 rounded-2xl bg-white hover:brightness-95 flex items-center justify-center shadow-lg transition active:scale-95 p-2.5"
          >
            <img src="/icons/brand-gmail.svg" alt="Gmail" className="w-full h-full object-contain" />
          </button>
          <button
            onClick={() => openExternal(whatsappDmUrl(premiumInquiryText(feature)))}
            title="Chat on WhatsApp"
            aria-label="Chat on WhatsApp"
            className="w-14 h-14 rounded-2xl bg-white hover:brightness-95 flex items-center justify-center shadow-lg transition active:scale-95 p-2"
          >
            <img src="/icons/brand-whatsapp.svg" alt="WhatsApp" className="w-full h-full object-contain" />
          </button>
          <button
            onClick={() => openExternal(`tel:${EDITION.supportWhatsAppDisplay.replace(/\s/g, '')}`)}
            title="Call or SMS"
            aria-label="Call or SMS"
            className="w-14 h-14 rounded-2xl bg-[var(--accent-color)] hover:brightness-110 text-white flex items-center justify-center shadow-lg transition active:scale-95"
          >
            <Phone className="w-7 h-7" />
          </button>
          <button
            onClick={() => openExternal(EDITION.supportFacebook)}
            title="Facebook Profile"
            aria-label="Facebook Profile"
            className="w-14 h-14 rounded-2xl bg-[#1877F2] hover:brightness-110 text-white flex items-center justify-center shadow-lg shadow-blue-950/40 transition active:scale-95"
          >
            <img src="/icons/brand-facebook.svg" alt="Facebook" className="w-7 h-7" />
          </button>
        </div>
<p className="mt-2 text-[11px] text-[var(--text-muted)]">Tap an icon to reach support.</p>
      </div>
    </div>
  );
};
