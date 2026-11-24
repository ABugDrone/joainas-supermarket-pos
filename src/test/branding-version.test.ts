import { describe, expect, test } from 'vitest';
import {
  BRAND_EXPANSION,
  BRANDED_DOCUMENT_NAME,
  BRANDED_NAME_LINE,
  BRANDED_NICKNAME_LINE,
  EDITION,
  UPGRADE_PRICE_LINE,
  isThemeAvailable,
  requiresLicenseActivation,
} from '../config/edition';
import { DEVELOPER_INFO, INITIAL_PRINTER_CONFIG } from '../data/initialData';
import { MANDATORY_RECEIPT_FOOTER } from '../types';
import { APP_THEMES } from '../utils/theme';

describe('DIRMS Storebox 2.1.0 branding', () => {
  test('release is 2.1.0 everywhere', () => {
    expect(EDITION.version).toBe('2.1.0');
    expect(DEVELOPER_INFO.appVersion).toContain('2.1.0');
  });

  test('one identity with the DroneBug expansion and no nickname', () => {
    expect(EDITION.appName).toBe('DIRMS Storebox');
    expect(EDITION.editionLabel).toBe('Open Source');
    expect(BRANDED_NAME_LINE).toBe('DIRMS Storebox');
    expect(BRANDED_DOCUMENT_NAME).toBe('DIRMS Storebox');
    expect(BRANDED_NICKNAME_LINE).toBe('');
    expect(BRAND_EXPANSION).toBe('DroneBug Inventory & Records Management System');
  });

  test('free edition needs no license and has no login', () => {
    expect(EDITION.isOpenSource).toBe(true);
    expect(requiresLicenseActivation).toBe(false);
  });

  test('receipt defaults are DIRMS Storebox and fully customizable', () => {
    expect(INITIAL_PRINTER_CONFIG.storeName).toBe('DIRMS Storebox');
    expect(INITIAL_PRINTER_CONFIG.businessName).toBe('DIRMS Storebox');
    expect(INITIAL_PRINTER_CONFIG.tagline).toBe(BRAND_EXPANSION);
    expect(INITIAL_PRINTER_CONFIG.showLogo).toBe(true);
  });

  test('only Storebox White and AMOLED Black are usable', () => {
    expect(APP_THEMES).toHaveLength(7);
    expect(EDITION.openSourceThemeIds).toEqual(['storebox-white', 'midnight-black']);
    expect(isThemeAvailable('storebox-white')).toBe(true);
    expect(isThemeAvailable('midnight-black')).toBe(true);
    expect(isThemeAvailable('emerald-fresh')).toBe(false);
    expect(isThemeAvailable('SENIOR_CITIZEN-dark')).toBe(false);
    expect(EDITION.defaultThemeId).toBe('storebox-white');
  });

  test('locked screens advertise both currencies plus taxes', () => {
    expect(UPGRADE_PRICE_LINE).toContain('€170');
    expect(UPGRADE_PRICE_LINE).toContain('₦250,000');
    expect(UPGRADE_PRICE_LINE).toContain('taxes');
  });

  test('receipts keep the DroneBug developer credit', () => {
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/DroneBug Technologies/i);
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/All rights reserved/i);
  });
});
