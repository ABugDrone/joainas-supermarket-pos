import bcrypt from 'bcryptjs';

/**
 * Admin Password Recovery — one "uncomfortable" personal question.
 * Only the admin who set it can answer; it is NOT obvious PII like mother's
 * maiden name or a pet's name. Legacy 1.3.7 vaults may still hold 5 questions;
 * recovery picks one at random from whatever the vault contains.
 *
 * Flow:
 *  - First-time setup Step 3 (or Admin → Security) stores one Q&A, the answer
 *    is bcrypt-hashed, and the current admin plaintext password is obfuscated
 *    and stored for recovery.
 *  - LoginModal counts failed attempts per username; after 5 wrong tries for
 *    the System Admin account it offers "Recover ADMIN Password".
 *  - Recovery asks the stored question; a correct answer reveals the actual
 *    password in plain text for 30 seconds (copy allowed) or lets the admin
 *    set a new one.
 *  - Developer path: hidden shortcut on login screen. If there is NO vault
 *    (bcrypt hash only), `devResetAdminPassword()` writes a new password after
 *    the master code is entered; that action is audit-logged.
 */

// The 5 preset uncomfortable questions — private enough that a colleague
// cannot guess, but the admin will remember. New installs choose and answer
// ONE; legacy 1.3.7 vaults may contain all 5, and recovery asks one at random.
export const RECOVERY_QUESTIONS: string[] = [
  'What is the full name of your first childhood crush (the first person you ever liked romantically)?',
  'On what exact date (DD/MM/YYYY) did you first meet your current partner or lover in person for the first time?',
  'What secret nickname does only your mother or closest family call you at home — one that no colleague or coworker knows?',
  'What is one deeply embarrassing thing you did as a teenager that you have hidden from everyone at work?',
  'What is a private fear or deep insecurity you have never shared with colleagues or customers?',
];

export interface RecoveryQA {
  id: number; // 0..4 index into RECOVERY_QUESTIONS
  question: string;
  answerHash: string; // bcrypt hash of normalized answer
}

export interface RecoveryRecord {
  questions: RecoveryQA[]; // 1 entry for new installs (user picks 1 of 5), or 5 for legacy 1.3.7 vaults
  encryptedPassword: string; // obfuscated plaintext admin password
  createdAt: string;
  updatedAt: string;
}

// Simple reversible obfuscation for the stored plaintext password.
// NOT high-grade crypto — this is a local POS app. The real gate is the
// uncomfortable answer check + physical access to the machine. The dev
// backdoor uses the same deobfuscation with a master code.
const RECOVERY_KEY = 'senior_citizen_accessories_DRONEBUG_RECOVERY_2026_V1';

function obfuscate(plain: string): string {
  let xored = '';
  for (let i = 0; i < plain.length; i++) {
    xored += String.fromCharCode(plain.charCodeAt(i) ^ RECOVERY_KEY.charCodeAt(i % RECOVERY_KEY.length));
  }
  // btoa works on binary string; ensure latin1
  return btoa(unescape(encodeURIComponent(xored)));
}

function deobfuscate(enc: string): string {
  try {
    const xored = decodeURIComponent(escape(atob(enc)));
    let plain = '';
    for (let i = 0; i < xored.length; i++) {
      plain += String.fromCharCode(xored.charCodeAt(i) ^ RECOVERY_KEY.charCodeAt(i % RECOVERY_KEY.length));
    }
    return plain;
  } catch {
    return '';
  }
}

const LS_KEY = 'senior_citizen_accessories_admin_recovery_v1';
const DB_KEY = 'admin_recovery';

// Persist via localStorage always, and via app_settings when in Tauri.
export async function saveRecoveryRecord(record: RecoveryRecord): Promise<void> {
  const payload = JSON.stringify(record);
  try {
    localStorage.setItem(LS_KEY, payload);
  } catch {}
  // Also try DB via storage helper (best-effort, don't block)
  try {
    const { isTauriRuntime } = await import('./db');
    if (isTauriRuntime()) {
      const { dbSetSetting } = await import('./db');
      await dbSetSetting(DB_KEY, payload);
    }
  } catch {}
}

export async function loadRecoveryRecord(): Promise<RecoveryRecord | null> {
  // Try DB first in Tauri, fallback to localStorage
  try {
    const { isTauriRuntime } = await import('./db');
    if (isTauriRuntime()) {
      const { dbGetSetting } = await import('./db');
      const raw = await dbGetSetting(DB_KEY);
      if (raw) return JSON.parse(raw) as RecoveryRecord;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as RecoveryRecord;
  } catch {}
  return null;
}

export function loadRecoveryRecordSync(): RecoveryRecord | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as RecoveryRecord;
  } catch {}
  return null;
}

export async function hasRecoverySetup(): Promise<boolean> {
  const rec = await loadRecoveryRecord();
  return !!rec && rec.questions.length >= 1 && !!rec.encryptedPassword;
}

export function hasRecoverySetupSync(): boolean {
  const rec = loadRecoveryRecordSync();
  return !!rec && rec.questions.length >= 1 && !!rec.encryptedPassword;
}

