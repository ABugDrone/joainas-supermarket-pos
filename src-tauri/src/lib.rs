use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_sql::Builder as SqlBuilder;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ACCESS_USE, PRINTER_DEFAULTSW,
};

// Must match `identifier` in tauri.conf.json. Tauri's own app-data dir
// (WebView profile, appDataDir API) is derived from the bundle id — Rust
// state files (pointer, startup stamp) must live in the same place or shop
// state fragments across directories and fresh installs misdetect.
const APP_IDENTIFIER: &str = "com.dronebug.dirms.desktop";
const DB_FILE_NAME: &str = "senior_citizen_accessories.db";
const POINTER_FILE_NAME: &str = "db_path.txt";
// Persistent boot timestamp for OS-clock rollback detection (see
// validate_startup_time below). Lives in the app-private config dir — a
// different location from the SQLite vault and localStorage anchor — so a
// rollback performed while the app was closed is still caught even if the
// other two copies were wiped or restored from an old backup.
const STARTUP_TIME_FILE_NAME: &str = "startup_time.bin";
// Backward skew allowed at boot (seconds). Matches CLOCK_SKEW_TOLERANCE_MS
// (30 min) in src/utils/trustedTime.ts — small NTP/DST corrections pass,
// anything bigger means the clock was moved while the app was closed.
// Deliberately BACKWARD-only: normal overnight/weekend closures move time
// forward, so they can never trip this check.
const STARTUP_BACKWARD_TOLERANCE_SECS: u64 = 30 * 60;

// Pre-1.4.5 (Joainas-branded) locations. The 1.4.5 rebrand changed both the
// app identifier AND the db file name, so upgrades orphaned the live database
// (empty new file = "sales records erased"). These are checked first and the
// legacy database is COPIED (never moved/deleted) into the new location.
// v1.5.2 adds the 1.5.x Rust-side id (com.seniorcitizen...), which never
// matched the bundle id (com.dronebug...) — its pointer file and startup
// stamp are adopted, never abandoned.
const LEGACY_APP_IDENTIFIERS: &[&str] = &[
    "com.seniorcitizen.accessories.desktop",
    "com.joainas.pos.desktop",
];
const LEGACY_DB_FILE_NAMES: &[&str] = &["joainas_pos.db"];

// The database file lives in Documents\Backup by default (or a folder the
// admin selects). A tiny pointer file in the app config dir records the
// absolute path to the database so it can be resolved BEFORE the SQL plugin
// opens its connection at startup. The pointer file is the single source of
// truth for where the live database resides.

fn config_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    if appdata.is_empty() {
        PathBuf::from(".")
    } else {
        Path::new(&appdata).join(APP_IDENTIFIER)
    }
}

fn documents_dir() -> PathBuf {
    let profile = std::env::var("USERPROFILE").unwrap_or_default();
    if profile.is_empty() {
        PathBuf::from(".")
    } else {
        Path::new(&profile).join("Documents")
    }
}

fn default_db_path() -> PathBuf {
    documents_dir().join("Backup").join(DB_FILE_NAME)
}

fn pointer_path() -> PathBuf {
    config_dir().join(POINTER_FILE_NAME)
}

fn startup_time_path() -> PathBuf {
    config_dir().join(STARTUP_TIME_FILE_NAME)
}

fn copy_db_file(src: &Path, dst: &Path) {
    let _ = fs::create_dir_all(dst.parent().unwrap_or_else(|| Path::new(".")));
    for ext in ["", "-wal", "-shm"] {
        let src_path = PathBuf::from(format!("{}{}", src.display(), ext));
        if src_path.exists() {
            let dst_path = PathBuf::from(format!("{}{}", dst.display(), ext));
            let _ = fs::copy(&src_path, &dst_path);
        }
    }
}

