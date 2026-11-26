import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const NEW_NAME = 'Alhaji Rabiu Global Entreprises';
const NEW_ADDRESS =
  'Head Office: Zone C Block KC Shop KX Shop No. 29 & 30, Palluja Market, Jimeta Yola, Adamawa State.';
const NEW_PHONE = '+2348030732220';

describe(`${NEW_NAME} 2.1.0 full build`, () => {
  test('release is 2.1.0 everywhere', () => {
    expect(EDITION.version).toBe('2.1.0');
    expect(DEVELOPER_INFO.appVersion).toContain('2.1.0');
    expect(DEVELOPER_INFO.appVersion).toContain('Full Build');
  });

  test('one identity, no nickname and no old name in the UI', () => {
    expect(EDITION.appName).toBe(NEW_NAME);
    expect(EDITION.shortName).toBe(NEW_NAME);
    expect(EDITION.editionLabel).toBe('Full Build');
    expect(BRANDED_NAME_LINE).toBe(NEW_NAME);
    expect(BRANDED_DOCUMENT_NAME).toBe(NEW_NAME);
    expect(BRANDED_NICKNAME_LINE).toBe('');
    expect(BRAND_EXPANSION).toBe('Inventory Management System');
    const uiText = [
      EDITION.appName,
      EDITION.shortName,
      BRANDED_NAME_LINE,
      BRANDED_DOCUMENT_NAME,
      INITIAL_PRINTER_CONFIG.storeName,
      INITIAL_PRINTER_CONFIG.businessName,
      INITIAL_PRINTER_CONFIG.receiptHeaderNote,
    ].join(' ');
    expect(uiText).not.toContain('DIRMS Storebox');
    expect(uiText).not.toContain('FKA Rabiu Entreprises');
    expect(uiText).not.toContain('Rabiu Entreprises.');
  });

  test('everything is unlocked with no license activation', () => {
    expect(EDITION.isOpenSource).toBe(false);
    expect(requiresLicenseActivation).toBe(false);
    expect(UPGRADE_PRICE_LINE).toBe('');
    expect(APP_THEMES).toHaveLength(7);
    expect(isThemeAvailable('storebox-white')).toBe(true);
    expect(isThemeAvailable('midnight-black')).toBe(true);
    expect(isThemeAvailable('emerald-fresh')).toBe(true);
    expect(isThemeAvailable('SENIOR_CITIZEN-dark')).toBe(true);
  });

  test('receipt defaults use the new business identity and contact', () => {
    expect(INITIAL_PRINTER_CONFIG.storeName).toBe(NEW_NAME);
    expect(INITIAL_PRINTER_CONFIG.businessName).toBe(NEW_NAME);
    expect(INITIAL_PRINTER_CONFIG.tagline).toBe(BRAND_EXPANSION);
    expect(INITIAL_PRINTER_CONFIG.address).toBe(NEW_ADDRESS);
    expect(INITIAL_PRINTER_CONFIG.phone).toBe(NEW_PHONE);
    expect(INITIAL_PRINTER_CONFIG.receiptHeaderNote).toBe(`WELCOME TO ${NEW_NAME}`);
    expect(INITIAL_PRINTER_CONFIG.showLogo).toBe(true);
  });

  test('developer support stays with Dronebug Technologies', () => {
    expect(DEVELOPER_INFO.company).toBe('Dronebug Technologies & Services');
    expect(DEVELOPER_INFO.phone).toBe('+2347035716349');
    expect(EDITION.supportWhatsAppNumber).toBe('2347035716349');
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/DroneBug Technologies/i);
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/All rights reserved/i);
  });

  test('old Rabiu installs keep the same app identifier and database file', () => {
    const rust = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    expect(rust).toContain('const APP_IDENTIFIER: &str = "com.dronebug.dirms.desktop";');
    expect(rust).toContain('const DB_FILE_NAME: &str = "senior_citizen_accessories.db";');
  });
});
