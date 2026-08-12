export type ThemeId =
  | 'joainas-light'
  | 'joainas-dark'
  | 'emerald-fresh'
  | 'royal-navy'
  | 'warm-amber'
  | 'midnight-black';

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
    id: 'joainas-light',
    name: 'Joainas Light',
    category: 'light',
    previewBg: '#F1F5F9',
    previewCard: '#FFFFFF',
    previewAccent: '#0052D4',
    previewText: '#0F172A',
    description: 'Clean, bright default theme with brand blue accents. Easy on the eyes.',
    cssVars: {
      '--bg-app': '#F1F5F9',
      '--bg-surface': '#FFFFFF',
      '--bg-sidebar': '#FFFFFF',
      '--bg-header': '#FFFFFF',
      '--bg-hover': '#F1F5F9',
      '--bg-input': '#F8FAFC',
      '--border-color': '#E2E8F0',
      '--border-strong': '#CBD5E1',
      '--text-primary': '#0F172A',
      '--text-secondary': '#1E293B',
      '--text-muted': '#334155',
      '--text-inverse': '#FFFFFF',
      '--accent-color': '#0052D4',
      '--accent-hover': '#4364F7',
      '--accent-orange': '#FF512F',
      '--accent-orange-hover': '#F09819',
      '--success': '#059669',
      '--success-bg': '#ECFDF5',
      '--warning': '#D97706',
      '--warning-bg': '#FFFBEB',
      '--error': '#DC2626',
      '--error-bg': '#FEF2F2',
      '--info': '#0891B2',
      '--info-bg': '#ECFEFF',
    },
  },
  {
    id: 'joainas-dark',
    name: 'Joainas Dark',
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
    name: 'Emerald Fresh',
    category: 'light',
    previewBg: '#F0FDF9',
    previewCard: '#FFFFFF',
    previewAccent: '#059669',
    previewText: '#064E3B',
    description: 'Fresh green tones inspired by organic groceries and fresh seafood.',
    cssVars: {
      '--bg-app': '#F0FDF9',
      '--bg-surface': '#FFFFFF',
      '--bg-sidebar': '#FFFFFF',
      '--bg-header': '#FFFFFF',
      '--bg-hover': '#E6FCF5',
      '--bg-input': '#F0FDF9',
      '--border-color': '#A7F3D0',
      '--border-strong': '#6EE7B7',
      '--text-primary': '#064E3B',
      '--text-secondary': '#065F46',
      '--text-muted': '#047857',
      '--text-inverse': '#FFFFFF',
      '--accent-color': '#059669',
      '--accent-hover': '#10B981',
      '--accent-orange': '#D97706',
      '--accent-orange-hover': '#F59E0B',
      '--success': '#059669',
      '--success-bg': '#ECFDF5',
      '--warning': '#D97706',
      '--warning-bg': '#FFFBEB',
      '--error': '#DC2626',
      '--error-bg': '#FEF2F2',
      '--info': '#0891B2',
      '--info-bg': '#ECFEFF',
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
    name: 'Warm Amber',
    category: 'light',
    previewBg: '#FFFBEB',
    previewCard: '#FFFFFF',
    previewAccent: '#D97706',
    previewText: '#78350F',
    description: 'Warm golden tones. Cozy and inviting, like a neighborhood store.',
    cssVars: {
      '--bg-app': '#FFFBEB',
      '--bg-surface': '#FFFFFF',
      '--bg-sidebar': '#FFFFFF',
      '--bg-header': '#FFFFFF',
      '--bg-hover': '#FEF3C7',
      '--bg-input': '#FFFBEB',
      '--border-color': '#FDE68A',
      '--border-strong': '#F59E0B',
      '--text-primary': '#78350F',
      '--text-secondary': '#92400E',
      '--text-muted': '#A16207',
      '--text-inverse': '#FFFFFF',
      '--accent-color': '#D97706',
      '--accent-hover': '#F59E0B',
      '--accent-orange': '#DC2626',
      '--accent-orange-hover': '#EF4444',
      '--success': '#059669',
      '--success-bg': '#ECFDF5',
      '--warning': '#D97706',
      '--warning-bg': '#FFFBEB',
      '--error': '#DC2626',
      '--error-bg': '#FEF2F2',
      '--info': '#0891B2',
      '--info-bg': '#ECFEFF',
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
      '--text-muted': '#737373',
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
];

const THEME_STORAGE_KEY = 'joainas_app_theme_v2';

export const getSavedTheme = (): ThemeId => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && APP_THEMES.some((t) => t.id === saved)) {
      return saved as ThemeId;
    }
  } catch (e) {
    console.error('Failed to load theme from localStorage', e);
  }
  return 'joainas-light';
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

const FONT_SIZE_STORAGE_KEY = 'joainas_app_font_size_v1';

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

const FONT_FAMILY_STORAGE_KEY = 'joainas_app_font_family_v2';

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
