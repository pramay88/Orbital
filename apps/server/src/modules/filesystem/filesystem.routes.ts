import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import {
    FilesystemError,
    listDirectory,
} from "./filesystem.service.js";

export const filesystemRoutes = new Hono();

const pathSchema = z.object({
    path: z.string().max(1024).optional().default(""),
});

// Centralized error handling.
function handleFilesystemError(error: unknown, c: Context) {
    if (error instanceof FilesystemError) {
        return c.json(
            {
                error: error.message,
            },
            error.statusCode,
        );
    }

    console.error("[filesystem] Unexpected error:", error);

    return c.json(
        {
            error: "Internal filesystem error",
        },
        500,
    );
}

// GET /api/files
// List the storage root.
filesystemRoutes.get("/", async (c) => {
    try {
        const result = await listDirectory();

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        return handleFilesystemError(error, c);
    }
});

// GET /api/files/list?path=Documents
// List a specific directory.
filesystemRoutes.get("/list", async (c) => {
    try {
        const parsed = pathSchema.safeParse({
            path: c.req.query("path"),
        });

        if (!parsed.success) {
            return c.json(
                {
                    error: "Invalid query parameters",
                    details: parsed.error.flatten(),
                },
                400,
            );
        }

        const result = await listDirectory(parsed.data.path);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        return handleFilesystemError(error, c);
    }
});
