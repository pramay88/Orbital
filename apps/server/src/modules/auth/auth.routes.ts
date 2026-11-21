import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
    authenticateUser,
    getSetupStatus,
    initializeAdmin,
    InvalidCredentialsError,
    SetupAlreadyCompletedError,
} from "./auth.service.js";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_TTL_MS } from "./session.service.js";
import { findUserById, type PublicUser } from "./user.repository.js";
import { resolveSession } from "./session.service.js";

export const authRoutes = new Hono();

const setupSchema = z.object({
    username: z.string().trim().min(3).max(32).regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can contain only letters, numbers, underscores and hyphens",
    ),
    password: z.string().min(12).max(128),
});

const loginSchema = z.object({
    username: z.string().trim().min(1).max(32),
    password: z.string().min(1).max(128),
});

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginKey(c: Context, username: string): string {
    const forwarded = c.req.header("x-forwarded-for");
    const address = forwarded?.split(",")[0]?.trim() ?? "lan";
    return `${address}:${username.toLowerCase()}`;
}

function isLoginLimited(key: string): boolean {
    const now = Date.now();
    const record = loginAttempts.get(key);
    if (!record || record.resetAt <= now) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return false;
    }

    record.count += 1;
    return record.count > LOGIN_LIMIT;
}

authRoutes.get("/setup/status", (c) => c.json(getSetupStatus()));

authRoutes.post("/setup", async (c) => {
    const parsed = setupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
        return c.json({ error: "Invalid setup details", details: parsed.error.flatten() }, 400);
    }

    try {
        const user = await initializeAdmin(parsed.data);
        return c.json({ message: "Administrator created", user }, 201);
    } catch (error) {
        if (error instanceof SetupAlreadyCompletedError) {
            return c.json({ error: error.message }, 409);
        }
        console.error("[auth] Setup failed:", error);
        return c.json({ error: "Unable to complete setup" }, 500);
    }
});

authRoutes.post("/login", async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
        return c.json({ error: "Invalid login details" }, 400);
    }

    if (isLoginLimited(loginKey(c, parsed.data.username))) {
        return c.json({ error: "Too many login attempts" }, 429);
    }

    try {
        const user = await authenticateUser(parsed.data.username, parsed.data.password);
        const fullUser = findUserById(user.id);
        if (!fullUser) return c.json({ error: "Invalid username or password" }, 401);

        const session = createSession(fullUser.id);
        setCookie(c, SESSION_COOKIE, session.token, {
            httpOnly: true,
            secure: process.env.HOMEHUB_COOKIE_SECURE === "true" ||
                c.req.header("x-forwarded-proto") === "https",
            sameSite: "Lax",
            path: "/",
            maxAge: Math.floor(SESSION_TTL_MS / 1000),
        });

        return c.json({ success: true, user });
    } catch (error) {
        if (error instanceof InvalidCredentialsError) {
            return c.json({ error: "Invalid username or password" }, 401);
        }
        console.error("[auth] Login failed:", error);
        return c.json({ error: "Unable to log in" }, 500);
    }
});

authRoutes.get("/me", (c) => {
    const user = resolveSession(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const publicUser: PublicUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
    };
    return c.json({ success: true, user: publicUser });
});

authRoutes.post("/logout", (c) => {
    deleteSession(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ success: true });
});
