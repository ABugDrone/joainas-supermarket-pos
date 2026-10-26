export type ThemeId =
  | 'SENIOR_CITIZEN-light'
  | 'SENIOR_CITIZEN-dark'
  | 'emerald-fresh'
  | 'royal-navy'
  | 'warm-amber'
  | 'midnight-black'
  | 'storebox-white';

export interface AppTheme {
  id: ThemeId;
  name: string;
  category: 'dark' | 'light';
  previewBg: string;
  previewCard: string;
  previewAccent: string;
  previewText: string;
  description: string;
  cssVars: Record<string, string>;
}

export const APP_THEMES: AppTheme[] = [
  {
    id: 'SENIOR_CITIZEN-light',
    name: 'Ruby Red',
    category: 'dark',
    previewBg: '#7F1D1D',
    previewCard: '#991B1B',
    previewAccent: '#EF4444',
    previewText: '#FEF2F2',
    description: 'Bold ruby red. High visibility for accessories.',
    cssVars: {
      '--bg-app': '#7F1D1D',
      '--bg-surface': '#991B1B',
      '--bg-sidebar': '#7F1D1D',
      '--bg-header': '#7F1D1D',
      '--bg-hover': '#B91C1C',
      '--bg-input': '#450A0A',
      '--border-color': '#991B1B',
      '--border-strong': '#DC2626',
      '--text-primary': '#FEF2F2',
      '--text-secondary': '#FECACA',
      '--text-muted': '#FECACA',
      '--text-inverse': '#7F1D1D',
      '--accent-color': '#EF4444',
      '--accent-hover': '#F87171',
      '--accent-orange': '#F59E0B',
      '--accent-orange-hover': '#FBBF24',
      '--success': '#34D399',
      '--success-bg': '#064E3B',
      '--warning': '#FBBF24',
      '--warning-bg': '#78350F',
      '--error': '#F87171',
      '--error-bg': '#7F1D1D',
      '--info': '#22D3EE',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'SENIOR_CITIZEN-dark',
    name: 'DIRM Dark',
    category: 'dark',
    previewBg: '#0F172A',
    previewCard: '#1E293B',
    previewAccent: '#6FB1FC',
    previewText: '#F1F5F9',
    description: 'Deep blue dark mode. Professional, comfortable for night shifts.',
    cssVars: {
      '--bg-app': '#0F172A',
      '--bg-surface': '#1E293B',
      '--bg-sidebar': '#1E293B',
      '--bg-header': '#1E293B',
      '--bg-hover': '#334155',
      '--bg-input': '#0F172A',
      '--border-color': '#334155',
      '--border-strong': '#475569',
      '--text-primary': '#F1F5F9',
      '--text-secondary': '#CBD5E1',
      '--text-muted': '#94A3B8',
      '--text-inverse': '#0F172A',
      '--accent-color': '#6FB1FC',
      '--accent-hover': '#4364F7',
      '--accent-orange': '#F09819',
      '--accent-orange-hover': '#FF512F',
      '--success': '#34D399',
      '--success-bg': '#064E3B',
      '--warning': '#FBBF24',
      '--warning-bg': '#78350F',
      '--error': '#F87171',
      '--error-bg': '#7F1D1D',
      '--info': '#22D3EE',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'emerald-fresh',
    name: 'Emerald Green',
    category: 'dark',
    previewBg: '#064E3B',
    previewCard: '#065F46',
    previewAccent: '#10B981',
    previewText: '#ECFDF5',
    description: 'Solid emerald. Fresh and vibrant.',
    cssVars: {
      '--bg-app': '#064E3B',
      '--bg-surface': '#065F46',
      '--bg-sidebar': '#065F46',
      '--bg-header': '#065F46',
      '--bg-hover': '#047857',
      '--bg-input': '#022C22',
      '--border-color': '#047857',
      '--border-strong': '#10B981',
      '--text-primary': '#ECFDF5',
      '--text-secondary': '#A7F3D0',
      '--text-muted': '#6EE7B7',
      '--text-inverse': '#064E3B',
      '--accent-color': '#10B981',
      '--accent-hover': '#34D399',
      '--accent-orange': '#F59E0B',
      '--accent-orange-hover': '#FBBF24',
      '--success': '#34D399',
      '--success-bg': '#064E3B',
      '--warning': '#FBBF24',
      '--warning-bg': '#78350F',
      '--error': '#F87171',
      '--error-bg': '#7F1D1D',
      '--info': '#22D3EE',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'royal-navy',
    name: 'Royal Navy',
    category: 'dark',
    previewBg: '#0C1929',
    previewCard: '#162A3F',
    previewAccent: '#3B82F6',
    previewText: '#E0EDFF',
    description: 'Corporate navy blue. Executive feel for a professional POS environment.',
    cssVars: {
      '--bg-app': '#0C1929',
      '--bg-surface': '#162A3F',
      '--bg-sidebar': '#162A3F',
      '--bg-header': '#162A3F',
      '--bg-hover': '#1E3A5F',
      '--bg-input': '#0C1929',
      '--border-color': '#1E3A5F',
      '--border-strong': '#2563EB',
      '--text-primary': '#E0EDFF',
      '--text-secondary': '#93C5FD',
      '--text-muted': '#60A5FA',
      '--text-inverse': '#0C1929',
      '--accent-color': '#3B82F6',
      '--accent-hover': '#60A5FA',
      '--accent-orange': '#F59E0B',
      '--accent-orange-hover': '#FBBF24',
      '--success': '#34D399',
      '--success-bg': '#064E3B',
      '--warning': '#FBBF24',
      '--warning-bg': '#78350F',
      '--error': '#F87171',
      '--error-bg': '#7F1D1D',
      '--info': '#22D3EE',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'warm-amber',
    name: 'Gold',
    category: 'dark',
    previewBg: '#78350F',
    previewCard: '#92400E',
    previewAccent: '#F59E0B',
    previewText: '#FFFBEB',
    description: 'Solid gold. Warm and premium.',
    cssVars: {
      '--bg-app': '#78350F',
      '--bg-surface': '#92400E',
      '--bg-sidebar': '#92400E',
      '--bg-header': '#92400E',
      '--bg-hover': '#B45309',
      '--bg-input': '#451A03',
      '--border-color': '#92400E',
      '--border-strong': '#D97706',
      '--text-primary': '#FFFBEB',
      '--text-secondary': '#FDE68A',
      '--text-muted': '#FCD34D',
      '--text-inverse': '#78350F',
      '--accent-color': '#F59E0B',
      '--accent-hover': '#FBBF24',
      '--accent-orange': '#EF4444',
      '--accent-orange-hover': '#F87171',
      '--success': '#34D399',
      '--success-bg': '#064E3B',
      '--warning': '#FBBF24',
      '--warning-bg': '#78350F',
      '--error': '#F87171',
      '--error-bg': '#7F1D1D',
      '--info': '#22D3EE',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'midnight-black',
    name: 'AMOLED Black',
    category: 'dark',
    previewBg: '#000000',
    previewCard: '#111111',
    previewAccent: '#3B82F6',
    previewText: '#FFFFFF',
    description: 'Pure black OLED theme. Maximum battery efficiency, zero eye strain.',
    cssVars: {
      '--bg-app': '#000000',
      '--bg-surface': '#111111',
      '--bg-sidebar': '#111111',
      '--bg-header': '#111111',
      '--bg-hover': '#1A1A1A',
      '--bg-input': '#0A0A0A',
      '--border-color': '#222222',
      '--border-strong': '#333333',
      '--text-primary': '#FFFFFF',
      '--text-secondary': '#A3A3A3',
      '--text-muted': '#808080',
      '--text-inverse': '#000000',
      '--accent-color': '#3B82F6',
      '--accent-hover': '#60A5FA',
      '--accent-orange': '#F59E0B',
      '--accent-orange-hover': '#FBBF24',
      '--success': '#22C55E',
      '--success-bg': '#052E16',
      '--warning': '#FBBF24',
      '--warning-bg': '#451A03',
      '--error': '#EF4444',
      '--error-bg': '#450A0A',
      '--info': '#06B6D4',
      '--info-bg': '#164E63',
    },
  },
  {
    id: 'storebox-white',
    name: 'STOREBOX WHITE',
    category: 'light',
    previewBg: '#FFFFFF',
    previewCard: '#F5F5F5',
    previewAccent: '#0052D4',
    previewText: '#0A0A0A',
    description: 'Pure boiled-rice white. Dark grey text, default menu colours.',
    cssVars: {
      '--bg-app': '#FFFFFF',
      '--bg-surface': '#FFFFFF',
      '--bg-sidebar': '#FFFFFF',
      '--bg-header': '#FFFFFF',
      '--bg-hover': '#F5F5F5',
      '--bg-input': '#FFFFFF',
      '--border-color': '#E5E5E5',
      '--border-strong': '#D4D4D4',
      '--text-primary': '#0A0A0A',
      '--text-secondary': '#1A1A1A',
      '--text-muted': '#262626',
      '--text-inverse': '#FFFFFF',
      '--accent-color': '#0052D4',
      '--accent-hover': '#4364F7',
      '--accent-orange': '#FF512F',
      '--accent-orange-hover': '#F09819',
      '--success': '#047857',
      '--success-bg': '#ECFDF5',
      '--warning': '#B45309',
      '--warning-bg': '#FFFBEB',
      '--error': '#B91C1C',
      '--error-bg': '#FEF2F2',
      '--info': '#0E7490',
      '--info-bg': '#ECFEFF',
    },
  },
];

// v1.5.1 full build: fresh key (old installs don't carry over) and
// AMOLED Black is the default theme.
const THEME_STORAGE_KEY = 'dirms_app_theme_v1';
// v2.0.6 Rabiu build: once per install, move the saved theme to the new
// STOREBOX WHITE default. After that the user's choice is respected again.
const STOREBOX_DEFAULT_MIGRATION_KEY = 'rabiu_storebox_white_default_v1';
const DEFAULT_THEME: ThemeId = 'storebox-white';

export const getSavedTheme = (): ThemeId => {
  try {
    if (!localStorage.getItem(STOREBOX_DEFAULT_MIGRATION_KEY)) {
      localStorage.setItem(STOREBOX_DEFAULT_MIGRATION_KEY, '1');
      localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
      return DEFAULT_THEME;
    }
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && APP_THEMES.some((t) => t.id === saved)) {
      return saved as ThemeId;
    }
  } catch (e) {
    console.error('Failed to load theme from localStorage', e);
  }
  return DEFAULT_THEME;
};

export const applyThemeToDocument = (themeId: ThemeId) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (e) {
    console.error('Failed to save theme to localStorage', e);
  }

  const themeObj = APP_THEMES.find((t) => t.id === themeId) || APP_THEMES[0];
  const root = document.documentElement;

  // Apply CSS custom properties
  Object.entries(themeObj.cssVars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });

  // Toggle dark/light class on html element
  if (themeObj.category === 'light') {
    root.classList.add('light-theme');
    root.classList.remove('dark-theme');
  } else {
    root.classList.add('dark-theme');
    root.classList.remove('light-theme');
  }

  // Per-theme hook (e.g. theme-storebox-white) so a single theme can add
  // overrides without leaking them into the other themes.
  Array.from(root.classList)
    .filter((c) => c.startsWith('theme-'))
    .forEach((c) => root.classList.remove(c));
  root.classList.add(`theme-${themeObj.id}`);
};

// ================= FONT SIZE TYPOGRAPHY ================= //
export type FontSizeId = 'normal' | 'medium' | 'large' | 'xlarge';

export interface FontSizeOption {
  id: FontSizeId;
  name: string;
  scale: string;
  description: string;
}

export const FONT_SIZES: FontSizeOption[] = [
  { id: 'normal', name: 'Standard (100%)', scale: '100%', description: 'Default balanced sizing' },
  { id: 'medium', name: 'Medium (112%)', scale: '112%', description: 'Slightly larger for easier reading' },
  { id: 'large', name: 'Large (125%)', scale: '125%', description: 'High visibility for cashier screens' },
  { id: 'xlarge', name: 'Extra Large (138%)', scale: '138%', description: 'Maximum legibility' },
];

const FONT_SIZE_STORAGE_KEY = 'senior_citizen_accessories_app_font_size_v1';

export const getSavedFontSize = (): FontSizeId => {
  try {
    const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (saved && FONT_SIZES.some((s) => s.id === saved)) {
      return saved as FontSizeId;
    }
  } catch (e) {
    console.error('Failed to load font size', e);
  }
  return 'normal';
};

export const applyFontSizeToDocument = (sizeId: FontSizeId) => {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, sizeId);
  } catch (e) {
    console.error('Failed to save font size', e);
  }

  const found = FONT_SIZES.find((s) => s.id === sizeId) || FONT_SIZES[0];
  document.documentElement.style.fontSize = found.scale;
};

