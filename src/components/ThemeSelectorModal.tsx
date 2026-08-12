import React, { useState } from 'react';
import { Palette, Type, Check, X, Monitor } from 'lucide-react';
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
          {/* Tab 1: Color Themes */}
          {activeTab === 'theme' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APP_THEMES.map((theme) => {
                const isSelected = activeTheme === theme.id;
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
                          Joainas Mart POS
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5" style={{ fontFamily: familyOpt.familyCss }}>
                          Receipt #JM-2026-8812 • ₦45,500
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
