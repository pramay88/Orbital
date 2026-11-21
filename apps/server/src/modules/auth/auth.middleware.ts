import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { UserRole } from "./user.repository.js";
import { resolveSession, SESSION_COOKIE } from "./session.service.js";

export type AuthVariables = {
    authUser: {
        id: string;
        username: string;
        role: UserRole;
    };
};

export function requireRole(...roles: UserRole[]): MiddlewareHandler {
    return async (c, next) => {
        const token = getCookie(c, SESSION_COOKIE);
        const user = resolveSession(token);

        if (!user || !roles.includes(user.role)) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        c.set("authUser", {
            id: user.id,
            username: user.username,
            role: user.role,
        });

        await next();
    };
}
