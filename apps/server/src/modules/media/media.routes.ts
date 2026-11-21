import { Hono } from "hono";
import type { Context } from "hono";
import { Readable } from "node:stream";
import {
    FilesystemError,
    openDownloadFile,
} from "../filesystem/filesystem.service.js";
import { findMedia } from "./media.repository.js";

export const mediaRoutes = new Hono();

function handleMediaError(error: unknown, c: Context) {
    if (error instanceof FilesystemError) {
        return c.json({ error: error.message }, error.statusCode);
    }
    console.error("[media] Unexpected error:", error);
    return c.json({ error: "Unable to open media" }, 500);
}

mediaRoutes.get("/:mediaId", async (c) => {
    const item = findMedia(c.req.param("mediaId"));
    if (!item) {
        return c.json({ error: "Media not found" }, 404);
    }

    try {
        const file = await openDownloadFile(item.relativePath);
        await file.handle.close();
    } catch (error) {
        return handleMediaError(error, c);
    }

    return c.json({
        success: true,
        data: {
            id: item.id,
            name: item.name,
            kind: item.kind,
            mimeType: item.mimeType,
            size: item.size,
            modifiedAt: item.modifiedAt,
            streamUrl: `/api/media/${item.id}/stream`,
        },
    });
});

mediaRoutes.get("/:mediaId/stream", async (c) => {
    const item = findMedia(c.req.param("mediaId"));
    if (!item) {
        return c.json({ error: "Media not found" }, 404);
    }

    let file: Awaited<ReturnType<typeof openDownloadFile>> | undefined;
    try {
        file = await openDownloadFile(item.relativePath);

        let status = 200;
        let start = 0;
        let end = file.size - 1;
        const range = c.req.header("range");

        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
            if (!match) {
                await file.handle.close();
                c.header("Content-Range", `bytes */${file.size}`);
                return c.json({ error: "Invalid range" }, 416);
            }

            if (match[1] === "") {
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

            if (file.size === 0 || start >= file.size || end < start) {
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
        const webStream = Readable.toWeb(nodeStream) as unknown as globalThis.ReadableStream;
        const headers = new Headers();
        headers.set("Content-Type", item.mimeType);
        headers.set("Content-Length", String(length));
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "private, max-age=0");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`);
        if (status === 206) {
            headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
        }

        return new Response(webStream, { status, headers });
    } catch (error) {
        if (file) await file.handle.close().catch(() => {});
        return handleMediaError(error, c);
    }
});
