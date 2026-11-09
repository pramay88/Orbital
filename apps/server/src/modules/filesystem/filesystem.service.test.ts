import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import {
    mkdtemp,
    mkdir,
    writeFile,
    symlink,
    rm,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

describe("Filesystem service", () => {
    let storageRoot: string;
    let outsideRoot: string;

    let filesystem: typeof import("./filesystem.service.js");

    const originalStorageDir = process.env.HOMEHUB_STORAGE_DIR;

    beforeAll(async () => {
        // Create isolated temporary directories.
        storageRoot = await mkdtemp(
            path.join(os.tmpdir(), "homehub-storage-test-"),
        );

        outsideRoot = await mkdtemp(
            path.join(os.tmpdir(), "homehub-outside-test-"),
        );

        // Configure the service before importing it.
        process.env.HOMEHUB_STORAGE_DIR = storageRoot;

        vi.resetModules();

        filesystem = await import("./filesystem.service.js");

        // Prepare test files.
        await mkdir(path.join(storageRoot, "Documents"));
        await mkdir(path.join(storageRoot, "Images"));

        await writeFile(
            path.join(storageRoot, "Documents", "report.txt"),
            "HomeHub filesystem test",
        );

        await writeFile(
            path.join(storageRoot, "readme.txt"),
            "Storage root",
        );

        await writeFile(
            path.join(outsideRoot, "secret.txt"),
            "This file must remain inaccessible",
        );

        await filesystem.initializeStorage();
    });

    afterAll(async () => {
        // Restore the original environment.
        if (originalStorageDir === undefined) {
            delete process.env.HOMEHUB_STORAGE_DIR;
        } else {
            process.env.HOMEHUB_STORAGE_DIR = originalStorageDir;
        }

        // Remove temporary test directories.
        await rm(storageRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    });

    it("should list the storage root", async () => {
        const result = await filesystem.listDirectory();

        expect(result.path).toBe("");

        expect(result.entries.map((entry) => entry.name)).toEqual([
            "Documents",
            "Images",
            "readme.txt",
        ]);
    });

    it("should list a nested directory", async () => {
        const result = await filesystem.listDirectory("Documents");

        expect(result.entries).toHaveLength(1);

        expect(result.entries[0]).toMatchObject({
            name: "report.txt",
            path: "Documents/report.txt",
            type: "file",
        });

        expect(result.entries[0].size).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(result.entries[0].modifiedAt))).toBe(false);
    });

    it("should reject path traversal", async () => {
        await expect(
            filesystem.listDirectory("../"),
        ).rejects.toMatchObject({
            statusCode: 403,
        });
    });

    it("should reject absolute paths", async () => {
        await expect(
            filesystem.listDirectory(storageRoot),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it("should reject nonexistent paths", async () => {
        await expect(
            filesystem.listDirectory("does-not-exist"),
        ).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it("should reject files when a directory is expected", async () => {
        await expect(
            filesystem.listDirectory("readme.txt"),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it("should reject symbolic links that point outside storage", async () => {
        const linkPath = path.join(storageRoot, "outside-link");

        // A directory junction works on Windows without requiring
        // the same privileges as a directory symbolic link.
        await symlink(outsideRoot, linkPath, "junction");

        try {
            await expect(
                filesystem.listDirectory("outside-link"),
            ).rejects.toMatchObject({
                statusCode: 403,
            });
        } finally {
            await rm(linkPath, { recursive: true, force: true });
        }
    });
});
