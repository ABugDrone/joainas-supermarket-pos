use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri_plugin_sql::Builder as SqlBuilder;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ACCESS_USE, PRINTER_DEFAULTSW,
};

const APP_IDENTIFIER: &str = "com.joainas.pos.desktop";
const DB_FILE_NAME: &str = "joainas_pos.db";
const POINTER_FILE_NAME: &str = "db_path.txt";

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

/// Resolve the absolute database path.
/// - If a pointer file exists, it wins (the folder the user chose).
/// - Otherwise fall back to Documents\Backup, migrating a legacy database
///   that may still live in the app config dir (never purges existing data).
/// Returns the resolved path and whether a legacy DB was migrated.
fn resolve_db_path() -> (PathBuf, bool) {
    if let Ok(content) = fs::read_to_string(&pointer_path()) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if let Some(parent) = p.parent() {
                let _ = fs::create_dir_all(parent);
            }
            return (p, false);
        }
    }

    let legacy = config_dir().join(DB_FILE_NAME);
    let target = default_db_path();
    let _ = fs::create_dir_all(target.parent().unwrap_or_else(|| Path::new(".")));

    let mut migrated = false;
    if legacy.exists() && !target.exists() {
        copy_db_file(&legacy, &target);
        migrated = true;
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

            let mut doc_name = wide("Joainas POS Receipt");
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_db_info,
            relocate_database,
            print_raw,
            list_printers,
            get_default_printer
        ])
        .run(tauri::generate_context!())
        .expect("error while running Joainas POS Windows application");
}