/// If a pointer file exists at the current location, ensure its parent
/// exists and return the recorded path.
fn read_pointer_file() -> Option<PathBuf> {
    let content = fs::read_to_string(&pointer_path()).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = PathBuf::from(trimmed);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    Some(p)
}

fn legacy_config_dir(app_id: &str) -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    if appdata.is_empty() {
        PathBuf::from(".")
    } else {
        Path::new(&appdata).join(app_id)
    }
}

/// Identifier migration: state files used to live under legacy app-data
/// dirs (see LEGACY_APP_IDENTIFIERS). Adopt the legacy pointer file (the
/// admin's chosen folder) and the startup timestamp (tamper evidence)
/// instead of starting over with amnesia — otherwise the next boot
/// misdetects a healthy install as fresh. Copy, never move.
fn migrate_legacy_config() {
    for old_id in LEGACY_APP_IDENTIFIERS {
        let old_cfg = legacy_config_dir(old_id);
        if old_cfg == config_dir() {
            continue;
        }
        if let Ok(content) = fs::read_to_string(old_cfg.join(POINTER_FILE_NAME)) {
            if content.trim().is_empty() {
                continue;
            }
            if read_pointer_file().is_none() {
                if let Some(parent) = pointer_path().parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&pointer_path(), content.trim());
            }
            if !startup_time_path().exists() {
                if let Some(parent) = startup_time_path().parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::copy(
                    old_cfg.join(STARTUP_TIME_FILE_NAME),
                    &startup_time_path(),
                );
            }
            break;
        }
    }
}

/// Resolve the absolute database path.
/// - If a pointer file exists, it wins (the folder the user chose).
/// - Otherwise adopt legacy config files, then fall back to
///   Documents\Backup, migrating a legacy database that may still live in
///   the app config dir (never purges existing data).
/// Returns the resolved path and whether a legacy DB was migrated.
fn resolve_db_path() -> (PathBuf, bool) {
    if let Some(p) = read_pointer_file() {
        return (p, false);
    }

    migrate_legacy_config();
    if let Some(p) = read_pointer_file() {
        return (p, false);
    }

    let legacy = config_dir().join(DB_FILE_NAME);
    let target = default_db_path();
    let _ = fs::create_dir_all(target.parent().unwrap_or_else(|| Path::new(".")));

    let mut migrated = false;
    if legacy.exists() && !target.exists() {
        copy_db_file(&legacy, &target);
        migrated = true;
    }

    // 1.4.5 rebrand recovery: if the new-location DB still doesn't exist,
    // look for a legacy Joainas database (old app-data dir, old file name,
    // old pointer file, or Documents\Backup under the old name) and copy it
    // in. Copy — never move — so the old install remains intact as backup.
    if !target.exists() {
        let mut candidates: Vec<PathBuf> = Vec::new();
        for old_id in LEGACY_APP_IDENTIFIERS {
            let old_cfg = legacy_config_dir(old_id);
            // Legacy pointer file may point at the true live DB location.
            let old_pointer = old_cfg.join(POINTER_FILE_NAME);
            if let Ok(content) = fs::read_to_string(&old_pointer) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    candidates.push(PathBuf::from(trimmed));
                }
            }
            for old_name in LEGACY_DB_FILE_NAMES {
                candidates.push(old_cfg.join(old_name));
                candidates.push(documents_dir().join("Backup").join(old_name));
            }
        }
        for cand in candidates {
            if cand.exists() && cand.is_file() {
                copy_db_file(&cand, &target);
                migrated = true;
                break;
            }
        }
    }

    if let Some(parent) = pointer_path().parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&pointer_path(), target.to_string_lossy().to_string());

    (target, migrated)
}

#[derive(Serialize)]
struct DbInfo {
    url: String,
    folder: String,
    migrated: bool,
}

#[tauri::command]
fn get_db_info() -> Result<DbInfo, String> {

    let (path, migrated) = resolve_db_path();
    let folder = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(DbInfo {
        url: format!("sqlite:{}", path.display()),
        folder,
        migrated,
    })
}

