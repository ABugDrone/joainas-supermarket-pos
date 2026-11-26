import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, FileKey, ClipboardPaste, Info } from 'lucide-react';
import { useToast } from './Toast';
import { EDITION } from '../config/edition';
import {
  validateLicenseKey,
  setLicenseActivated,
  getAppDataDirPath,
} from '../utils/license';

interface LicenseGateProps {
  onActivated: () => void;
}

/**
 * Full-screen license key activation gate.
 * Shown after the EULA agreement but before admin setup / login.
 *
 * Two activation paths:
 *  1. Manual entry — paste/type the key and click Activate.
 *  2. license.key file — place a file named "license.key" containing the
 *     key in the app data directory. On next launch the file is read
 *     automatically and the gate is skipped (handled in checkLicenseOnStartup).
 *     The user can also click "Check for license.key file" to trigger the
 *     file check without restarting.
 */
export const LicenseGate: React.FC<LicenseGateProps> = ({ onActivated }) => {
  const { showToast } = useToast();
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [appDataDir, setAppDataDir] = useState('');

  useEffect(() => {
    getAppDataDirPath().then(setAppDataDir).catch(() => {});
  }, []);

  const handleActivate = useCallback(async () => {
    if (!keyInput.trim()) {
      showToast('Please enter your license key.', 'error');
      return;
    }
    setActivating(true);
    try {
      const valid = await validateLicenseKey(keyInput);
      if (valid) {
        setLicenseActivated(true);
        showToast('License activated successfully!', 'success');
        // Small delay so the success toast is visible before transition.
        setTimeout(() => onActivated(), 600);
      } else {
        showToast('Invalid license key. Please check and try again.', 'error');
      }
    } catch (e) {
      showToast('Activation failed. Please try again.', 'error');
    } finally {
      setActivating(false);
    }
  }, [keyInput, onActivated, showToast]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setKeyInput(text.trim());
        showToast('Pasted from clipboard', 'info');
      } else {
        showToast('Clipboard is empty', 'info');
      }
    } catch {
      showToast('Could not access clipboard. Please paste manually (Ctrl+V).', 'info');
    }
  }, [showToast]);

  const handleCheckFile = useCallback(async () => {
    setActivating(true);
    try {
      const { readLicenseKeyFile } = await import('../utils/license');
      const fileKey = await readLicenseKeyFile();
      if (fileKey) {
        const valid = await validateLicenseKey(fileKey);
        if (valid) {
          setLicenseActivated(true);
          showToast('License key file found and validated!', 'success');
          setTimeout(() => onActivated(), 600);
        } else {
          showToast('license.key file found but the key is invalid.', 'error');
        }
      } else {
        showToast(
          `No license.key file found in:\n${appDataDir}\n\nCreate a text file named "license.key" in that folder, put your key inside it, then click this button again.`,
          'info'
        );
      }
    } catch {
      showToast('Could not check for license file.', 'error');
    } finally {
      setActivating(false);
    }
  }, [appDataDir, onActivated, showToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !activating) {
        handleActivate();
      }
    },
    [activating, handleActivate]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[var(--accent-color)]/5 to-[var(--accent-orange)]/5 p-4 font-sans select-none">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden text-[var(--text-primary)] animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] px-8 py-6 text-center">
          <img
            src="/logo.png"
            alt="Alhaji Rabiu Global Entreprises"
            className="w-16 h-16 mx-auto mb-3 rounded-xl bg-white/20 p-2 object-contain"
          />
          <h3 className="text-xl font-extrabold text-white flex items-center justify-center gap-2">
            <KeyRound size={22} />
            License Activation
          </h3>
          <p className="text-sm text-white/80 mt-1">
            {EDITION.shortName} v{EDITION.version} requires a license key to activate
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {/* Method 1: Manual entry */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
              Enter License Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste or type your license key here…"
                autoFocus
                disabled={activating}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40 focus:border-[var(--accent-color)] transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handlePaste}
                disabled={activating}
                title="Paste from clipboard"
                className="px-3 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)] transition-all disabled:opacity-50"
              >
                <ClipboardPaste size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleActivate}
              disabled={activating || !keyInput.trim()}
              className="w-full mt-3 px-6 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {activating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Validating…
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Activate License
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="text-xs text-[var(--text-muted)] font-medium">OR</span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
          </div>

          {/* Method 2: license.key file */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
              Use a license.key File
            </label>
            <div className="rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] p-4 text-xs text-[var(--text-secondary)] space-y-2">
              <p className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-[var(--accent-color)]" />
                <span>
                  Create a plain text file named <strong className="font-mono text-[var(--text-primary)]">license.key</strong>{' '}
                  containing your license key, and place it in:
                </span>
              </p>
              <p className="font-mono text-[11px] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 break-all text-[var(--text-primary)]">
                {appDataDir || 'Loading…'}
              </p>
              <p>The app will auto-detect this file on next launch. You can also check now:</p>
            </div>
            <button
              type="button"
              onClick={handleCheckFile}
              disabled={activating}
              className="w-full mt-3 px-6 py-3 border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/5 hover:bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-semibold rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {activating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <FileKey size={18} />
                  Check for license.key File
                </>
              )}
            </button>
          </div>

          {/* Footer note */}
          <div className="text-center pt-2">
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Need a license key? Contact{' '}
              <span className="text-[var(--accent-color)] font-semibold">{EDITION.supportEmail}</span>
              {' or '}
              <span className="text-[var(--accent-color)] font-semibold">{EDITION.supportWhatsAppDisplay}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
