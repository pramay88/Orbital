import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { systemRoutes } from "./modules/system/system.routes.js";
import { startMetricsCollector, stopMetricsCollector } from "./modules/system/metrics.store.js";
import { initializeStorage } from "./modules/filesystem/filesystem.service.js";
import { filesystemRoutes } from "./modules/filesystem/filesystem.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { requireRole } from "./modules/auth/auth.middleware.js";
import { closeDatabase, initializeDatabase } from "./database/db.js";
import { purgeExpiredSessions } from "./modules/auth/session.service.js";
import { mediaRoutes } from "./modules/media/media.routes.js";

const app = new Hono();

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Content-Security-Policy", "default-src 'none'");
});

app.use("/api/system/*", requireRole("admin"));
app.use("/api/files/*", async (c, next) => {
    const readMethods = new Set(["GET", "HEAD"]);
    if (readMethods.has(c.req.method)) {
        await next();
        return;
    }

    const middleware = requireRole("admin", "user");
    return middleware(c, next);
});

app.route("/api/system", systemRoutes);
app.route("/api/files", filesystemRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/media", mediaRoutes);

// Root endpoint
app.get("/", (c) => {
    return c.json({
        name: "HomeHub",
        description: "Self-hosted personal infrastructure",
        version: "0.1.0",
        status: "running",
    });
});

// Health endpoint
app.get("/api/health", (c) => {
    return c.json({
        status: "healthy",
        service: "homehub-server",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
    });
});

// Start server
async function main(): Promise<void> {
    initializeDatabase();
    await initializeStorage();
    purgeExpiredSessions();

    const server = serve(
        {
            fetch: app.fetch,
            port: PORT,
            hostname: HOST,
        },
        (info) => {
            console.log(`
  HomeHub Server
  -----------------------------
  Status:  Running
  Host:    ${info.address}
  Port:    ${info.port}
  API:     http://localhost:${info.port}/api/health
  -----------------------------
            `);
            startMetricsCollector();
        },
    );

    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        stopMetricsCollector();
        server.close(() => {
            closeDatabase();
            process.exit(0);
        });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((error) => {
    console.error("[server] Startup failed:", error);
    closeDatabase();
    process.exitCode = 1;
});
