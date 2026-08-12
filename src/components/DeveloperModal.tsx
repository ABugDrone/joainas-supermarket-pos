import React from 'react';
import { Mail, Phone, CheckCircle2, X } from 'lucide-react';
import { DEVELOPER_INFO } from '../data/initialData';
import { HeaderLogo } from './HeaderLogo';

interface DeveloperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeveloperModal: React.FC<DeveloperModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden animate-fadeIn relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] px-8 py-8 text-center">
          <img
            src="/logo.png"
            alt="Joainas Mart"
            className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/20 p-2 object-contain"
          />
          <h3 className="text-xl font-extrabold text-white">Joainas Mart POS</h3>
          <p className="text-sm text-white/80 mt-1">Seafoods • Frozen Foods • Groceries</p>
          <span className="inline-block mt-3 text-xs font-semibold text-white bg-white/20 px-3 py-1 rounded-full">
            {DEVELOPER_INFO.appVersion}
          </span>
        </div>

        {/* Developer Info */}
        <div className="p-6 space-y-4">
          <div className="bg-[var(--bg-app)] p-5 rounded-xl border border-[var(--border-color)]">
            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Developed & Serviced By
            </div>
            <div className="font-bold text-base text-[var(--accent-color)]">
              {DEVELOPER_INFO.company}
            </div>

            <div className="mt-3 pt-3 border-t border-[var(--border-color)] space-y-2">
              <a
                href={`mailto:${DEVELOPER_INFO.email}`}
                className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition"
              >
                <Mail className="w-4 h-4 text-[var(--accent-color)]" />
                <span>{DEVELOPER_INFO.email}</span>
              </a>

              <a
                href={`tel:${DEVELOPER_INFO.phone}`}
                className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition"
              >
                <Phone className="w-4 h-4 text-[var(--accent-color)]" />
                <span>{DEVELOPER_INFO.phone}</span>
              </a>
            </div>
          </div>

          <div className="space-y-2.5 text-sm text-[var(--text-secondary)]">
            {[
              'Offline-ready with local database storage',
              '80mm & 58mm thermal printer support',
              'Monthly financial reports & analytics',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
