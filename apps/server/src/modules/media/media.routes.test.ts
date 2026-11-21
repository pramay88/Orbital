import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Media API", () => {
    let storageRoot: string;
    let dataRoot: string;
    let app: Hono;
    let mediaId: string;
    let pdfMediaId: string;
    let textMediaId: string;
    const originalStorageDir = process.env.HOMEHUB_STORAGE_DIR;
    const originalDataDir = process.env.HOMEHUB_DATA_DIR;

    beforeAll(async () => {
        storageRoot = await mkdtemp(path.join(os.tmpdir(), "orbital-media-storage-"));
        dataRoot = await mkdtemp(path.join(os.tmpdir(), "orbital-media-data-"));
        await mkdir(path.join(storageRoot, "Movies"));
        await mkdir(path.join(storageRoot, "Documents"));
        await writeFile(
            path.join(storageRoot, "Movies", "test.mp4"),
            Buffer.alloc(10),
        );
        await writeFile(
            path.join(storageRoot, "Documents", "guide.pdf"),
            Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(20)]),
        );
        await writeFile(
            path.join(storageRoot, "Documents", "notes.txt"),
            "Orbital document preview",
        );

        process.env.HOMEHUB_STORAGE_DIR = storageRoot;
        process.env.HOMEHUB_DATA_DIR = dataRoot;
        vi.resetModules();

        const db = await import("../../database/db.js");
        db.initializeDatabase();
        const filesystem = await import("../filesystem/filesystem.service.js");
        await filesystem.initializeStorage();
        const listing = await filesystem.listDirectory("Movies");
        mediaId = listing.entries.find((entry) => entry.name === "test.mp4")?.mediaId ?? "";
        const documents = await filesystem.listDirectory("Documents");
        pdfMediaId = documents.entries.find((entry) => entry.name === "guide.pdf")?.mediaId ?? "";
        textMediaId = documents.entries.find((entry) => entry.name === "notes.txt")?.mediaId ?? "";

        const { mediaRoutes } = await import("./media.routes.js");
        app = new Hono();
        app.route("/api/media", mediaRoutes);
    });

    afterAll(async () => {
        const db = await import("../../database/db.js");
        db.closeDatabase();
        if (originalStorageDir === undefined) delete process.env.HOMEHUB_STORAGE_DIR;
        else process.env.HOMEHUB_STORAGE_DIR = originalStorageDir;
        if (originalDataDir === undefined) delete process.env.HOMEHUB_DATA_DIR;
        else process.env.HOMEHUB_DATA_DIR = originalDataDir;
        await rm(storageRoot, { recursive: true, force: true });
        await rm(dataRoot, { recursive: true, force: true });
    });

    it("returns metadata without exposing the storage path", async () => {
        expect(mediaId).toMatch(/^[a-f0-9]{24}$/);
        const response = await app.request(`/api/media/${mediaId}`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toMatchObject({
            id: mediaId,
            name: "test.mp4",
            kind: "video",
            mimeType: "video/mp4",
            size: 10,
        });
        expect(JSON.stringify(body)).not.toContain("Movies/test.mp4");
    });

    it("rejects invalid media IDs", async () => {
        const response = await app.request("/api/media/not-an-id");
        expect(response.status).toBe(404);
    });

    it("supports HTTP range streaming", async () => {
        const response = await app.request(`/api/media/${mediaId}/stream`, {
            headers: { Range: "bytes=0-3" },
        });
        expect(response.status).toBe(206);
        expect(response.headers.get("Accept-Ranges")).toBe("bytes");
        expect(response.headers.get("Content-Range")).toBe("bytes 0-3/10");
        expect(response.headers.get("Content-Type")).toBe("video/mp4");
    });

    it("returns PDF metadata for preview routing", async () => {
        expect(pdfMediaId).toMatch(/^[a-f0-9]{24}$/);
        const response = await app.request(`/api/media/${pdfMediaId}`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toMatchObject({
            kind: "pdf",
            mimeType: "application/pdf",
        });
    });

    it("returns text metadata and streams text without buffering", async () => {
        expect(textMediaId).toMatch(/^[a-f0-9]{24}$/);
        const metadataResponse = await app.request(`/api/media/${textMediaId}`);
        expect(metadataResponse.status).toBe(200);
        const metadata = await metadataResponse.json();
        expect(metadata.data).toMatchObject({
            kind: "text",
            mimeType: "text/plain",
        });

        const streamResponse = await app.request(`/api/media/${textMediaId}/stream`);
        expect(streamResponse.status).toBe(200);
        expect(streamResponse.headers.get("Content-Type")).toBe("text/plain");
        expect(await streamResponse.text()).toBe("Orbital document preview");
    });
});
