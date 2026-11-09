import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { systemRoutes } from "./modules/system/system.routes.js";
import { startMetricsCollector } from "./modules/system/metrics.store.js";
import { initializeStorage } from "./modules/filesystem/filesystem.service.js";

const app = new Hono();

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

app.route("/api/system", systemRoutes);

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
serve(
    {
        fetch: app.fetch,
        port: PORT,
        hostname: HOST,
    },
    async (info) => {
        await initializeStorage();

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
    }
);
