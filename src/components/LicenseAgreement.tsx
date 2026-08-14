import React, { useState } from 'react';
import { FileText, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from './Toast';

interface LicenseAgreementProps {
  onAgree: () => void;
  onDecline: () => void;
}

// A simple, plain-English end user license agreement that appears before
// first-time setup. Numbered, easy to read, no legal jargon.
export const LicenseAgreement: React.FC<LicenseAgreementProps> = ({ onAgree, onDecline }) => {
  const { showToast } = useToast();
  const [readToEnd, setReadToEnd] = useState(false);

  const terms: { title: string; body: string }[] = [
    {
      title: 'You own your data',
      body: 'Everything you type into this app — products, customers, sales and reports — belongs to you and stays on this computer. We never upload or see your data.',
    },
    {
      title: 'This app works offline',
      body: 'Joainas POS runs completely offline. You do not need the internet to sell, take inventory or print receipts.',
    },
    {
      title: 'One admin is in charge',
      body: 'The person who sets up this app (the Administrator) controls staff accounts and access. Only the admin can give other staff members permissions.',
    },
    {
      title: 'Backups are your responsibility',
      body: 'The app can save a backup of all your data. We strongly recommend making regular backups so your records are safe.',
    },
    {
      title: 'Updates keep your data',
      body: 'When you update the app, your data is never deleted. It stays exactly where it is, in the Documents\\Backup folder (or a folder you choose).',
    },
    {
      title: 'No hidden charges',
      body: 'There are no subscriptions, hidden fees or online services tied to this app. It is yours to use.',
    },
    {
      title: 'Use it for lawful business',
      body: 'Please use this app only for lawful business purposes in your country.',
    },
  ];

  const handleAgree = () => {
    if (!readToEnd) {
      showToast('Please scroll to the end and read the full agreement first.', 'error');
      return;
    }
    onAgree();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[var(--accent-color)]/5 to-[var(--accent-orange)]/5 p-4 font-sans select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden text-[var(--text-primary)] animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] px-8 py-6 text-center">
          <img
            src="/logo.png"
            alt="Joainas Mart"
            className="w-16 h-16 mx-auto mb-3 rounded-xl bg-white/20 p-2 object-contain"
          />
          <h3 className="text-xl font-extrabold text-white">Software License Agreement</h3>
          <p className="text-sm text-white/80 mt-1">Please read the terms below before using Joainas POS</p>
        </div>

        {/* Terms */}
        <div className="max-h-[52vh] overflow-y-auto px-8 py-6 space-y-5">
          {terms.map((t, i) => (
            <div key={i} className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center font-black text-sm">
                {i + 1}
              </span>
              <div>
                <h4 className="font-bold text-sm mb-1">{t.title}</h4>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t.body}</p>
              </div>
            </div>
          ))}

          <div className="mt-2 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              By agreeing, you confirm that you have read and understood these terms, and that you
              accept them before continuing to set up and use Joainas POS.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-[var(--border-color)] bg-[var(--bg-app)]">
          <label className="flex items-center gap-3 mb-4 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={readToEnd}
              onChange={(e) => setReadToEnd(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent-color)]"
            />
            I have read the full agreement above and I agree to the terms.
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onDecline}
              className="py-3 bg-[var(--bg-hover)] hover:bg-red-500/10 text-red-400 font-semibold rounded-xl text-sm transition border border-red-500/30 flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Decline & Close
            </button>
            <button
              onClick={handleAgree}
              className="py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm transition shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              I Agree — Continue
            </button>
          </div>
          <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
            Joainas POS v1.3.1 • Dronebug Technologies and Services
          </p>
        </div>
      </div>
    </div>
  );
};
