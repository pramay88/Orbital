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

    it("should create a directory", async () => {
        await filesystem.createDirectory("Documents", "Projects");

        const result = await filesystem.listDirectory("Documents");

        expect(
            result.entries.some(
                (entry) => entry.name === "Projects",
            ),
        ).toBe(true);
    });

    it("should reject duplicate directory creation", async () => {
        await filesystem.createDirectory("Documents", "Duplicate");

        await expect(
            filesystem.createDirectory("Documents", "Duplicate"),
        ).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("should rename a file", async () => {
        await writeFile(
            path.join(storageRoot, "Documents", "old-name.txt"),
            "Rename test",
        );

        await filesystem.renameEntry(
            "Documents/old-name.txt",
            "new-name.txt",
        );

        const result = await filesystem.listDirectory("Documents");

        expect(
            result.entries.some(
                (entry) => entry.name === "new-name.txt",
            ),
        ).toBe(true);
    });

    it("should delete a file", async () => {
        await writeFile(
            path.join(storageRoot, "Documents", "delete-me.txt"),
            "Delete test",
        );

        await filesystem.deleteEntry("Documents/delete-me.txt");

        const result = await filesystem.listDirectory("Documents");

        expect(
            result.entries.some(
                (entry) => entry.name === "delete-me.txt",
            ),
        ).toBe(false);
    });

    it("should reject deletion of non-empty directories", async () => {
        await mkdir(
            path.join(storageRoot, "Documents", "NonEmpty"),
        );

        await writeFile(
            path.join(storageRoot, "Documents", "NonEmpty", "keep.txt"),
            "Keep this file",
        );

        await expect(
            filesystem.deleteEntry("Documents/NonEmpty"),
        ).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("should upload a file", async () => {
        const content = Buffer.from("HomeHub upload test");

        const result = await filesystem.uploadFile(
            "Documents",
            "uploaded.txt",
            content,
        );

        expect(result).toMatchObject({
            name: "uploaded.txt",
            path: "Documents/uploaded.txt",
            type: "file",
            size: content.length,
        });
    });

    it("should reject duplicate uploads", async () => {
        const content = Buffer.from("Duplicate upload test");

        await filesystem.uploadFile(
            "Documents",
            "duplicate.txt",
            content,
        );

        await expect(
            filesystem.uploadFile(
                "Documents",
                "duplicate.txt",
                content,
            ),
        ).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("should reject junctions inside nested directories", async () => {
        const linkPath = path.join(
            storageRoot,
            "Documents",
            "outside-link",
        );

        await symlink(outsideRoot, linkPath, "junction");

        try {
            await expect(
                filesystem.listDirectory("Documents/outside-link"),
            ).rejects.toMatchObject({
                statusCode: 403,
            });
        } finally {
            await rm(linkPath, { recursive: true, force: true });
        }
    });

    it("should reject Windows alternate data stream paths", async () => {
        await expect(
            filesystem.listDirectory("Documents/file.txt:stream"),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it("should reject Windows reserved filenames", async () => {
        await expect(
            filesystem.createDirectory("Documents", "CON"),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it("should reject filenames ending with a dot", async () => {
        await expect(
            filesystem.createDirectory("Documents", "Reports."),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it("should reject renaming to an existing filename", async () => {
        await writeFile(
            path.join(storageRoot, "Documents", "source.txt"),
            "Original source",
        );

        await writeFile(
            path.join(storageRoot, "Documents", "destination.txt"),
            "Original destination",
        );

        await expect(
            filesystem.renameEntry(
                "Documents/source.txt",
                "destination.txt",
            ),
        ).rejects.toMatchObject({
            statusCode: 409,
        });

        const result = await filesystem.listDirectory("Documents");

        expect(
            result.entries.some((entry) => entry.name === "source.txt"),
        ).toBe(true);

        expect(
            result.entries.some((entry) => entry.name === "destination.txt"),
        ).toBe(true);
    });

    it("should delete an empty directory", async () => {
        await mkdir(
            path.join(storageRoot, "Documents", "EmptyDirectory"),
        );

        await filesystem.deleteEntry("Documents/EmptyDirectory");

        const result = await filesystem.listDirectory("Documents");

        expect(
            result.entries.some(
                (entry) => entry.name === "EmptyDirectory",
            ),
        ).toBe(false);
    });

    it("should open a file safely for downloading", async () => {
        const download = await filesystem.openDownloadFile(
            "Documents/report.txt",
        );

        try {
            expect(download.name).toBe("report.txt");

            expect(download.size).toBe(
                Buffer.byteLength("HomeHub filesystem test"),
            );

            const content = await download.handle.readFile("utf8");

            expect(content).toBe("HomeHub filesystem test");
        } finally {
            await download.handle.close();
        }
    });

    it("should safely handle concurrent uploads with the same filename", async () => {
        const firstContent = Buffer.from("First upload");
        const secondContent = Buffer.from("Second upload");

        const results = await Promise.allSettled([
            filesystem.uploadFile(
                "Documents",
                "concurrent.txt",
                firstContent,
            ),
            filesystem.uploadFile(
                "Documents",
                "concurrent.txt",
                secondContent,
            ),
        ]);

        const successful = results.filter(
            (result) => result.status === "fulfilled",
        );

        const failed = results.filter(
            (result) => result.status === "rejected",
        );

        expect(successful).toHaveLength(1);
        expect(failed).toHaveLength(1);

        if (failed[0].status === "rejected") {
            expect(failed[0].reason).toMatchObject({
                statusCode: 409,
            });
        }
    });
});