#[tauri::command]
fn relocate_database(dir: String) -> Result<String, String> {
    let (current, _) = resolve_db_path();
    let target = Path::new(&dir).join(DB_FILE_NAME);

    if target != current {
        let _ = fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        if current.exists() {
            copy_db_file(&current, &target);
        }
        if let Some(parent) = pointer_path().parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&pointer_path(), target.to_string_lossy().to_string())
            .map_err(|e| e.to_string())?;
    }

    Ok(format!("sqlite:{}", target.display()))
}

// ---------------------------------------------------------------------------
// Startup-time validation: OS-clock rollback detection across restarts.
//
// The frontend's trusted-clock anchor only advances while the app is running,
// so a rollback performed while the app was CLOSED is invisible to it whenever
// the anchor stores were also wiped or restored from an old backup. This file
// records the Unix time of every successful boot in the app-private config
// dir; if the current clock reads further behind the recorded time than
// STARTUP_BACKWARD_TOLERANCE_SECS, the clock was moved backwards while the
// app was closed and the boot is reported as tampered.
//
// Two deliberate deviations from the naive "write once, compare forever"
// design (which degrades into uselessness as the stored stamp goes stale):
// - The stamp is REWRITTEN on every successful validation, so it always
//   reflects the most recent trusted boot.
// - A corrupt/unparseable file self-heals (re-initialized, reported ok with
//   a warning reason) instead of bricking the app — the frontend audits the
//   recovery. Only a confirmed backward jump returns ok: false, and then the
//   file is left untouched to preserve the evidence for the next boot.
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct StartupTimeValidation {
    ok: bool,
    reason: String,
    last_trusted_unix: u64,
    current_unix: u64,
}

fn current_unix_secs() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| {
            "System clock reads before the Unix epoch — the OS date is wildly wrong.".to_string()
        })
}

#[tauri::command]
fn validate_startup_time() -> Result<StartupTimeValidation, String> {
    let path = startup_time_path();
    let current = current_unix_secs()?;

    let stored = match fs::read_to_string(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // First ever launch — initialize the stamp.
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&path, current.to_string()).map_err(|e| e.to_string())?;
            return Ok(StartupTimeValidation {
                ok: true,
                reason: "First launch — startup timestamp initialized.".to_string(),
                last_trusted_unix: current,
                current_unix: current,
            });
        }
        Err(e) => return Err(format!("Could not read startup timestamp: {}", e)),
        Ok(content) => content,
    };

    let last_trusted: u64 = match stored.trim().parse() {
        Ok(v) => v,
        Err(_) => {
            // Corrupt file (disk glitch or manual edit) — re-initialize and
            // report ok so the app is never bricked; the frontend audits it.
            fs::write(&path, current.to_string()).map_err(|e| e.to_string())?;
            return Ok(StartupTimeValidation {
                ok: true,
                reason: "Startup timestamp file was corrupt — re-initialized. If this repeats, the system disk may be failing.".to_string(),
                last_trusted_unix: current,
                current_unix: current,
            });
        }
    };

    if current.saturating_add(STARTUP_BACKWARD_TOLERANCE_SECS) < last_trusted {
        // Clock moved backwards while the app was closed. Do NOT rewrite the
        // file — the stale stamp is the evidence, and the next boot must
        // still fail until the clock is corrected.
        let behind = last_trusted.saturating_sub(current);
        return Ok(StartupTimeValidation {
            ok: false,
            reason: format!(
                "System clock was moved backwards by ~{}h {}m while the app was closed. Correct the OS date/time and restart the app.",
                behind / 3600,
                (behind % 3600) / 60
            ),
            last_trusted_unix: last_trusted,
            current_unix: current,
        });
    }

    // Healthy boot — advance the stamp so the next launch compares against
    // NOW, not against some long-ago first run.
    fs::write(&path, current.to_string()).map_err(|e| e.to_string())?;
    Ok(StartupTimeValidation {
        ok: true,
        reason: String::new(),
        last_trusted_unix: current,
        current_unix: current,
    })
}

