import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";

import {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    rm,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

describe("Filesystem API", () => {
    let storageRoot: string;
    let app: Hono;

    const originalStorageDir = process.env.HOMEHUB_STORAGE_DIR;

    beforeAll(async () => {
        storageRoot = await mkdtemp(
            path.join(os.tmpdir(), "homehub-api-test-"),
        );

        process.env.HOMEHUB_STORAGE_DIR = storageRoot;

        vi.resetModules();

        const { filesystemRoutes } = await import(
            "./filesystem.routes.js"
        );

        const { initializeStorage } = await import(
            "./filesystem.service.js"
        );

        await initializeStorage();

        app = new Hono();
        app.route("/api/files", filesystemRoutes);

        await mkdir(path.join(storageRoot, "Documents"));

        await writeFile(
            path.join(storageRoot, "Documents", "hello.txt"),
            "Hello HomeHub",
        );
    });

    afterAll(async () => {
        if (originalStorageDir === undefined) {
            delete process.env.HOMEHUB_STORAGE_DIR;
        } else {
            process.env.HOMEHUB_STORAGE_DIR = originalStorageDir;
        }

        await rm(storageRoot, { recursive: true, force: true });
    });

    it("should return the storage root", async () => {
        const response = await app.request("/api/files");

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.data.entries).toBeDefined();
    });

    it("should list a nested directory", async () => {
        const response = await app.request(
            "/api/files/list?path=Documents",
        );

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(
            body.data.entries.some(
                (entry: { name: string }) => entry.name === "hello.txt",
            ),
        ).toBe(true);
    });

    it("should reject path traversal", async () => {
        const response = await app.request(
            "/api/files/list?path=..%2F..%2FWindows",
        );

        expect(response.status).toBe(403);
    });

    it("should create a directory", async () => {
        const response = await app.request(
            "/api/files/directory",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    parentPath: "Documents",
                    name: "Projects",
                }),
            },
        );

        expect(response.status).toBe(201);
    });

    it("should reject duplicate directory creation", async () => {
        const response = await app.request(
            "/api/files/directory",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    parentPath: "Documents",
                    name: "Projects",
                }),
            },
        );

        expect(response.status).toBe(409);
    });

    it("should rename a file", async () => {
        const response = await app.request(
            "/api/files/rename",
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    path: "Documents/hello.txt",
                    newName: "welcome.txt",
                }),
            },
        );

        expect(response.status).toBe(200);

        const content = await readFile(
            path.join(storageRoot, "Documents", "welcome.txt"),
            "utf8",
        );

        expect(content).toBe("Hello HomeHub");
    });

    it("should upload a file", async () => {
        const form = new FormData();

        form.append(
            "file",
            new Blob(["Uploaded through API"]),
            "upload.txt",
        );

        form.append("path", "Documents");

        const response = await app.request(
            "/api/files/upload",
            {
                method: "POST",
                body: form,
            },
        );

        expect(response.status).toBe(201);

        const content = await readFile(
            path.join(storageRoot, "Documents", "upload.txt"),
            "utf8",
        );

        expect(content).toBe("Uploaded through API");
    });

    it("should download a file", async () => {
        const response = await app.request(
            "/api/files/download?path=Documents%2Fwelcome.txt",
        );

        expect(response.status).toBe(200);

        expect(
            response.headers.get("Content-Disposition"),
        ).toContain("welcome.txt");

        const content = await response.text();

        expect(content).toBe("Hello HomeHub");
    });

    it("should support HTTP byte ranges", async () => {
        const response = await app.request(
            "/api/files/download?path=Documents%2Fwelcome.txt",
            {
                headers: {
                    Range: "bytes=0-4",
                },
            },
        );

        expect(response.status).toBe(206);
        expect(response.headers.get("Accept-Ranges")).toBe("bytes");
        expect(response.headers.get("Content-Range")).toBe("bytes 0-4/13");
        expect(await response.text()).toBe("Hello");
    });

    it("should reject duplicate uploads", async () => {
        const form = new FormData();

        form.append(
            "file",
            new Blob(["Duplicate"]),
            "upload.txt",
        );

        form.append("path", "Documents");

        const response = await app.request(
            "/api/files/upload",
            {
                method: "POST",
                body: form,
            },
        );

        expect(response.status).toBe(409);
    });

    it("should delete a file", async () => {
        const response = await app.request(
            "/api/files?path=Documents%2Fupload.txt",
            {
                method: "DELETE",
            },
        );

        expect(response.status).toBe(200);
    });

    it("should return 404 for missing directories", async () => {
        const response = await app.request(
            "/api/files/list?path=Unknown",
        );

        expect(response.status).toBe(404);
    });
});
