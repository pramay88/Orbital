import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_DIR = process.env.HOMEHUB_DATA_DIR ?? DEFAULT_DATA_DIR;

let database: Database.Database | null = null;

export function getDatabase(): Database.Database {
    if (!database) {
        throw new Error("Database is not initialized");
    }

    return database;
}

export function initializeDatabase(): void {
    if (database) return;

    fs.mkdirSync(DATA_DIR, { recursive: true });

    const databasePath = path.join(DATA_DIR, "homehub.db");
    database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");

    database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS media_items (
            id TEXT PRIMARY KEY,
            relative_path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            kind TEXT NOT NULL,
            size INTEGER NOT NULL,
            modified_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_media_items_kind ON media_items(kind);
    `);

    const mediaColumns = database.pragma("table_info(media_items)") as Array<{ name: string }>;
    if (!mediaColumns.some((column) => column.name === "mime_type")) {
        database.exec(`
            ALTER TABLE media_items
            ADD COLUMN mime_type TEXT NOT NULL
            DEFAULT 'application/octet-stream';
        `);
        console.log("[database] Migrated media_items.mime_type");
    }

    const mediaTable = database.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'media_items'
        LIMIT 1
    `).get() as { sql: string } | undefined;

    if (
        mediaTable &&
        !mediaTable.sql.includes("'pdf'")
    ) {
        database.transaction(() => {
            database?.exec(`
                CREATE TABLE media_items_new (
                    id TEXT PRIMARY KEY,
                    relative_path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK (
                        kind IN (
                            'video',
                            'audio',
                            'image',
                            'pdf',
                            'text',
                            'unsupported'
                        )
                    ),
                    size INTEGER NOT NULL,
                    modified_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                INSERT INTO media_items_new (
                    id,
                    relative_path,
                    name,
                    mime_type,
                    kind,
                    size,
                    modified_at,
                    created_at,
                    updated_at
                )
                SELECT
                    id,
                    relative_path,
                    name,
                    COALESCE(mime_type, 'application/octet-stream'),
                    CASE
                        WHEN kind IN (
                            'video',
                            'audio',
                            'image',
                            'pdf',
                            'text',
                            'unsupported'
                        ) THEN kind
                        ELSE 'unsupported'
                    END,
                    size,
                    modified_at,
                    created_at,
                    updated_at
                FROM media_items;

                DROP TABLE media_items;
                ALTER TABLE media_items_new RENAME TO media_items;
                CREATE INDEX IF NOT EXISTS idx_media_items_kind
                    ON media_items(kind);
            `);
        })();
        console.log("[database] Migrated media_items.kind");
    }

    console.log(`[database] SQLite initialized: ${databasePath}`);
}

export function closeDatabase(): void {
    database?.close();
    database = null;
}
