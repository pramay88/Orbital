import { Hono } from "hono";
import { getSystemOverview } from "./system.service.js";
import { getLatestMetrics, getMetricsHistory, } from "./metrics.store.js";

export const systemRoutes = new Hono();

systemRoutes.get("/overview", async (c) => {
    try {
        const overview = await getSystemOverview();

        return c.json({
            success: true,
            data: overview,
        });
    } catch (error) {
        console.error("System metrics collection failed:", error);

        return c.json(
            {
                success: false,
                error: "Unable to collect system information",
            },
            503
        );
    }
});

systemRoutes.get("/metrics", (c) => {
    const metrics = getLatestMetrics();

    if (!metrics) {
        return c.json(
            {
                success: false,
                error: "Metrics are not available yet",
            },
            503
        );
    }

    return c.json({
        success: true,
        data: metrics,
    });
});

systemRoutes.get("/history", (c) => {
    return c.json({
        success: true,
        data: getMetricsHistory(),
    });
});