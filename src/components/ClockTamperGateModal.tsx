import React, { useState } from 'react';
import { Lock, ShieldAlert, AlertTriangle } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { User } from '../types';
import { loadUsers, recordAuditLog, reanchorClock } from '../utils/storage';
import { ClockGate } from '../utils/trustedTime';
import { useToast } from './Toast';

interface ClockTamperGateModalProps {
  isOpen: boolean;
  gate: ClockGate;
  onClose: () => void;
  onVerified: () => void;
}

// Detect bcrypt-style hashes ("$2a$", "$2b$", "$2y$") vs legacy plaintext.
const isHashed = (value: string | undefined): boolean =>
  !!value && /^\$2[aby]\$\d{2}\$/.test(value);

/**
 * Standalone ADMIN verification for the trusted clock. v2.0.6 no longer uses
 * this as a sign-in block: everyone can sign in and non-admin sessions keep
 * selling with a persistent FLASHALERT. This modal is opened on demand from
 * that alert (or the login warning) to confirm the computer's date/time is
 * correct, re-anchor the trusted clock, rewrite the native startup stamp and
 * clear the FLASHALERT.
 *
 * It asks for one thing only — the ADMIN password. No username box, no reason
 * box: the audit reason is written automatically.
 */
export const ClockTamperGateModal: React.FC<ClockTamperGateModalProps> = ({
  isOpen,
  gate,
  onClose,
  onVerified,
}) => {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  const [capsOn, setCapsOn] = useState(false);

  if (!isOpen) return null;

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsOn(e.getModifierState('CapsLock'));

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      showToast('Enter the ADMIN password to continue.', 'error');
      return;
    }
    setBusy(true);
    try {
      const users: User[] = loadUsers();
      const admins = users.filter(
        (u) =>
          u.status !== 'suspended' &&
          (u.role === 'System Admin' || (u.capabilities || []).includes('admin')),
      );
      if (admins.length === 0) {
        showToast(
          'No ADMIN account exists yet — correct the Windows date and time to continue.',
          'error'
        );
        return;
      }

      let matched: User | null = null;
      for (const candidate of admins) {
        if (!candidate.password) continue;
        const ok = isHashed(candidate.password)
          ? await bcrypt.compare(password, candidate.password)
          : candidate.password === password;
        if (ok) {
          matched = candidate;
          break;
        }
      }

      if (!matched) {
        setFailed((n) => n + 1);
        try {
          recordAuditLog(
            'Unknown',
            'System Admin',
            'Failed Clock Verification Attempt',
            'Wrong ADMIN password at the clock-verification popup. Clock stayed unverified.'
          );
        } catch {
          /* audit must never break the refusal */
        }
        showToast('Incorrect ADMIN password. The clock stays unverified.', 'error');
        return;
      }

      try {
        recordAuditLog(
          matched.username,
          matched.role,
          'Clock Verification — ADMIN Password Accepted',
          'ADMIN confirmed the computer date/time is correct at the clock-verification popup; trusted clock re-anchored to the current system time.'
        );
      } catch {
        /* audit must never break a legitimate verification */
      }

      reanchorClock(
        matched.username,
        matched.role,
        'ADMIN password verified at clock popup — system date/time confirmed correct'
      );

      setPassword('');
      showToast(
        `Clock verified by ${matched.fullName}. Date and time accepted — FLASHALERT cleared.`,
        'success'
      );
      onVerified();
    } catch (error) {
      console.error('Clock verification failed', error);
      showToast('Could not verify the ADMIN password. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 font-sans select-none bg-black/70 backdrop-blur-sm">
      <form
        onSubmit={handleVerify}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border-2 border-red-500 shadow-[0_0_40px_rgba(220,38,38,0.55)] bg-red-950"
      >
        {/* Red header */}
        <div className="px-6 py-5 text-center bg-gradient-to-r from-red-700 to-red-600 rounded-t-[14px]">
          <ShieldAlert className="w-9 h-9 mx-auto mb-2 text-white" />
          <h3 className="text-lg font-extrabold text-white uppercase tracking-wide">
            Admin Verification Required
          </h3>
          <p className="text-xs text-red-100/90 mt-1">
            The system clock is unverified — verify to clear the FLASHALERT
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* The note: what is wrong */}
          <div className="p-3.5 rounded-xl bg-black/35 border border-red-500/40">
            <p className="text-[12px] font-bold text-red-100 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-300" />
              <span>
                There is a possible problem with the system&apos;s clock, or the date
                and time have been tampered with. Make sure the date and time on
                this computer are correct before continuing.
              </span>
            </p>
            <p className="text-[11px] text-red-200/85 mt-2 leading-snug">
              <strong className="text-red-100">Why this matters to your business:</strong>{' '}
              a wrong clock dates your sales, receipts, reports and stock records
              incorrectly, so daily totals, audit trail and profit figures can no
              longer be trusted and disputed receipts cannot be proved. Sales made
              under a FLASHALERT stay enabled but are tagged for reconciliation;
              every override and every verification is permanently recorded in the
              audit trail.
            </p>
          </div>

          {/* What the check found */}
          <p className="text-[11px] text-red-200/80 leading-snug break-words">
            {gate.reason}
          </p>

          {/* The only input: ADMIN password */}
          <div>
            <label className="block text-xs font-bold text-red-100 mb-1.5 uppercase tracking-wide">
              Admin Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-red-300" />
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={checkCaps}
                onKeyDown={checkCaps}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 bg-black/40 text-white outline-none font-semibold text-sm placeholder:text-red-300/50 ${
                  capsOn ? 'border-amber-400' : 'border-red-500/70 focus:border-red-400'
                }`}
                placeholder="Enter ADMIN password"
              />
            </div>
            {capsOn && (
              <p className="text-[11px] font-bold text-amber-300 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Caps Lock is ON — password is case-sensitive
              </p>
            )}
            {failed > 0 && (
              <p className="text-[11px] text-red-300 mt-1">
                {failed} failed attempt{failed > 1 ? 's' : ''} recorded in the audit trail.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setPassword('');
                onClose();
              }}
              className="py-3 rounded-xl text-sm font-bold bg-black/30 hover:bg-black/50 text-red-100 border border-red-500/40 transition"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={busy || !password}
              className="py-3 rounded-xl text-sm font-extrabold uppercase tracking-wide bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition shadow-md"
            >
              {busy ? 'Verifying…' : 'Verify & Continue'}
            </button>
          </div>

          <p className="text-[10px] text-red-200/70 text-center leading-snug">
            Correct the Windows date and time first (Settings → Time &amp; Language).
            Verifying here accepts the current date/time, clears the FLASHALERT and
            stops tagging new sales.
          </p>
        </div>
      </form>
    </div>
  );
};
