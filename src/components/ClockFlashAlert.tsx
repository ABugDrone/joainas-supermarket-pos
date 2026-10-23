import React from 'react';
import { ShieldAlert, KeyRound } from 'lucide-react';
import type { ClockOverrideAlert } from '../utils/clockOverride';

interface ClockFlashAlertProps {
  alerts: ClockOverrideAlert[];
  onVerify: () => void;
  className?: string;
}

/**
 * Persistent FLASHALERT shown to non-admin users (and on the login screen)
 * after a sign-in under an unverified system clock. It has no dismiss
 * control: only an ADMIN login or ADMIN-password verification clears it.
 */
export const ClockFlashAlert: React.FC<ClockFlashAlertProps> = ({
  alerts,
  onVerify,
  className = '',
}) => {
  if (alerts.length === 0) return null;
  const latest = alerts[0];
  const extra = alerts.length - 1;
  const usernames = Array.from(new Set(alerts.map((a) => a.username))).join(', ');

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`w-full shrink-0 border-b-2 border-amber-300 bg-gradient-to-r from-amber-700 via-orange-700 to-red-700 text-white shadow-lg ${className}`}
    >
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <ShieldAlert className="h-6 w-6 shrink-0 animate-pulse text-amber-200" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]">
              FLASHALERT
            </span>
            <span className="truncate text-sm font-extrabold">
              {latest.username} logged in with anti-tampering active
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-100/95">
            Clock unverified at login ({new Date(latest.loginAtMs).toLocaleString()}).
            {' '}Sales are allowed and tagged in Sales Records for ADMIN review.
            {' '}Only an ADMIN can clear this alert.
            {extra > 0 ? ` +${extra} more override login${extra === 1 ? '' : 's'}.` : ''}
          </p>
          {latest.gateReason && (
            <p
              className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-amber-200/75"
              title={latest.gateReason}
            >
              {latest.gateReason}
            </p>
          )}
          {extra > 0 && (
            <p className="mt-0.5 text-[10px] leading-snug text-amber-200/80">
              Override users: {usernames}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onVerify}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-amber-900 shadow transition hover:bg-amber-50"
        >
          <KeyRound className="h-4 w-4" />
          Verify with ADMIN password
        </button>
      </div>
    </div>
  );
};
