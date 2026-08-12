import React, { useState } from 'react';
import { Lock, User as UserIcon } from 'lucide-react';
import { User } from '../types';
import { loadUsers, saveUsers, recordAuditLog, setActiveUserStorage } from '../utils/storage';
import { useToast } from './Toast';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const { showToast } = useToast();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    // Verify password if set
    if (matched.password && matched.password !== password) {
      showToast('Incorrect password. Please try again.', 'error');
      return;
    }

    // Record login time
    let updatedUsers = users.map((u) =>
      u.id === matched.id ? { ...u, lastLogin: new Date().toLocaleString() } : u
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans select-none">
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
          {/* Quick Staff Selection */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-3">
              Quick Access
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'admin', label: 'Admin' },
                { name: 'cashier1', label: 'Cashier 1' },
                { name: 'cashier2', label: 'Cashier 2' },
                { name: 'manager', label: 'Manager' },
              ].map((staff) => (
                <button
                  key={staff.name}
                  type="button"
                  onClick={() => {
                    setUsername(staff.name);
                    if (staff.name === 'admin') setPassword('admin123');
                    else setPassword('1234');
                  }}
                  className={`py-3 px-4 rounded-xl font-semibold text-sm transition border ${
                    username === staff.name
                      ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-md'
                      : 'bg-[var(--bg-app)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {staff.label}
                </button>
              ))}
            </div>
          </div>

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
            <button
              type="button"
              onClick={onClose}
              className="py-3 bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-semibold rounded-xl text-sm transition border border-[var(--border-color)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl text-sm transition shadow-md"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
