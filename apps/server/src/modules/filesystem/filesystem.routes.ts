import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import {
    FilesystemError,
    listDirectory,
    createDirectory,
    renameEntry,
    deleteEntry,
} from "./filesystem.service.js";

export const filesystemRoutes = new Hono();

const pathSchema = z.object({
    path: z.string().max(1024).optional().default(""),
});

const createDirectorySchema = z.object({
    parentPath: z.string().max(1024).default(""),
    name: z.string().min(1).max(255),
});

const renameSchema = z.object({
    path: z.string().min(1).max(1024),
    newName: z.string().min(1).max(255),
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

filesystemRoutes.post("/directory", async (c) => {
    try {
        const body = await c.req.json().catch(() => null);
        const parsed = createDirectorySchema.safeParse(body);

        if (!parsed.success) {
            return c.json(
                {
                    error: "Invalid request body",
                    details: parsed.error.flatten(),
                },
                400,
            );
        }

        await createDirectory(
            parsed.data.parentPath,
            parsed.data.name,
        );

        return c.json({
            success: true,
            message: "Directory created",
        }, 201);
    } catch (error) {
        return handleFilesystemError(error, c);
    }
});

filesystemRoutes.patch("/rename", async (c) => {
    try {
        const body = await c.req.json().catch(() => null);
        const parsed = renameSchema.safeParse(body);

        if (!parsed.success) {
            return c.json(
                {
                    error: "Invalid request body",
                    details: parsed.error.flatten(),
                },
                400,
            );
        }

        await renameEntry(
            parsed.data.path,
            parsed.data.newName,
        );

        return c.json({
            success: true,
            message: "Entry renamed",
        });
    } catch (error) {
        return handleFilesystemError(error, c);
    }
});

filesystemRoutes.delete("/", async (c) => {
    try {
        const parsed = pathSchema.safeParse({
            path: c.req.query("path"),
        });

        if (!parsed.success || !parsed.data.path) {
            return c.json(
                {
                    error: "A valid path is required",
                },
                400,
            );
        }

        await deleteEntry(parsed.data.path);

        return c.json({
            success: true,
            message: "Entry deleted",
        });
    } catch (error) {
        return handleFilesystemError(error, c);
    }
});