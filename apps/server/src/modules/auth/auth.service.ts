import type Database from "better-sqlite3";
import { getDatabase } from "../../database/db.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import {
    createUser,
    findUserByUsername,
    hasAdminUser,
    toPublicUser,
    type PublicUser,
} from "./user.repository.js";

export class SetupAlreadyCompletedError extends Error {
    constructor() {
        super("HomeHub initial setup has already been completed");
    }
}

export class InvalidCredentialsError extends Error {
    constructor() {
        super("Invalid username or password");
    }
}

export function getSetupStatus(database: Database.Database = getDatabase()) {
    return { setupRequired: !hasAdminUser(database) };
}

export async function initializeAdmin(
    input: { username: string; password: string },
): Promise<PublicUser> {
    const database = getDatabase();
    const username = input.username.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    const transaction = database.transaction(() => {
        if (hasAdminUser(database)) throw new SetupAlreadyCompletedError();
        if (findUserByUsername(username, database)) {
            throw new Error("Username is already taken");
        }

        return toPublicUser(createUser({
            username,
            passwordHash,
            role: "admin",
        }, database));
    });

    return transaction();
}

export async function authenticateUser(
    username: string,
    password: string,
): Promise<PublicUser> {
    const user = findUserByUsername(username.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new InvalidCredentialsError();
    }

    return toPublicUser(user);
}