// ================= FONT FAMILY TYPOGRAPHY ================= //
export type FontFamilyId = 'inter' | 'mono' | 'serif' | 'compact';

export interface FontFamilyOption {
  id: FontFamilyId;
  name: string;
  familyCss: string;
  description: string;
}

export const FONT_FAMILIES: FontFamilyOption[] = [
  {
    id: 'inter',
    name: 'Inter (Recommended)',
    familyCss: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    description: 'Clean, modern and highly readable. Ships with Windows 11+',
  },
  {
    id: 'mono',
    name: 'Monospace',
    familyCss: 'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Monaco, Consolas, monospace',
    description: 'Fixed-width technical font. Good for ledgers and receipts.',
  },
  {
    id: 'serif',
    name: 'Serif',
    familyCss: 'Georgia, Cambria, "Times New Roman", Times, serif',
    description: 'Classic elegant typography.',
  },
  {
    id: 'compact',
    name: 'Compact',
    familyCss: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
    description: 'Space-efficient display font.',
  },
];

const FONT_FAMILY_STORAGE_KEY = 'senior_citizen_accessories_app_font_family_v2';

export const getSavedFontFamily = (): FontFamilyId => {
  try {
    const saved = localStorage.getItem(FONT_FAMILY_STORAGE_KEY);
    if (saved && FONT_FAMILIES.some((f) => f.id === saved)) {
      return saved as FontFamilyId;
    }
  } catch (e) {
    console.error('Failed to load font family', e);
  }
  return 'inter';
};

export const applyFontFamilyToDocument = (familyId: FontFamilyId) => {
  try {
    localStorage.setItem(FONT_FAMILY_STORAGE_KEY, familyId);
  } catch (e) {
    console.error('Failed to save font family', e);
  }

  const found = FONT_FAMILIES.find((f) => f.id === familyId) || FONT_FAMILIES[0];
  document.documentElement.style.fontFamily = found.familyCss;
};
