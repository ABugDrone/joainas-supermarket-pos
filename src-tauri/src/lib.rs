use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

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
    ];

    tauri::Builder::default()
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:joainas_pos.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running Joainas POS Windows application");
}
