# Joainas Mart — ADMIN Password Recovery Guide (v2.0.6)

This guide covers the **ADMIN** account only. Staff passwords can be reset by an ADMIN in **Admin → Staff** without this flow.

## What changed in 2.0.6

- New installs set **one** private security question, not five. The recovery modal now accepts a 1-question vault.
- Changing the ADMIN password in **Admin → Staff** now syncs the encrypted recovery-vault copy, so recovery reveals the current password.
- If an install has **no vault** (older bcrypt-only accounts), support can use the controlled **Reset ADMIN Password** action in the developer panel. A bcrypt hash is never reversible.
- The developer master code in this build is:

  `SENIOR CITIZEN-DEV-2026-DRONEBUG`

## For the Store ADMIN (normal recovery)

1. On the **Sign In** screen, fail the ADMIN login **5 times** with a wrong password.
   - After the 5th failure, an amber panel appears: **“ADMIN recovery unlocked — 5 failed attempts”** with a **Recover ADMIN Password** button.
   - The panel is hidden before 5 failures.

2. Click **Recover ADMIN Password**.
   - The app shows the question stored in your vault. New installs have one question; legacy 1.3.7 vaults may have five, in which case one is picked at random.
   - Answers are case-insensitive and trimmed.

3. Type the exact answer and click **Verify Answer**.
   - A correct answer reveals the **actual ADMIN password in plain text for 30 seconds**. Use the copy icon if needed.
   - After 30 seconds it hides automatically.
   - Click **Set New Password** to replace it immediately (minimum 4 characters, confirmation required). The new value is bcrypt-hashed and the recovery vault is updated.

4. A wrong answer can be retried. There is no lockout on the security question.

### Setting or updating the question

- **During first install:** the setup wizard asks you to choose one of five private questions and provide the answer.
- **Later:** sign in as ADMIN and open **Admin → Security & Recovery**. Choose a question, enter the answer and the current ADMIN plain password, then click **Create/Update Recovery Vault**. The badge shows **Vault Active** when ready.
- The five presets are intentionally private: first childhood crush, the exact date you met your partner, a family-only nickname, an embarrassing teenage memory, and a private fear. Pick one only you can answer.

## For Developer / Support

### Shortcut in the running app

1. On the **Sign In** screen, press **Ctrl + Shift + Alt + D**. The recovery modal opens with a **Developer retrieval** section.
2. Enter the master code:

   `SENIOR CITIZEN-DEV-2026-DRONEBUG`

3. If a vault exists, **Unlock Vault** reveals the stored plaintext password without a security question.
4. If **no vault exists**, use **Reset ADMIN Password** in the same panel:
   - Enter a new ADMIN password (minimum 4 characters) and confirm it.
   - Click **Reset ADMIN Password**.
   - The app writes a fresh bcrypt hash, syncs the vault if one exists, and records an **ADMIN Password Reset via Developer Code** audit entry.
   - Sign in with the new password immediately, then set a security question in **Admin → Security & Recovery**.

> **Why reset instead of recover?** Login passwords are bcrypt hashes and cannot be reversed. Without a vault there is no plaintext to reveal, so the only safe support path is a controlled reset.

### Where the vault lives

- **SQLite (Tauri desktop):** `app_settings` row with key `admin_recovery`.
- **localStorage (browser/dev fallback):** `senior_citizen_accessories_admin_recovery_v1`.
- **App data folder:** `%APPDATA%\com.dronebug.dirms.desktop\` (the Tauri identifier is unchanged so existing shops keep their data). The exact DB path is shown in **Admin → SQLite DB & Backups** and in `db_path.txt`.
- The vault contains `{ questions: [{ id, question, answerHash }], encryptedPassword, createdAt, updatedAt }`.
- Answers are bcrypt-hashed. `encryptedPassword` is XOR-obfuscated with the local recovery key and base64-encoded (see `src/utils/recovery.ts`).

### Manual inspection (last resort)

Open the DB with **DB Browser for SQLite** or `sqlite3`:

```sql
-- Is there a vault?
SELECT value FROM app_settings WHERE key = 'admin_recovery';

-- List the admin account. The password column is a bcrypt hash, not plaintext.
SELECT id, username, role, password, status FROM users WHERE username = 'admin';
```

Do **not** clear the password hash to "unlock" the account: the login screen deliberately refuses an empty hash. Prefer the in-app developer reset above. If you must rebuild the account manually, generate a bcrypt hash offline and write that value, then sign in and set a new vault.

In browser dev mode:

```js
localStorage.getItem('senior_citizen_accessories_admin_recovery_v1')
```

## Security notes

- Security answers are stored as bcrypt hashes (cost 10), never plaintext.
- Login credentials are bcrypt; the recovery vault holds one obfuscated plaintext copy for the ADMIN account only. The obfuscation key is local to the binary, so physical access to the machine and its data folder is required to attempt recovery.
- The 30-second reveal is intentionally short. Copy the password, then let it hide.
- The developer reset is audit-logged. Change the master code in `src/utils/recovery.ts` (`DEV_MASTER_PLAIN`) and rebuild for a private distribution.

## Build and version

This flow ships in **v2.0.6**. After upgrading an older install, sign in as ADMIN and open **Admin → Security & Recovery** to create or refresh the vault. Until then, the login screen shows **No recovery vault found** after 5 failures and offers the developer path.
