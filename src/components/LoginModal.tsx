import React, { useState } from 'react';
import { Lock, User as UserIcon } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { User } from '../types';
import { loadUsers, saveUsers, recordAuditLog, setActiveUserStorage } from '../utils/storage';
import { defaultCapabilitiesFor } from '../utils/permissions';
import { useToast } from './Toast';

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
      if (isHashed(matched.password)) {
        passwordOk = await bcrypt.compare(password, matched.password as string);
      } else if (matched.password) {
        passwordOk = matched.password === password;
      } else {
        passwordOk = true;
      }

      if (!passwordOk) {
        showToast('Incorrect password. Please try again.', 'error');
        return;
      }

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
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-medium text-sm"
                placeholder="Enter your password"
              />
            </div>
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
        </form>
      </div>
    </div>
  );
};