/// v2.0.6: called after an ADMIN has verified that the current OS date/time
/// is correct. Rewrites the native startup stamp so the next launch does not
/// re-flag a stale/future value left over from an earlier clock change.
#[tauri::command]
fn accept_startup_time() -> Result<u64, String> {
    let current = current_unix_secs()?;
    let path = startup_time_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, current.to_string()).map_err(|e| e.to_string())?;
    Ok(current)
}

// ---------------------------------------------------------------------------
// Native ESC/POS thermal printing via the Windows Print Spooler.
//
// Sends RAW bytes directly to the printer queue — no browser print dialog, no
// A4 reformatting, no wasted paper. The frontend builds the exact ESC/POS
// command stream and hands it to this command; we simply spool it to the
// printer as-is (datatype "RAW").
// ---------------------------------------------------------------------------

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[tauri::command]
fn print_raw(printer: String, data: Vec<u8>) -> Result<(), String> {
    unsafe {
        // Try the configured printer name first, then the Windows default
        // printer, then any printer that looks like a thermal receipt printer.
        let mut candidates = Vec::new();
        if !printer.trim().is_empty() {
            candidates.push(printer.trim().to_string());
        }
        let default = get_default_printer_name();
        if let Some(d) = &default {
            if !candidates.contains(d) {
                candidates.push(d.clone());
            }
        }
        let thermal = list_printers();
        for name in thermal {
            if !candidates.contains(&name)
                && (name.contains("XP-80")
                    || name.contains("POS-80")
                    || name.to_lowercase().contains("thermal")
                    || name.to_lowercase().contains("receipt")
                    || name.to_lowercase().contains("80")
                    || name.to_lowercase().contains("xprinter"))
            {
                candidates.push(name);
            }
        }

        if candidates.is_empty() {
            return Err("No printer found. Connect the thermal printer and check Devices and Printers.".to_string());
        }

        let mut errors: Vec<String> = Vec::new();
        let mut printed_ok = false;

        for candidate in &candidates {
            let mut hprinter: HANDLE = HANDLE(std::ptr::null_mut());
            let printer_name = wide(candidate);
            let defaults = PRINTER_DEFAULTSW {
                pDatatype: PWSTR::null(),
                pDevMode: std::ptr::null_mut(),
                DesiredAccess: PRINTER_ACCESS_USE,
            };

            match OpenPrinterW(
                PCWSTR(printer_name.as_ptr()),
                &mut hprinter,
                Some(&defaults),
            ) {
                Ok(_) => {}
                Err(e) => {
                    errors.push(format!("\"{}\": {:#x}", candidate, e.code().0));
                    continue;
                }
            }

            let mut doc_name = wide("Joainas Mart Receipt");
            let mut datatype = wide("RAW");
            let doc_info = DOC_INFO_1W {
                pDocName: PWSTR(doc_name.as_mut_ptr()),
                pOutputFile: PWSTR::null(),
                pDatatype: PWSTR(datatype.as_mut_ptr()),
            };

            if StartDocPrinterW(hprinter, 1, &doc_info) == 0 {
                let _ = ClosePrinter(hprinter);
                errors.push(format!("\"{}\": StartDoc failed", candidate));
                continue;
            }
            if !StartPagePrinter(hprinter).as_bool() {
                let _ = EndDocPrinter(hprinter);
                let _ = ClosePrinter(hprinter);
                errors.push(format!("\"{}\": StartPage failed", candidate));
                continue;
            }

            let mut written: u32 = 0;
            let mut offset = 0usize;
            let chunk = 4096usize;
            while offset < data.len() {
                let end = (offset + chunk).min(data.len());
                let ok = WritePrinter(
                    hprinter,
                    data[offset..end].as_ptr() as *const _,
                    (end - offset) as u32,
                    &mut written,
                );
                if !ok.as_bool() {
                    break;
                }
                offset = end;
            }

            let _ = EndPagePrinter(hprinter);
            let _ = EndDocPrinter(hprinter);
            let _ = ClosePrinter(hprinter);

            if offset >= data.len() {
                printed_ok = true;
                break;
            } else {
                errors.push(format!("\"{}\": write failed", candidate));
            }
        }

        if printed_ok {
            Ok(())
        } else {
            Err(format!(
                "Could not send to any printer. Tried: {}. Make sure the printer is on and connected (see Control Panel > Devices and Printers).",
                errors.join("; ")
            ))
        }
    }
}

