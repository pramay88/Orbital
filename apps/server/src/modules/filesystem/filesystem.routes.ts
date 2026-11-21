import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import {
    FilesystemError,
    listDirectory,
    createDirectory,
    renameEntry,
    deleteEntry,
    openDownloadFile,
    uploadFile,
    MAX_UPLOAD_BYTES,
} from "./filesystem.service.js";
import { Readable } from "node:stream";
import { bodyLimit } from "hono/body-limit";


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

filesystemRoutes.get("/download", async (c) => {
    let file: Awaited<ReturnType<typeof openDownloadFile>> | undefined;

    try {
        const parsed = pathSchema.safeParse({
            path: c.req.query("path"),
        });

        if (!parsed.success || !parsed.data.path) {
            return c.json(
                { error: "A valid file path is required" },
                400,
            );
        }

        file = await openDownloadFile(parsed.data.path);

        const range = c.req.header("range");
        let status = 200;
        let start = 0;
        let end = file.size - 1;

        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());

            if (!match) {
                await file.handle.close();
                return c.json({ error: "Invalid range" }, 416);
            }

            if (match[1] === "" && match[2] !== "") {
                const suffixLength = Number(match[2]);
                if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
                    await file.handle.close();
                    return c.json({ error: "Invalid range" }, 416);
                }
                start = Math.max(file.size - suffixLength, 0);
            } else {
                start = Number(match[1]);
                end = match[2] ? Number(match[2]) : file.size - 1;
            }

            if (
                file.size === 0 ||
                start >= file.size ||
                end < start
            ) {
                await file.handle.close();
                c.header("Content-Range", `bytes */${file.size}`);
                return c.json({ error: "Requested range not satisfiable" }, 416);
            }

            end = Math.min(end, file.size - 1);
            status = 206;
        }

        const length = end - start + 1;

        const nodeStream = file.handle.createReadStream({
            autoClose: true,
            start,
            end,
        });

        const webStream = Readable.toWeb(
            nodeStream,
        ) as unknown as globalThis.ReadableStream;

        const headers = new Headers();

        const preview = c.req.query("preview") === "1";
        const extension = file.name.split(".").pop()?.toLowerCase();
        const contentTypes: Record<string, string> = {
            mp4: "video/mp4",
            webm: "video/webm",
            ogv: "video/ogg",
            mov: "video/quicktime",
            mp3: "audio/mpeg",
            m4a: "audio/mp4",
            wav: "audio/wav",
            ogg: "audio/ogg",
            flac: "audio/flac",
            aac: "audio/aac",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            webp: "image/webp",
            avif: "image/avif",
            pdf: "application/pdf",
            txt: "text/plain; charset=utf-8",
            md: "text/plain; charset=utf-8",
            csv: "text/csv; charset=utf-8",
            json: "application/json",
            xml: "application/xml",
        };
        headers.set("Content-Type", preview
            ? (contentTypes[extension ?? ""] ?? "application/octet-stream")
            : "application/octet-stream");
        headers.set("Content-Length", String(length));
        headers.set("Accept-Ranges", "bytes");
        if (status === 206) {
            headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
        }
        if (preview) {
            headers.set(
                "Content-Disposition",
                `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            );
        } else {
            headers.set(
                "Content-Disposition",
                `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            );
        }
        headers.set("X-Content-Type-Options", "nosniff");

        return new Response(webStream, {
            status,
            headers,
        });
    } catch (error) {
        // If streaming has not started, close the opened handle.
        if (file) {
            await file.handle.close().catch(() => { });
        }

        return handleFilesystemError(error, c);
    }
});

filesystemRoutes.post(
    "/upload",
    bodyLimit({
        maxSize: MAX_UPLOAD_BYTES,
    }),
    async (c) => {
        try {
            const form = await c.req.parseBody();

            const file = form["file"];
            const parentPath = form["path"];

            if (!(file instanceof File)) {
                return c.json(
                    { error: "A file is required" },
                    400,
                );
            }

            if (
                parentPath !== undefined &&
                typeof parentPath !== "string"
            ) {
                return c.json(
                    { error: "Invalid destination path" },
                    400,
                );
            }

            if (file.size > MAX_UPLOAD_BYTES) {
                return c.json(
                    { error: "Maximum upload size is 50 MB" },
                    413,
                );
            }

            const content = Buffer.from(
                await file.arrayBuffer(),
            );

            const result = await uploadFile(
                parentPath ?? "",
                file.name,
                content,
            );

            return c.json(
                {
                    success: true,
                    message: "File uploaded",
                    data: result,
                },
                201,
            );
        } catch (error) {
            return handleFilesystemError(error, c);
        }
    },
);