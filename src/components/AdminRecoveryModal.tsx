import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, KeyRound, Eye, EyeOff, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { RECOVERY_QUESTIONS, verifyRecoveryAnswer, recoverPasswordWithAnswer, devRecoverPassword, loadRecoveryRecord, verifyDevMasterCode } from '../utils/recovery';
import { loadUsers, saveUsers } from '../utils/storage';
import { useToast } from './Toast';

interface AdminRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecovered: (plainPassword: string) => void;
}

export const AdminRecoveryModal: React.FC<AdminRecoveryModalProps> = ({ isOpen, onClose, onRecovered }) => {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<'question' | 'revealed' | 'reset'>('question');
  const [questionIdx, setQuestionIdx] = useState<number>(0);
  const [question, setQuestion] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [revealed, setRevealed] = useState<string>('');
  const [showPlain, setShowPlain] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [isDevMode, setIsDevMode] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [capsOn, setCapsOn] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState('CapsLock'));
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // pick a random question from the stored record
    (async () => {
      const rec = await loadRecoveryRecord();
      if (!rec || rec.questions.length !== 5) {
        setQuestion('No recovery questions are configured for this install.');
        return;
      }
      const list = rec.questions;
      const picked = list[Math.floor(Math.random() * list.length)];
      setQuestionIdx(picked.id);
      setQuestion(picked.question);
      setPhase('question');
      setAnswer('');
      setRevealed('');
      setShowPlain(false);
      setCountdown(30);
      setIsDevMode(false);
    })();
  }, [isOpen]);

  useEffect(() => {
    if (phase !== 'revealed') return;
    setCountdown(30);
    countdownRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) window.clearInterval(countdownRef.current);
          setRevealed('');
          setShowPlain(false);
          setPhase('question');
          showToast('Password hidden — time expired. Answer again to view.', 'info');
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, [phase, showToast]);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (!answer.trim()) {
      showToast('Please enter your answer.', 'error');
      return;
    }
    setIsVerifying(true);
    try {
      const plain = await recoverPasswordWithAnswer(questionIdx, answer);
      if (!plain) {
        showToast('Wrong answer. Try again — this must be exactly what you set during setup.', 'error');
        return;
      }
      setRevealed(plain);
      setShowPlain(false);
      setPhase('revealed');
      showToast('Answer correct — password revealed for 30 seconds.', 'success');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Password copied.', 'success');
  };

  const handleDevRecover = async () => {
    const plain = await devRecoverPassword(devCode);
    if (!plain) {
      showToast('Invalid developer code or no recovery vault found. See RECOVERY_GUIDE.md for DB inspection.', 'error');
      return;
    }
    setRevealed(plain);
    setPhase('revealed');
    setCountdown(30);
    showToast('Developer recovery successful.', 'success');
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      showToast('New password must be at least 4 characters.', 'error');
      return;
    }
    if (newPassword !== confirmNew) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    try {
      const users = loadUsers();
      const adminIdx = users.findIndex((u) => u.username.toLowerCase() === 'admin' && u.role === 'System Admin');
      const target = adminIdx >= 0 ? users[adminIdx] : users.find((u) => u.username.toLowerCase() === 'admin');
      if (!target) {
        showToast('Admin account not found.', 'error');
        return;
      }
      const { hash } = await import('bcryptjs');
      const hashed = await hash(newPassword, 10);
      const updated = users.map((u) => (u.id === target.id ? { ...u, password: hashed } : u));
      saveUsers(updated);
      // also update the encrypted recovery copy so next recovery shows the new password
      const { updateEncryptedPassword } = await import('../utils/recovery');
      await updateEncryptedPassword(newPassword);
      showToast('Admin password has been reset. Use it to sign in.', 'success');
      onRecovered(newPassword);
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to reset password.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden my-8 animate-fadeIn">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg">Recover ADMIN Password</h3>
              <p className="text-xs text-white/80">Answer one of your 5 security questions</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {phase === 'question' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>This recovery appears only after 5 failed ADMIN login attempts. Your answer is checked locally — never sent anywhere.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Security Question</label>
                <div className="p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] text-sm font-semibold text-[var(--text-primary)] leading-snug">
                  {question || 'Loading...'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Your Answer</label>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder="Type your exact answer (case-insensitive)"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm outline-none"
                  autoFocus
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">Tip: answers are case-insensitive and trimmed — just match what you set at setup.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={onClose} className="py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] text-sm font-semibold">
                  Cancel
                </button>
                <button
                  onClick={handleVerify}
                  disabled={isVerifying || !question}
                  className="py-3 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {isVerifying ? 'Verifying...' : 'Verify Answer'}
                </button>
              </div>

              <div className="pt-2 border-t border-[var(--border-color)]">
                <button onClick={() => setIsDevMode(!isDevMode)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-color)] underline">
                  Developer retrieval (older installs)
                </button>
                {isDevMode && (
                  <div className="mt-3 p-3 rounded-xl bg-[#0d1117] border border-[#30363d] space-y-2">
                    <p className="text-xs text-slate-400">Enter developer master code to reveal without a security question. For older versions without a recovery vault, see <code className="font-mono bg-black/20 px-1 rounded">RECOVERY_GUIDE.md</code> to inspect <code className="font-mono">app_settings</code> / localStorage key <code className="font-mono">joainas_admin_recovery_v1</code>.</p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={devCode}
                        onChange={(e) => setDevCode(e.target.value)}
                        placeholder="JOAINAS-DEV-2026-..."
                        className="flex-1 px-3 py-2 rounded-lg border border-[#30363d] bg-[#161b22] text-white text-xs font-mono outline-none"
                      />
                      <button onClick={handleDevRecover} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                        Unlock
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {phase === 'revealed' && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Password Revealed — auto-hides in {countdown}s</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-emerald-300 font-mono text-sm font-bold text-gray-900 select-all">
                    {showPlain ? revealed : '••••••••••••'}
                    <button onClick={() => setShowPlain(!showPlain)} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100">
                      {showPlain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={handleCopy} className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700 mt-2">Copy it now — it will be hidden after 30 seconds for safety.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={onClose} className="py-3 rounded-xl border border-[var(--border-color)] text-sm font-semibold">
                  Close
                </button>
                <button onClick={() => setPhase('reset')} className="py-3 rounded-xl bg-[var(--accent-color)] text-white text-sm font-bold flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" /> Set New Password
                </button>
              </div>
            </>
          )}

          {phase === 'reset' && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">New Admin Password {capsOn && <span className="ml-2 text-xs font-bold text-amber-600">Caps Lock ON</span>}</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} onKeyUp={checkCaps} onKeyDown={checkCaps} placeholder="Min. 4 characters" className={`w-full px-4 py-3 rounded-xl border bg-[var(--bg-input)] text-sm outline-none ${capsOn ? 'border-amber-400' : 'border-[var(--border-color)]'}`} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Confirm New Password {capsOn && <span className="ml-2 text-xs font-bold text-amber-600">Caps Lock ON</span>}</label>
                  <input type="password" value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} onKeyUp={checkCaps} onKeyDown={checkCaps} placeholder="Re-enter" className={`w-full px-4 py-3 rounded-xl border bg-[var(--bg-input)] text-sm outline-none ${capsOn ? 'border-amber-400' : 'border-[var(--border-color)]'}`} />
                </div>
                {capsOn && <p className="text-xs font-bold text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Caps Lock is ON</p>}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button onClick={() => setPhase('revealed')} className="py-3 rounded-xl border border-[var(--border-color)] text-sm font-semibold">
                    Back
                  </button>
                  <button onClick={handleResetPassword} className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
                    Save New Password
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
