import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { getDatabase } from "../../database/db.js";

export type MediaKind = "video" | "audio" | "image" | "pdf" | "text" | "unsupported";

export interface MediaMetadata {
    id: string;
    relativePath: string;
    name: string;
    mimeType: string;
    kind: MediaKind;
    size: number;
    modifiedAt: string;
}

const MIME_TYPES: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    webm: "video/webm",
    ogv: "video/ogg",
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
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    ipynb: "application/x-ipynb+json",
};

export function getFileMetadata(name: string, mimeHint?: string): {
    mimeType: string;
    kind: MediaKind;
} {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = mimeHint || MIME_TYPES[extension] || "application/octet-stream";

    let kind: MediaKind = "unsupported";
    if (mimeType.startsWith("video/")) kind = "video";
    else if (mimeType.startsWith("audio/")) kind = "audio";
    else if (mimeType.startsWith("image/")) kind = "image";
    else if (mimeType === "application/pdf") kind = "pdf";
    else if (
        mimeType.startsWith("text/") ||
        [
            "application/json",
            "application/xml",
            "application/x-ipynb+json",
        ].includes(mimeType)
    ) kind = "text";

    return { mimeType, kind };
}

export function createMediaId(relativePath: string): string {
    return createHash("sha256")
        .update(relativePath.replace(/\\/g, "/"), "utf8")
        .digest("hex")
        .slice(0, 24);
}

export function registerMedia(
    relativePath: string,
    name: string,
    mimeType: string,
    kind: MediaKind,
    size: number,
    modifiedAt: string,
    database: Database.Database = getDatabase(),
): MediaMetadata {
    const id = createMediaId(relativePath);
    const now = new Date().toISOString();
    database.prepare(`
        INSERT INTO media_items (
            id, relative_path, name, mime_type, kind, size, modified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(relative_path) DO UPDATE SET
            id = excluded.id,
            name = excluded.name,
            mime_type = excluded.mime_type,
            kind = excluded.kind,
            size = excluded.size,
            modified_at = excluded.modified_at,
            updated_at = excluded.updated_at
    `).run(id, relativePath, name, mimeType, kind, size, modifiedAt, now, now);

    return { id, relativePath, name, mimeType, kind, size, modifiedAt };
}

interface MediaRow {
    id: string;
    relative_path: string;
    name: string;
    mime_type: string;
    kind: MediaKind;
    size: number;
    modified_at: string;
}

export function findMedia(id: string, database: Database.Database = getDatabase()) {
    if (!/^[a-f0-9]{24}$/i.test(id)) return null;
    let row: MediaRow | undefined;
    try {
        row = database.prepare(`
            SELECT id, relative_path, name, mime_type, kind, size, modified_at
            FROM media_items WHERE id = ? LIMIT 1
        `).get(id) as MediaRow | undefined;
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "SQLITE_ERROR"
        ) {
            return null;
        }
        throw error;
    }

    if (!row) return null;
    return {
        id: row.id,
        relativePath: row.relative_path,
        name: row.name,
        mimeType: row.mime_type,
        kind: row.kind,
        size: row.size,
        modifiedAt: row.modified_at,
    } satisfies MediaMetadata;
}
