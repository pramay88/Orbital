import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../../database/db.js";

export type UserRole = "admin" | "user";

export interface AuthUser {
    id: string;
    username: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
}

export type PublicUser = Omit<AuthUser, "passwordHash">;

interface UserRow {
    id: string;
    username: string;
    password_hash: string;
    role: UserRole;
    created_at: string;
}

function mapUser(row: UserRow): AuthUser {
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        role: row.role,
        createdAt: row.created_at,
    };
}

export function toPublicUser(user: AuthUser): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
}

export function createUser(
    input: { username: string; passwordHash: string; role?: UserRole },
    database: Database.Database = getDatabase(),
): AuthUser {
    const user: AuthUser = {
        id: randomUUID(),
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role ?? "user",
        createdAt: new Date().toISOString(),
    };

    database.prepare(`
        INSERT INTO users (id, username, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(user.id, user.username, user.passwordHash, user.role, user.createdAt);

    return user;
}

export function findUserByUsername(
    username: string,
    database: Database.Database = getDatabase(),
): AuthUser | null {
    const row = database.prepare(`
        SELECT id, username, password_hash, role, created_at
        FROM users WHERE username = ? LIMIT 1
    `).get(username) as UserRow | undefined;
    return row ? mapUser(row) : null;
}

export function findUserById(
    id: string,
    database: Database.Database = getDatabase(),
): AuthUser | null {
    const row = database.prepare(`
        SELECT id, username, password_hash, role, created_at
        FROM users WHERE id = ? LIMIT 1
    `).get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
}

export function hasAdminUser(database: Database.Database = getDatabase()): boolean {
    return database.prepare(
        "SELECT 1 FROM users WHERE role = 'admin' LIMIT 1",
    ).get() !== undefined;
}
