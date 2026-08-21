# Joainas POS — ADMIN Password Recovery Guide (v1.3.7)

## For Store ADMIN (normal use)

1. On the Sign In screen, deliberately fail the ADMIN login **5 times** with a wrong password.
   - After the 5th failure, a gold banner appears: **“ADMIN recovery unlocked — 5 failed attempts”** with a **Recover ADMIN Password** button.
   - This screen never appears before 5 failures — it is invisible during normal logins.

2. Click **Recover ADMIN Password**.
   - The app picks **one random** of the 5 private security questions you set during First-Time Setup (or later in **Admin → Security & Recovery**).
   - Questions are intentionally uncomfortable and private — e.g. *first childhood crush*, *exact date you first met your partner*, *secret family nickname*, *embarrassing teenage memory*, *private fear* — so no colleague can guess them. Answers are case-insensitive.

3. Type your exact answer and click **Verify Answer**.
   - If correct, the **actual ADMIN password is shown in plain text for 30 seconds** (with a countdown). Click the copy icon to copy it.
   - After 30 seconds it auto-hides. You can also click **Set New Password** to immediately create a new one (min 4 chars, confirmation required). The new password is bcrypt-hashed and the recovery vault is re-encrypted to the new value.

4. If you answer wrong, try again. There is no lockout — you can keep trying.

### Setting / Updating the 5 Questions

- **At first install:** Step 3 of 3 of First-Time Setup now asks for all 5 answers before the dashboard opens. All 5 are required.
- **Later:** Go to **Admin → Security & Recovery** (ADMIN only). Fill the 5 answers, confirm with the current ADMIN plain password, and click **Create/Update Recovery Vault**. The vault status shows “Vault Active” when ready.

## For Developer / Support (older installs without a vault, or when ADMIN truly cannot answer)

### Shortcut in the running app (works on any version ≥1.3.7)

1. On the **Sign In** screen, press **Ctrl + Shift + Alt + D**.
2. The recovery modal opens with a **Developer retrieval** section.
3. Enter the master code: `JOAINAS-DEV-2026-DRONEBUG`
   - If a recovery vault exists (≥1.3.7), the plain password is revealed immediately without a question.
   - This code is intentionally simple for local support — change it in `src/utils/recovery.ts` (`DEV_MASTER_PLAIN`) and rebuild for a private build if you need secrecy.

### Direct file / DB inspection (older install, e.g. v1.3.6, no vault)

If the store is still on an older version that never created a vault, there is nothing to decrypt. Do one of:

**A) Inspect the live DB location:**
- In the app, open **Admin → SQLite DB & Backups** and note the **BACKUP Folder Configuration** path. Or read `%APPDATA%\com.joainas.pos.desktop\db_path.txt` — it contains the full path to `joainas_pos.db`.
- Open that file with **DB Browser for SQLite** or `sqlite3`:

```sql
-- where is the recovery vault (if any)?
SELECT value FROM app_settings WHERE key='admin_recovery';

-- list users (password_hash is bcrypt, not reversible)
SELECT id, username, role, password_hash, status FROM users WHERE username='admin';

-- emergency unlock: clear the hash so any password works, then use the recovery
-- "Set New Password" flow, or directly set a known bcrypt hash:
UPDATE users SET password_hash = '' WHERE username='admin';
-- Now sign in as admin with any password, then go to Admin → Security & Recovery
-- to set the 5 questions and a proper new password.
```

In browser dev mode (no Tauri), the same vault is in `localStorage`:

```js
localStorage.getItem('joainas_admin_recovery_v1')
```

It contains `{questions:[{id, question, answerHash}], encryptedPassword, ...}`. `encryptedPassword` is XOR-obfuscated with the static key `JOAINAS_DRONEBUG_RECOVERY_2026_V1` and base64-encoded (see `src/utils/recovery.ts` `obfuscate`/`deobfuscate`). You can deobfuscate it by calling `await devRecoverPassword('JOAINAS-DEV-2026-DRONEBUG')` from the dev console.

**B) Reset via app_settings (no cracking needed):**
- If you have file access, you can also just delete the vault to force a reset:

```sql
DELETE FROM app_settings WHERE key='admin_recovery';
```

Then restart the app as ADMIN, go to **Admin → Security & Recovery**, and create a fresh vault.

### Security Notes

- Security answers are stored as **bcrypt hashes** (cost 10), never plain text. Passwords are stored as bcrypt for login + an obfuscated copy for recovery — the obfuscation key is local to the binary. Physical access to the machine + DB file is required to even attempt recovery, which matches the threat model of a single-store POS.
- The 30-second reveal is intentionally short. Copy, then let it auto-hide.
- Change the developer master code per deployment if you redistribute the binary.

## Build & Version

- This flow is included in **v1.3.7**. After upgrading an older install, the first ADMIN login should visit **Admin → Security & Recovery** to create the vault. Until then, the login screen will show “No recovery vault found” after 5 failures and offer the developer path.

