import { describe, expect, test } from 'vitest';
import { EDITION } from '../config/edition';
import { DEVELOPER_INFO, INITIAL_PRINTER_CONFIG } from '../data/initialData';
import { MANDATORY_RECEIPT_FOOTER } from '../types';

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

  test('receipts keep the DroneBug developer credit', () => {
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/DroneBug Technologies/i);
    expect(MANDATORY_RECEIPT_FOOTER).toMatch(/All rights reserved/i);
  });
});
