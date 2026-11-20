import { describe, expect, test } from 'vitest';
import { EDITION } from '../config/edition';
import { DEVELOPER_INFO, INITIAL_PRINTER_CONFIG } from '../data/initialData';
import { MANDATORY_RECEIPT_FOOTER } from '../types';
import { APP_THEMES } from '../utils/theme';

describe('Kingzzy Akamelu Resources branding and version', () => {
  test('release is 2.0.9 everywhere', () => {
    expect(EDITION.version).toBe('2.0.9');
    expect(DEVELOPER_INFO.appVersion).toContain('2.0.9');
  });

  test('printer config defaults are empty (user-configured only)', () => {
    expect(INITIAL_PRINTER_CONFIG.storeName).toBe('');
    expect(INITIAL_PRINTER_CONFIG.businessName).toBe('');
    expect(INITIAL_PRINTER_CONFIG.address).toBe('');
    expect(INITIAL_PRINTER_CONFIG.phone).toBe('');
  });

  test('STOREBOX WHITE is the 7th theme, light, and the default', () => {
    expect(APP_THEMES).toHaveLength(7);
    const theme = APP_THEMES.find((t) => t.id === 'storebox-white');
    expect(theme?.name).toBe('STOREBOX WHITE');
    expect(theme?.category).toBe('light');
    expect(theme?.cssVars['--bg-app']).toBe('#FFFFFF');
    expect(EDITION.defaultThemeId).toBe('storebox-white');
  });

  test('receipts keep the DroneBug developer credit', () => {
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/DroneBug Technologies/i);
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/All rights reserved/i);
  });
});
