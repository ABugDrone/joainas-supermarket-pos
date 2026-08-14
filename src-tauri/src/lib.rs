use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

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
    ];

    let (db_path, _) = resolve_db_path();
    let db_url = format!("sqlite:{}", db_path.display());

    tauri::Builder::default()
        .plugin(SqlBuilder::default().add_migrations(&db_url, migrations).build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_db_info, relocate_database])
        .run(tauri::generate_context!())
        .expect("error while running Joainas POS Windows application");
}