/// Return the Windows default printer name (empty string if none).
fn get_default_printer_name() -> Option<String> {
    unsafe {
        use windows::Win32::Graphics::Printing::GetDefaultPrinterW;
        let mut len: u32 = 0;
        let _ = GetDefaultPrinterW(PWSTR::null(), &mut len);
        if len == 0 {
            return None;
        }
        let mut buf = vec![0u16; len as usize];
        let ok = GetDefaultPrinterW(PWSTR(buf.as_mut_ptr()), &mut len);
        if !ok.as_bool() {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}

/// List installed printers (names only) so the app can offer a picker.
#[tauri::command]
fn list_printers() -> Vec<String> {
    unsafe {
        use windows::Win32::Graphics::Printing::{
            EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_1W,
        };
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut count: u32 = 0;
        let _ = EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            None,
            &mut needed,
            &mut count,
        );
        let mut buf = vec![0u8; needed as usize];
        let ok = EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            Some(buf.as_mut_slice()),
            &mut needed,
            &mut count,
        );
        let mut names = Vec::new();
        if ok.is_ok() {
            let mut ptr = buf.as_ptr() as *const PRINTER_INFO_1W;
            for _ in 0..count {
                let info = &*ptr;
                let p = info.pName.as_ptr();
                if !p.is_null() {
                    let len = (0usize..)
                        .find(|&i| *p.offset(i as isize) == 0)
                        .unwrap_or(0);
                    let name: Vec<u16> = (0..len).map(|i| *p.offset(i as isize)).collect();
                    names.push(String::from_utf16_lossy(&name));
                }
                ptr = ptr.offset(1);
            }
        }
        names
    }
}

/// Return the Windows default printer name so the UI can prefill it.
#[tauri::command]
fn get_default_printer() -> String {
    get_default_printer_name().unwrap_or_default()
}

/// Guaranteed process exit for the close path. Window close/destroy can
/// strand the app in a half-torn-down state (blank window, living process)
/// if the WebView is wedged — nothing survives std::process::exit.
#[tauri::command]
fn force_exit() -> Result<(), String> {
    std::process::exit(0);
}

pub fn run() {
    let _ = resolve_db_path();

    tauri::Builder::default()
        // NOTE: No sqlx migrations are registered here on purpose. Older
        // releases embedded the whole schema as migration v1 and later edited
        // that same file, which broke the migration checksum/dirty-state
        // checks on existing databases and even on fresh installs (migration
        // v3 tried to re-add a column already present in the updated schema).
        // The schema is now bootstrapped idempotently from the frontend
        // (src/utils/db.ts -> bootstrapSchema) on every connection, so old and
        // new databases both work and existing data is never lost.
        .plugin(SqlBuilder::default().build())
        // Single instance: clicking the desktop icon while the app is
        // already open (e.g. minimized to the taskbar) focuses the running
        // window instead of opening a duplicate with a stale session.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_db_info,
            relocate_database,
            validate_startup_time,
            accept_startup_time,
            print_raw,
            list_printers,
            get_default_printer,
            force_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running Joainas Mart Windows application");
}
