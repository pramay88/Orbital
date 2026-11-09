import { Hono } from "hono";
import { getSystemOverview } from "./system.service.js";

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
