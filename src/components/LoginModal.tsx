import React, { useState } from 'react';
import { Lock, User as UserIcon, ShieldAlert, AlertTriangle } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { User } from '../types';
import { loadUsers, saveUsers, recordAuditLog, setActiveUserStorage } from '../utils/storage';
import { defaultCapabilitiesFor } from '../utils/permissions';
import { useToast } from './Toast';
import { hasRecoverySetupSync } from '../utils/recovery';
import { AdminRecoveryModal } from './AdminRecoveryModal';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  fullScreen?: boolean;
}

// Detect bcrypt-style hashes ("$2a$", "$2b$", "$2y$") vs legacy plaintext.
const isHashed = (value: string | undefined): boolean =>
  !!value && /^\$2[aby]\$\d{2}\$/.test(value);

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess, fullScreen = false }) => {
  const { showToast } = useToast();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [failedMap, setFailedMap] = useState<Record<string, number>>({});
  const [showRecovery, setShowRecovery] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState('CapsLock'));

  // Hidden developer shortcut: Ctrl+Shift+Alt+D opens recovery directly
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'd') {
        setShowRecovery(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      showToast('Please enter your password.', 'error');
      return;
    }

    let users = loadUsers();
    let matched = users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matched) {
      showToast(`User "${username}" not found. Please check username.`, 'error');
      return;
    }

    if (matched.status === 'suspended') {
      showToast(`Account for "${matched.username}" is currently suspended.`, 'error');
      return;
    }

    setIsVerifying(true);
    try {
      // Verify the stored credential, auto-migrating legacy plaintext rows
      // to a bcrypt hash on their first successful login (seamless upgrade).
      let passwordOk = false;
      if (!matched.password) {
        // Empty hash must NOT bypass — attacker blanked hash via DB edit.
        // Guide now says to delete the user and re-create via setup.
        passwordOk = false;
      } else if (isHashed(matched.password)) {
        passwordOk = await bcrypt.compare(password, matched.password as string);
      } else {
        passwordOk = matched.password === password;
      }

      if (!passwordOk) {
        const key = username.trim().toLowerCase();
        const next = (failedMap[key] || 0) + 1;
        const updated = { ...failedMap, [key]: next };
        setFailedMap(updated);
        // Only the System Admin account gets the uncomfortable-question recovery.
        const isAdminAttempt = matched.username.toLowerCase() === 'admin' || matched.role === 'System Admin' || (matched.capabilities || []).includes('admin');
        if (isAdminAttempt && next >= 5) {
          showToast('Incorrect password. 5 failed attempts — you can now recover the ADMIN password with your security question.', 'error');
        } else {
          const remaining = isAdminAttempt ? ` (${5 - next} tries left before recovery unlocks)` : '';
          showToast(`Incorrect password. Please try again.${remaining}`, 'error');
        }
        return;
      }

      // successful login clears the fail counter for this username
      setFailedMap((prev) => {
        const c = { ...prev };
        delete c[username.trim().toLowerCase()];
        return c;
      });

      // Upgrade plaintext accounts to a bcrypt hash once they log in.
      if (matched.password && !isHashed(matched.password)) {
        const hashed = await bcrypt.hash(password, 10);
        matched = { ...matched, password: hashed };
      }

      // Ensure every account has a sensible capability set (migration safety).
      if (!matched.capabilities || matched.capabilities.length === 0) {
        matched = { ...matched, capabilities: defaultCapabilitiesFor(matched.role) };
      }

      // Record login time
      let updatedUsers = users.map((u) =>
        u.id === matched.id ? { ...u, ...matched, lastLogin: new Date().toLocaleString() } : u
      );
      saveUsers(updatedUsers);

      setActiveUserStorage(matched);

      recordAuditLog(
        matched.username,
        matched.role,
        'User Authentication Login',
        `Staff user "${matched.username}" (${matched.fullName}) logged in successfully as ${matched.role}.`
      );

      showToast(`Welcome back, ${matched.fullName}!`, 'success');
      onLoginSuccess(matched);
      if (!fullScreen) onClose();
    } catch (error) {
      console.error('Login verification failed', error);
      showToast('Could not verify your credentials. Please try again.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 font-sans select-none ${
      fullScreen ? 'bg-black' : 'bg-black/50 backdrop-blur-sm'
    }`}>
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header with logo */}
        <div className="bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] px-8 py-8 text-center">
          <img
            src="/logo.png"
            alt="Joainas Mart"
            className="w-16 h-16 mx-auto mb-3 rounded-xl bg-white/20 p-2 object-contain"
          />
          <h3 className="text-xl font-extrabold text-white">Sign In</h3>
          <p className="text-sm text-white/80 mt-1">Enter your credentials to access the POS terminal</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {/* Username */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
              Username
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-medium text-sm"
                placeholder="Enter your username"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
              Password {capsOn && <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-amber-600"><AlertTriangle className="w-3 h-3" /> Caps Lock ON</span>}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={checkCaps}
                onKeyDown={checkCaps}
                onFocus={checkCaps as any}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-medium text-sm ${capsOn ? 'border-amber-400 focus:border-amber-500' : 'border-[var(--border-color)]'}`}
                placeholder="Enter your password"
              />
            </div>
            {capsOn && <p className="text-xs font-bold text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Caps Lock is ON — password is case-sensitive</p>}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {!fullScreen && (
              <button
                type="button"
                onClick={onClose}
                className="py-3 bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-semibold rounded-xl text-sm transition border border-[var(--border-color)]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isVerifying}
              className={`py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm transition shadow-md ${fullScreen ? 'col-span-2' : ''}`}
            >
              {isVerifying ? 'Verifying...' : 'Sign In'}
            </button>
          </div>

          {/* Recovery entry — only after 5 failed ADMIN attempts */}
          {(() => {
            const key = username.trim().toLowerCase();
            const fails = failedMap[key] || 0;
            if (fails < 5) return null;
            // Check if this username is an admin account (or the literal 'admin')
            const users = loadUsers();
            const candidate = users.find((u) => u.username.toLowerCase() === key);
            const isAdmin = !candidate ? key === 'admin' : candidate.role === 'System Admin' || (candidate.capabilities || []).includes('admin');
            if (!isAdmin) return null;
            const hasVault = hasRecoverySetupSync();
            return (
              <div className={`mt-5 p-4 rounded-xl border ${hasVault ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-start gap-2">
                  <ShieldAlert className={`w-5 h-5 mt-0.5 ${hasVault ? 'text-amber-600' : 'text-slate-500'}`} />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {hasVault ? 'ADMIN recovery unlocked — 5 failed attempts' : 'No recovery vault found for this ADMIN'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                      {hasVault
                        ? 'Answer one of your 5 private security questions to reveal the actual password for 30 seconds or set a new one. No one else can guess these.'
                        : 'This older install has no security questions yet. Use the developer recovery (Ctrl+Shift+Alt+D) or contact support. After upgrading, set your 5 questions in Admin → Security.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowRecovery(true)}
                      className={`mt-3 w-full py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wide transition flex items-center justify-center gap-2 ${hasVault ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                    >
                      <ShieldAlert className="w-4 h-4" />
                      {hasVault ? 'Recover ADMIN Password' : 'Developer Recovery'}
                    </button>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">Developer shortcut: Ctrl+Shift+Alt+D</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </form>
      </div>

      <AdminRecoveryModal
        isOpen={showRecovery}
        onClose={() => setShowRecovery(false)}
        onRecovered={(plain) => {
          // auto-fill the password field so they can sign in immediately, and clear fails
          setPassword(plain);
          setFailedMap((prev) => {
            const c = { ...prev };
            delete c[username.trim().toLowerCase()];
            return c;
          });
          setShowRecovery(false);
        }}
      />
    </div>
  );
};
