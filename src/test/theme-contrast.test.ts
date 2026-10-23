import { describe, test, expect } from 'vitest';
import { APP_THEMES } from '../utils/theme';

// WCAG 2.0 AA minimum contrast for normal text.
const WCAG_AA_MIN_CONTRAST = 4.5;

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme text contrast (WCAG AA)', () => {
  for (const theme of APP_THEMES) {
    test(`${theme.id} text is readable on every surface`, () => {
      const backgrounds = ['--bg-app', '--bg-surface', '--bg-input'];
      const textRoles = ['--text-primary', '--text-secondary', '--text-muted'];

      for (const bgVar of backgrounds) {
        const background = theme.cssVars[bgVar];
        expect(background, `${theme.id} is missing ${bgVar}`).toBeTruthy();

        for (const textVar of textRoles) {
          const foreground = theme.cssVars[textVar];
          expect(foreground, `${theme.id} is missing ${textVar}`).toBeTruthy();
          const ratio = contrastRatio(foreground, background);
          expect(
            ratio,
            `${theme.id}: ${textVar} (${foreground}) on ${bgVar} (${background}) = ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST);
        }
      }
    });
  }

  test('every theme exposes the required design tokens', () => {
    for (const theme of APP_THEMES) {
      expect(theme.cssVars['--accent-color']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.cssVars['--border-color']).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
