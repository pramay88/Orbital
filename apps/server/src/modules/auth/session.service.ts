import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDatabase } from "../../database/db.js";
import { findUserById, type AuthUser } from "./user.repository.js";

export const SESSION_COOKIE = "homehub_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export interface Session {
    token: string;
    expiresAt: string;
}

export function createSession(
    userId: string,
    database: Database.Database = getDatabase(),
): Session {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    database.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), userId, hashToken(token), expiresAt, new Date().toISOString());

    return { token, expiresAt };
}

export function resolveSession(
    token: string | undefined,
    database: Database.Database = getDatabase(),
): AuthUser | null {
    if (!token) return null;

    const row = database.prepare(`
        SELECT user_id, expires_at
        FROM sessions
        WHERE token_hash = ?
        LIMIT 1
    `).get(hashToken(token)) as { user_id: string; expires_at: string } | undefined;

    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
        database.prepare("DELETE FROM sessions WHERE token_hash = ?")
            .run(hashToken(token));
        return null;
    }

    return findUserById(row.user_id, database);
}

export function deleteSession(
    token: string | undefined,
    database: Database.Database = getDatabase(),
): void {
    if (!token) return;
    database.prepare("DELETE FROM sessions WHERE token_hash = ?")
        .run(hashToken(token));
}

export function purgeExpiredSessions(database: Database.Database = getDatabase()): void {
    database.prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .run(new Date().toISOString());
}