// Create a new recovery record from 5 answers + current plaintext password. Kept for backward compat with 1.3.7 vaults.
export async function createRecoveryRecord(
  answers: string[], // length 5, same order as RECOVERY_QUESTIONS
  plainPassword: string
): Promise<RecoveryRecord> {
  if (answers.length !== 5) throw new Error('All 5 security answers are required');
  const now = new Date().toISOString();
  const questions: RecoveryQA[] = await Promise.all(
    answers.map(async (ans, idx) => {
      const norm = ans.trim().toLowerCase();
      if (!norm) throw new Error(`Answer ${idx + 1} cannot be empty`);
      const hash = await bcrypt.hash(norm, 10);
      return { id: idx, question: RECOVERY_QUESTIONS[idx], answerHash: hash };
    })
  );
  const record: RecoveryRecord = {
    questions,
    encryptedPassword: obfuscate(plainPassword),
    createdAt: now,
    updatedAt: now,
  };
  await saveRecoveryRecord(record);
  return record;
}

// New vault — user picks ONE of 5 questions at first-time setup (or update). For updates from legacy 5-question vaults, the first question is the default.
export async function createSingleRecoveryRecord(
  questionId: number,
  answer: string,
  plainPassword: string
): Promise<RecoveryRecord> {
  if (questionId < 0 || questionId >= RECOVERY_QUESTIONS.length) throw new Error('Invalid question');
  const norm = answer.trim().toLowerCase();
  if (!norm) throw new Error('Answer cannot be empty');
  if (norm.length < 2) throw new Error('Answer too short');
  const hash = await bcrypt.hash(norm, 10);
  const now = new Date().toISOString();
  const record: RecoveryRecord = {
    questions: [{ id: questionId, question: RECOVERY_QUESTIONS[questionId], answerHash: hash }],
    encryptedPassword: obfuscate(plainPassword),
    createdAt: now,
    updatedAt: now,
  };
  await saveRecoveryRecord(record);
  return record;
}

// Update stored encrypted password when admin changes password (without changing Q&A)
export async function updateEncryptedPassword(newPlainPassword: string): Promise<void> {
  const rec = await loadRecoveryRecord();
  if (!rec) return;
  rec.encryptedPassword = obfuscate(newPlainPassword);
  rec.updatedAt = new Date().toISOString();
  await saveRecoveryRecord(rec);
}

// Verify a single answer for a given question id. Returns true if correct.
export async function verifyRecoveryAnswer(questionId: number, answer: string): Promise<boolean> {
  const rec = await loadRecoveryRecord();
  if (!rec) return false;
  const qa = rec.questions.find((q) => q.id === questionId);
  if (!qa) return false;
  const norm = answer.trim().toLowerCase();
  if (!norm) return false;
  return bcrypt.compare(norm, qa.answerHash);
}

// If the answer is correct, return the decrypted admin plaintext password.
export async function recoverPasswordWithAnswer(questionId: number, answer: string): Promise<string | null> {
  const ok = await verifyRecoveryAnswer(questionId, answer);
  if (!ok) return null;
  const rec = await loadRecoveryRecord();
  if (!rec) return null;
  return deobfuscate(rec.encryptedPassword);
}

// Developer backdoor master code — checked as plain compare for local support.
// Change per deployment if you redistribute the binary.
const DEV_MASTER_PLAIN = 'SENIOR_CITIZEN-DEV-2026-DRONEBUG';

export function verifyDevMasterCode(code: string): boolean {
  return code.trim() === DEV_MASTER_PLAIN;
}

export async function devRecoverPassword(devCode: string): Promise<string | null> {
  if (!verifyDevMasterCode(devCode)) return null;
  const rec = await loadRecoveryRecord();
  if (!rec) {
    // Older install with no recovery record: there is nothing reversible.
    // Use devResetAdminPassword() instead (documented in RECOVERY_GUIDE.md).
    return null;
  }
  return deobfuscate(rec.encryptedPassword);
}

/**
 * v2.0.6 controlled developer reset for installs with NO recovery vault.
 * A bcrypt hash cannot be reversed, so support writes a fresh ADMIN password.
 * Requires the developer master code, updates the stored hash, and syncs the
 * vault when one exists. The caller must write an audit entry.
 */
export async function devResetAdminPassword(
  devCode: string,
  newPassword: string
): Promise<boolean> {
  if (!verifyDevMasterCode(devCode)) return false;
  if (!newPassword || newPassword.length < 4) return false;
  try {
    const { loadUsers, saveUsers } = await import('./storage');
    const users = loadUsers();
    const target =
      users.find((u) => u.username.toLowerCase() === 'admin') ??
      users.find(
        (u) => u.role === 'System Admin' || (u.capabilities || []).includes('admin')
      );
    if (!target) return false;
    const hashed = await bcrypt.hash(newPassword, 10);
    saveUsers(users.map((u) => (u.id === target.id ? { ...u, password: hashed } : u)));
    // Keep the recovery vault in sync when one exists. No vault is created
    // here because that needs a real security answer the ADMIN chooses.
    await updateEncryptedPassword(newPassword);
    return true;
  } catch {
    return false;
  }
}

// For older installs: direct DB/localStorage inspection guide is documented
// in RECOVERY_GUIDE.md. This helper exposes the raw encrypted value for dev tools.
export async function getRawEncryptedPassword(): Promise<string | null> {
  const rec = await loadRecoveryRecord();
  return rec ? rec.encryptedPassword : null;
}
