use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

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
        let mut hprinter: HANDLE = HANDLE(std::ptr::null_mut());
        let printer_name = wide(&printer);
        let defaults = PRINTER_DEFAULTSW {
            pDatatype: PWSTR::null(),
            pDevMode: std::ptr::null_mut(),
            DesiredAccess: PRINTER_ACCESS_USE,
        };

        OpenPrinterW(
            PCWSTR(printer_name.as_ptr()),
            &mut hprinter,
            Some(&defaults),
        )
        .map_err(|e| {
            format!(
                "Could not open printer \"{}\" ({:#x}). Check the printer name in Hardware Config and make sure it is connected.",
                printer,
                e.code().0
            )
        })?;

        let mut doc_name = wide("Joainas POS Receipt");
        let mut datatype = wide("RAW");
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };

        if StartDocPrinterW(hprinter, 1, &doc_info) == 0 {
            let _ = ClosePrinter(hprinter);
            return Err("StartDocPrinter failed.".to_string());
        }
        if !StartPagePrinter(hprinter).as_bool() {
            let _ = EndDocPrinter(hprinter);
            let _ = ClosePrinter(hprinter);
            return Err("StartPagePrinter failed.".to_string());
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
                let _ = EndPagePrinter(hprinter);
                let _ = EndDocPrinter(hprinter);
                let _ = ClosePrinter(hprinter);
                return Err("WritePrinter failed while sending the receipt.".to_string());
            }
            offset = end;
        }

        let _ = EndPagePrinter(hprinter);
        let _ = EndDocPrinter(hprinter);
        let _ = ClosePrinter(hprinter);
    }
    Ok(())
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

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_joainas_pos_tables",
            sql: include_str!("../../src/db/sqlite_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "seed_printer_config_default",
            sql: "
                INSERT INTO printer_configs (
                    id, store_name, tagline, address, phone,
                    receipt_header_note, receipt_footer_note, show_logo,
                    paper_width, auto_print_on_sale, point_rate, print_density
                ) VALUES (
                    1, 'Joainas Supermarket & Coldstore', '',
                    '', '', '', '', 1, '80mm', 1, 2, 'Normal'
                )
                ON CONFLICT(id) DO NOTHING;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_capabilities_and_customer_account_type",
            sql: "
                ALTER TABLE users ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]';

                ALTER TABLE customers RENAME TO customers_old;
                CREATE TABLE customers (
                    id TEXT PRIMARY KEY NOT NULL,
                    full_name TEXT NOT NULL,
                    account_type TEXT CHECK(account_type IN ('individual', 'company', 'ngo', 'government')) NOT NULL DEFAULT 'individual',
                    phone TEXT,
                    address TEXT,
                    balance REAL NOT NULL DEFAULT 0.0,
                    points INTEGER NOT NULL DEFAULT 0,
                    advance_payment REAL NOT NULL DEFAULT 0.0,
                    assigned_cashier TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                INSERT INTO customers (id, full_name, account_type, phone, address, balance, points, advance_payment, assigned_cashier, created_at)
                    SELECT id, full_name, 'individual', phone, address, balance, points, advance_payment, NULL, created_at FROM customers_old;
                DROP TABLE customers_old;

                CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
                CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_category_colors",
            sql: "
                ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#6366f1';
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_printer_name",
            sql: "
                ALTER TABLE printer_configs ADD COLUMN printer_name TEXT NOT NULL DEFAULT 'POS-80C';
            ",
            kind: MigrationKind::Up,
        },
    ];

    let (db_path, _) = resolve_db_path();
    let db_url = format!("sqlite:{}", db_path.display());

    tauri::Builder::default()
        .plugin(SqlBuilder::default().add_migrations(&db_url, migrations).build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_db_info,
            relocate_database,
            print_raw,
            list_printers
        ])
        .run(tauri::generate_context!())
        .expect("error while running Joainas POS Windows application");
}
