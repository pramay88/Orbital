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
    `);

    console.log(`[database] SQLite initialized: ${databasePath}`);
}

export function closeDatabase(): void {
    database?.close();
    database = null;
}
