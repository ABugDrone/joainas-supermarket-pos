import React, { useState } from 'react';
import { ShieldCheck, User, Lock, Phone, KeyRound, ArrowRight, FolderOpen, HardDrive } from 'lucide-react';
import { User as UserType } from '../types';
import { saveUsers, loadUsers, setAdminSetupCompleted, recordAuditLog, pickBackupFolder, setBackupFolderPath as persistBackupFolderPath } from '../utils/storage';
import { useToast } from './Toast';

interface FirstTimeAdminSetupProps {
  onSetupComplete: (adminUser: UserType) => void;
}

export const FirstTimeAdminSetup: React.FC<FirstTimeAdminSetupProps> = ({ onSetupComplete }) => {
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('Store Administrator');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('+234 703 571 6349');
  const [backupFolderPath, setBackupFolderPath] = useState('');
  const [step, setStep] = useState<'account' | 'backup'>('account');

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 4) {
      showToast('Password must be at least 4 characters.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    // Move to backup folder selection step
    setStep('backup');
  };

  const handleSelectBackupFolder = async () => {
    // Native folder picker in the Tauri desktop shell so the admin truly
    // selects where backups are stored. Browser dev falls back to a default.
    try {
      const picked = await pickBackupFolder();
      if (picked) {
        persistBackupFolderPath(picked); // persist
        setBackupFolderPath(picked); // show in input
        showToast('Backup folder selected: ' + picked, 'success');
        return;
      }
    } catch (error) {
      console.error('Backup folder picker failed', error);
    }

    const documentsPath = 'C:\\Users\\' + (username || 'admin') + '\\Documents\\BACKUP';
    persistBackupFolderPath(documentsPath);
    setBackupFolderPath(documentsPath);
    showToast('Default backup folder selected: ' + documentsPath, 'success');
  };

  const handleCompleteSetup = () => {
    if (!backupFolderPath) {
      showToast('Please select a backup folder to continue.', 'error');
      return;
    }

    let nowStr = new Date().toISOString().split('T')[0];

    let newAdmin: UserType = {
      id: 'usr-admin-master',
      fullName: fullName.trim() || 'System Administrator',
      username: username.trim() || 'admin',
      password: password,
      role: 'System Admin',
      status: 'active',
      createdAt: nowStr,
      lastLogin: new Date().toLocaleString(),
    };

    let existingUsers = loadUsers();
    let updatedUsers = [newAdmin, ...existingUsers.filter((u) => u.username !== username)];
    saveUsers(updatedUsers);

    // Save backup folder path to persistent storage
    try {
      persistBackupFolderPath(backupFolderPath);
    } catch (e) {
      console.error('Failed to save backup folder path', e);
    }

    setAdminSetupCompleted(true);

    recordAuditLog(
      newAdmin.username,
      'System Admin',
      'Master Admin First-Time Setup',
      `Master System Administrator account (${newAdmin.fullName}) configured. Backup folder: ${backupFolderPath}`
    );

    showToast('Admin account created! Backup folder configured. Launching POS terminal...', 'success');
    onSetupComplete(newAdmin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[var(--accent-color)]/5 to-[var(--accent-orange)]/5 p-4 font-sans select-none overflow-y-auto">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-8 text-[var(--text-primary)] relative my-8 animate-fadeIn">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4 pb-6 border-b border-[var(--border-color)]">
          <img
            src="/logo.png"
            alt="Joainas Mart"
            className="w-24 h-24 rounded-2xl object-contain"
          />
          <div>
            <div className="inline-flex items-center gap-2 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 px-4 py-1.5 rounded-full text-[var(--accent-color)] text-sm font-semibold mb-3">
              <ShieldCheck className="w-4 h-4" />
              First-Time Setup {step === 'backup' ? '(Step 2 of 2)' : '(Step 1 of 2)'}
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">
              {step === 'account' ? 'Welcome to Joainas Mart' : 'Configure Backup Storage'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm mx-auto">
              {step === 'account' 
                ? "Let's create your admin account to get started with the POS system."
                : "Select a BACKUP folder for data storage and easy restoration."
              }
            </p>
          </div>
        </div>

        {/* Step 1: Account Setup */}
        {step === 'account' && (
          <form onSubmit={handleAccountSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                Your Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-medium text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--accent-color)] font-semibold outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 703 571 6349"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
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
                    placeholder="Min. 4 characters"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] hover:opacity-90 text-white font-bold text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Next: Configure Backup</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Backup Folder Configuration */}
        {step === 'backup' && (
          <div className="mt-6 space-y-6">
            {/* Info Section */}
            <div className="bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-[var(--info)] mt-0.5" />
                <div>
                  <h4 className="font-semibold text-[var(--text-primary)] text-sm">Backup Storage Setup</h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    Choose a BACKUP folder where your POS data will be stored. This makes it easy to locate during restoration. 
                    We recommend creating a "BACKUP" folder in your Documents directory.
                  </p>
                </div>
              </div>
            </div>

            {/* Backup Folder Selection */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                Backup Storage Location
              </label>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <FolderOpen className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={backupFolderPath}
                      onChange={(e) => setBackupFolderPath(e.target.value)}
                      placeholder="Select or type backup folder path..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectBackupFolder}
                    className="px-4 py-3 rounded-xl border border-[var(--accent-color)] text-[var(--accent-color)] hover:bg-[var(--accent-color)]/5 font-medium text-sm transition"
                  >
                    Browse
                  </button>
                </div>

                {/* Quick Select Options */}
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setBackupFolderPath('C:\\Users\\Documents\\BACKUP')}
                    className="text-left px-3 py-2 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--accent-color)]/5 text-sm transition"
                  >
                    📁 Documents\\BACKUP (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupFolderPath('D:\\BACKUP')}
                    className="text-left px-3 py-2 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--accent-color)]/5 text-sm transition"
                  >
                    💾 D:\\BACKUP
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep('account')}
                className="flex-1 py-3 px-6 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={!backupFolderPath}
                className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Complete Setup</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[var(--border-color)] text-center text-xs text-[var(--text-muted)]">
          Powered by Dronebug Technologies
        </div>
      </div>
    </div>
  );
};
