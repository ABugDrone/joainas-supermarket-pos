import React, { useState } from 'react';
import { Palette, Type, Check, X, Monitor, Lock } from 'lucide-react';
import { EDITION, gmailComposeUrl, whatsappDmUrl, premiumInquiryText } from '../config/edition';
import {
  APP_THEMES,
  ThemeId,
  AppTheme,
  FONT_SIZES,
  FontSizeId,
  FONT_FAMILIES,
  FontFamilyId,
  applyThemeToDocument,
  applyFontSizeToDocument,
  applyFontFamilyToDocument,
} from '../utils/theme';
import { useToast } from './Toast';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  activeTheme: ThemeId;
  activeFontSize: FontSizeId;
  activeFontFamily: FontFamilyId;
  onSelectTheme: (themeId: ThemeId) => void;
  onSelectFontSize: (sizeId: FontSizeId) => void;
  onSelectFontFamily: (familyId: FontFamilyId) => void;
  onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  activeTheme,
  activeFontSize,
  activeFontFamily,
  onSelectTheme,
  onSelectFontSize,
  onSelectFontFamily,
  onClose,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'theme' | 'fontSize' | 'fontFamily'>('theme');

  if (!isOpen) return null;

  const handleSelectTheme = (theme: AppTheme) => {
    applyThemeToDocument(theme.id);
    onSelectTheme(theme.id);
    showToast(`Theme changed to "${theme.name}".`, 'success');
  };

  const handleSelectSize = (sizeId: FontSizeId, sizeName: string) => {
    applyFontSizeToDocument(sizeId);
    onSelectFontSize(sizeId);
    showToast(`Font size updated to "${sizeName}".`, 'info');
  };

  const handleSelectFamily = (familyId: FontFamilyId, familyName: string) => {
    applyFontFamilyToDocument(familyId);
    onSelectFontFamily(familyId);
    showToast(`Font changed to "${familyName}".`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Display Settings</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Customize colors, font size, and typography.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] rounded-lg border border-[var(--border-color)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 bg-[var(--bg-app)] p-2 mx-6 mt-5 rounded-xl border border-[var(--border-color)]">
          <button
            onClick={() => setActiveTab('theme')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
              activeTab === 'theme'
                ? 'bg-[var(--accent-color)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Colors</span>
          </button>

          <button
            onClick={() => setActiveTab('fontSize')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
              activeTab === 'fontSize'
                ? 'bg-[var(--accent-color)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>Size</span>
          </button>

          <button
            onClick={() => setActiveTab('fontFamily')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
              activeTab === 'fontFamily'
                ? 'bg-[var(--accent-color)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Font</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 max-h-[55vh] overflow-y-auto">
          {/* Tab 1: Color Themes — all unlocked in Full; dark-only in Joainas Mart open-source */}
          {activeTab === 'theme' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-xs text-[var(--text-secondary)]">
                {EDITION.isOpenSource ? (
                  <>
                    <span className="font-bold text-emerald-300">Joainas Mart: </span>
                    dark theme included. More themes unlock with the Full edition.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-emerald-300">PRO Full: </span>
                    all themes are unlocked. Pick any colour — your choice is saved on this device.
                  </>
                )}
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APP_THEMES.map((theme) => {
                const isSelected = activeTheme === theme.id;
                const isLocked = EDITION.isOpenSource && theme.id !== EDITION.defaultThemeId;
                if (isLocked) {
                  const waUrl = whatsappDmUrl(premiumInquiryText(`Theme: ${theme.name}`));
                  const mailUrl = gmailComposeUrl(
                    `Joainas Mart Theme: ${theme.name}`,
                    `Hello,\n\nI am using ${EDITION.shortName} v${EDITION.version} and need help with the theme "${theme.name}". Please assist.\n\nThank you.`
                  );
                  const openUrl = (url: string) => {
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
                  return (
                    <div
                      key={theme.id}
                      className="p-4 rounded-xl border border-amber-500/40 bg-[var(--bg-app)] flex flex-col justify-between gap-3 relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{theme.name}</span>
                        <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          <Lock className="w-3 h-3" />
                          Premium
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2">{theme.description}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openUrl(mailUrl)}
                          title="Contact via Gmail"
                          aria-label="Contact via Gmail"
                          className="w-10 h-10 rounded-xl bg-white flex items-center justify-center hover:brightness-95 active:scale-95 transition p-1.5"
                        >
                          <img src="/icons/brand-gmail.svg" alt="Gmail" className="w-full h-full object-contain" />
                        </button>
                        <button
                          onClick={() => openUrl(waUrl)}
                          title="Chat on WhatsApp"
                          aria-label="Chat on WhatsApp"
                          className="w-10 h-10 rounded-xl bg-white flex items-center justify-center hover:brightness-95 active:scale-95 transition p-1.5"
                        >
                          <img src="/icons/brand-whatsapp.svg" alt="WhatsApp" className="w-full h-full object-contain" />
                        </button>
                        <button
                          onClick={() => openUrl(EDITION.supportFacebook)}
                          title="Facebook Profile"
                          aria-label="Facebook Profile"
                          className="w-10 h-10 rounded-xl bg-[#1877F2] text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition"
                        >
                          <img src="/icons/brand-facebook.svg" alt="Facebook" className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] text-[var(--text-muted)] ml-auto">Tap an icon to upgrade</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={theme.id}
                    onClick={() => handleSelectTheme(theme)}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-3 relative ${
                      isSelected
                        ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/5 shadow-md ring-2 ring-[var(--accent-color)]/30'
                        : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {theme.name}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-1 bg-[var(--accent-color)] text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          <Check className="w-3 h-3 stroke-[3]" />
                          Active
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">{theme.description}</p>

                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full border-2 border-[var(--border-color)] shadow-sm"
                          style={{ backgroundColor: theme.previewBg }}
                          title="Background"
                        />
                        <span
                          className="w-5 h-5 rounded-full border-2 border-[var(--border-color)] shadow-sm"
                          style={{ backgroundColor: theme.previewCard }}
                          title="Card Surface"
                        />
                        <span
                          className="w-5 h-5 rounded-full border-2 border-[var(--border-color)] shadow-sm"
                          style={{ backgroundColor: theme.previewAccent }}
                          title="Accent Color"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase ml-auto">
                        {theme.category === 'light' ? 'Light' : 'Dark'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          )}

          {/* Tab 2: Font Size */}
          {activeTab === 'fontSize' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                Adjust the text size for better visibility.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FONT_SIZES.map((sizeOpt) => {
                  const isSelected = activeFontSize === sizeOpt.id;
                  return (
                    <button
                      key={sizeOpt.id}
                      onClick={() => handleSelectSize(sizeOpt.id, sizeOpt.name)}
                      className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/5 shadow-md ring-2 ring-[var(--accent-color)]/30'
                          : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{sizeOpt.name}</span>
                        {isSelected && (
                          <span className="flex items-center gap-1 bg-[var(--accent-color)] text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase">
                            <Check className="w-3 h-3 stroke-[3]" />
                            Active
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-muted)]">{sizeOpt.description}</p>

                      <div className="mt-1 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg">
                        <span className="text-[var(--accent-color)] font-semibold text-xs">Sample: </span>
                        <span className="text-[var(--text-primary)] font-bold" style={{ fontSize: sizeOpt.scale }}>
                          ₦125,000.00
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Font Family */}
          {activeTab === 'fontFamily' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                Choose a typeface for the entire application.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FONT_FAMILIES.map((familyOpt) => {
                  const isSelected = activeFontFamily === familyOpt.id;
                  return (
                    <button
                      key={familyOpt.id}
                      onClick={() => handleSelectFamily(familyOpt.id, familyOpt.name)}
                      className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/5 shadow-md ring-2 ring-[var(--accent-color)]/30'
                          : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{familyOpt.name}</span>
                        {isSelected && (
                          <span className="flex items-center gap-1 bg-[var(--accent-color)] text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase">
                            <Check className="w-3 h-3 stroke-[3]" />
                            Active
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-muted)]">{familyOpt.description}</p>

                      <div className="mt-1 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg">
                        <div className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: familyOpt.familyCss }}>
                          JOAINAS MART TERMINAL
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5" style={{ fontFamily: familyOpt.familyCss }}>
                            Receipt #RCT-2026-8812 • ₦45,500
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border-color)] px-6 py-4 bg-[var(--bg-app)]">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm rounded-xl shadow-sm transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
