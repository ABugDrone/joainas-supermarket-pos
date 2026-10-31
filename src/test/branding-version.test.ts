import { describe, expect, test } from 'vitest';
import { EDITION } from '../config/edition';
import { DEVELOPER_INFO, INITIAL_PRINTER_CONFIG } from '../data/initialData';
import { MANDATORY_RECEIPT_FOOTER } from '../types';
import { APP_THEMES } from '../utils/theme';

describe('Joainas Mart branding and version', () => {
  test('release is 2.0.6 everywhere', () => {
    expect(EDITION.version).toBe('2.0.6');
    expect(DEVELOPER_INFO.appVersion).toContain('2.0.6');
  });

  test('defaults use the Joainas Mart name, not DIRMS StoreBox PRO', () => {
    expect(INITIAL_PRINTER_CONFIG.storeName).toBe('Joainas Mart');
    expect(INITIAL_PRINTER_CONFIG.businessName).toBe('Joainas Mart');
    expect(JSON.stringify(INITIAL_PRINTER_CONFIG)).not.toMatch(/DIRMS StoreBox PRO/i);
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
