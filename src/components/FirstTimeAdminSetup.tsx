import React, { useState } from 'react';
import { ShieldCheck, User, Lock, Phone, KeyRound, ArrowRight, FolderOpen, HardDrive, HelpCircle } from 'lucide-react';
import { User as UserType } from '../types';
import { saveUsers, loadUsers, setAdminSetupCompleted, recordAuditLog, relocateDatabaseFolder, setBackupFolderPath as persistBackupFolderPath, flushWrites } from '../utils/storage';
import { RECOVERY_QUESTIONS, createSingleRecoveryRecord } from '../utils/recovery';
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
  const [phone, setPhone] = useState('');
  const [backupFolderPath, setBackupFolderPath] = useState('');
  const [step, setStep] = useState<'account' | 'backup' | 'security'>('account');
  const [selectedSecurityIdx, setSelectedSecurityIdx] = useState(0);
  const [singleSecurityAnswer, setSingleSecurityAnswer] = useState('');
  const [capsOn, setCapsOn] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState('CapsLock'));

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
    // selects where the live database + backups are stored. The DB file is
    // relocated there. Browser dev falls back to a default.
    try {
      const relocated = await relocateDatabaseFolder();
      if (relocated) {
        setBackupFolderPath(relocated); // show in input
        showToast('Database + backup folder selected: ' + relocated, 'success');
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

  const handleProceedToSecurity = () => {
    if (!backupFolderPath) {
      showToast('Please select a backup folder to continue.', 'error');
      return;
    }
    setStep('security');
  };

  const handleCompleteSetup = async (opts?: { skipSecurity?: boolean }) => {
    const skip = !!opts?.skipSecurity;
    if (!skip) {
      if (!singleSecurityAnswer || !singleSecurityAnswer.trim()) {
        showToast('Please answer the selected security question — it protects you if you forget the ADMIN password, or click Skip to set it later in ADMIN panel.', 'error');
        return;
      }
      if (singleSecurityAnswer.trim().length < 2) {
        showToast('Answer is too short.', 'error');
        return;
      }
    }

    try {
      let nowStr = new Date().toISOString().split('T')[0];

      const { hash } = await import('bcryptjs');
      const hashedPassword = await hash(password, 10);

      let newAdmin: UserType = {
        id: 'usr-admin-master',
        fullName: fullName.trim() || 'System Administrator',
        username: username.trim() || 'admin',
        password: hashedPassword,
        role: 'System Admin',
        capabilities: [
          'sell',
          'inventory',
          'view_sales',
          'customers',
          'view_reports',
          'expenses',
          'printer_settings',
          'receipts',
          'admin',
        ],
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

      // Persist the single selected security question + an obfuscated copy of the
      // plaintext password so it can be recovered after 5 failed logins. Skip if requested.
      if (!skip) {
        try {
          await createSingleRecoveryRecord(selectedSecurityIdx, singleSecurityAnswer, password);
        } catch (e) {
          console.error('Failed to save recovery question', e);
          showToast('Could not save security question — continuing without recovery vault.', 'warning');
        }
      }

      setAdminSetupCompleted(true);

      recordAuditLog(
        newAdmin.username,
        'System Admin',
        'Master Admin First-Time Setup',
        `Master System Administrator account (${newAdmin.fullName}) configured. Backup folder: ${backupFolderPath}`
      );

      // Flush the queued SQLite writes BEFORE leaving the setup wizard. The admin
      // account, setup flag and audit log must be durable on disk — otherwise
      // closing the app right after setup loses the account and the next launch
      // shows a login screen with no users ("user admin not found").
      await flushWrites(8000);

      showToast('Admin account created! Backup folder configured. Launching POS terminal...', 'success');
      onSetupComplete(newAdmin);
    } catch (error) {
      console.error('Setup completion failed', error);
      showToast('Setup could not be completed. Please try again.', 'error');
    }
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
              First-Time Setup {step === 'account' ? '(Step 1 of 3)' : step === 'backup' ? '(Step 2 of 3)' : '(Step 3 of 3)'}
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">
              {step === 'account' ? 'Welcome to Joainas Mart' : step === 'backup' ? 'Configure Backup Storage' : 'Secure Your ADMIN Account'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm mx-auto">
              {step === 'account' 
                ? "Let's create your admin account to get started with the POS system."
                : step === 'backup'
                ? "Select a BACKUP folder for data storage and easy restoration."
                : "Answer 5 private questions — you will need just ONE correct answer to recover the ADMIN password after 5 failed logins."
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
                    placeholder="+234"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                  Password {capsOn && <span className="ml-2 text-xs font-bold text-amber-600">Caps Lock ON</span>}
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
                    placeholder="Min. 4 characters"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm ${capsOn ? 'border-amber-400' : 'border-[var(--border-color)]'}`}
                  />
                </div>
                {capsOn && <p className="text-xs font-bold text-amber-600 mt-1">Caps Lock is ON</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                  Confirm Password {capsOn && <span className="ml-2 text-xs font-bold text-amber-600">Caps Lock ON</span>}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyUp={checkCaps}
                    onKeyDown={checkCaps}
                    placeholder="Re-enter password"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none text-sm ${capsOn ? 'border-amber-400' : 'border-[var(--border-color)]'}`}
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
                onClick={handleProceedToSecurity}
                disabled={!backupFolderPath}
                className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-hover)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Next: Security Questions</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Security Question — pick ONE of 5 (skip allowed for later in ADMIN panel) */}
        {step === 'security' && (
          <div className="mt-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
              <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Pick <strong>ONE</strong> private question — after <strong>5 failed ADMIN logins</strong> this exact question will be asked. Answer correctly to see the actual ADMIN password for <strong>30 seconds</strong> or set a new one. You can also <strong>Skip</strong> now and set it later in <strong>ADMIN → Security & Recovery</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                Select one security question (1 of 5)
              </label>
              <select
                value={selectedSecurityIdx}
                onChange={(e) => setSelectedSecurityIdx(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm outline-none"
              >
                {RECOVERY_QUESTIONS.map((q, idx) => (
                  <option key={idx} value={idx}>
                    {idx + 1}. {q}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                Your answer to the selected question
              </label>
              <input
                type="text"
                value={singleSecurityAnswer}
                onChange={(e) => setSingleSecurityAnswer(e.target.value)}
                placeholder="Type your private answer (required if not skipping)"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Case-insensitive, kept private — only you should know it.</p>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('backup')}
                className="py-3 px-4 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition text-sm font-semibold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handleCompleteSetup({ skipSecurity: true })}
                className="py-3 px-4 rounded-xl border border-amber-600 text-amber-700 hover:bg-amber-50 transition text-sm font-bold"
              >
                Skip for Later
              </button>
              <button
                type="button"
                onClick={() => handleCompleteSetup()}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Complete Setup</span>
                <ShieldCheck className="w-5 h-5" />
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
