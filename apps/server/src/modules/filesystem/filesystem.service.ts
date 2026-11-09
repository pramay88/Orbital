import {
    mkdir,
    readdir,
    realpath,
    lstat,
} from "node:fs/promises";

import path from "node:path";

import type {
    DirectoryListing,
    FileEntry,
} from "./filesystem.types.js";

// Dedicated storage directory.
// Can be overridden using HOMEHUB_STORAGE_DIR.
const STORAGE_ROOT =
    process.env.HOMEHUB_STORAGE_DIR ??
    "D:\\HomeHub-Storage";

let resolvedRoot: string | null = null;

export class FilesystemError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "FilesystemError";
    }
}

// Initialize the storage directory.
export async function initializeStorage(): Promise<void> {
    await mkdir(STORAGE_ROOT, { recursive: true });

    resolvedRoot = await realpath(STORAGE_ROOT);

    console.log(`[filesystem] Storage initialized: ${resolvedRoot}`);
}

// Ensure the storage root has been initialized.
function getRoot(): string {
    if (!resolvedRoot) {
        throw new FilesystemError(
            "Filesystem service is not initialized",
            500,
        );
    }

    return resolvedRoot;
}

// Verify that a resolved path remains inside the storage root.
function isInsideRoot(target: string): boolean {
    const root = getRoot();
    const relative = path.relative(root, target);

    return (
        relative === "" ||
        (
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
        )
    );
}

// Resolve and validate a client-provided relative path.
async function resolveSafePath(
    relativePath: string,
): Promise<string> {
    const root = getRoot();

    if (
        relativePath.includes("\0") ||
        path.isAbsolute(relativePath) ||
        /^[a-zA-Z]:/.test(relativePath)
    ) {
        throw new FilesystemError("Invalid path", 400);
    }

    // Support both slash styles.
    const normalized = relativePath.replace(/\\/g, "/");

    const segments = normalized.split("/").filter(Boolean);

    if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new FilesystemError("Path traversal is not allowed", 403);
    }

    const target = path.resolve(root, ...segments);

    if (!isInsideRoot(target)) {
        throw new FilesystemError("Access denied", 403);
    }

    let actualPath: string;

    try {
        actualPath = await realpath(target);
    } catch {
        throw new FilesystemError("Path not found", 404);
    }

    // Prevent symbolic links from escaping the storage directory.
    if (!isInsideRoot(actualPath)) {
        throw new FilesystemError("Access denied", 403);
    }

    return actualPath;
}

// List files and directories at a relative path.
export async function listDirectory(
    relativePath = "",
): Promise<DirectoryListing> {
    const directoryPath = await resolveSafePath(relativePath);

    let directoryStat;

    try {
        directoryStat = await lstat(directoryPath);
    } catch {
        throw new FilesystemError("Directory not found", 404);
    }

    if (!directoryStat.isDirectory()) {
        throw new FilesystemError("Path is not a directory", 400);
    }

    const items = await readdir(directoryPath, {
        withFileTypes: true,
    });

    const entries: FileEntry[] = [];

    for (const item of items) {
        // Never follow or expose symbolic links.
        if (item.isSymbolicLink()) {
            continue;
        }

        const absolutePath = path.join(directoryPath, item.name);

        const stats = await lstat(absolutePath);

        if (stats.isSymbolicLink()) {
            continue;
        }

        const type = stats.isDirectory()
            ? "directory"
            : stats.isFile()
                ? "file"
                : null;

        if (!type) {
            continue;
        }

        const entryPath = path.relative(
            getRoot(),
            absolutePath,
        ).split(path.sep).join("/");

        entries.push({
            name: item.name,
            path: entryPath,
            type,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
        });
    }

    // Directories first, then files.
    entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
    });

    return {
        path: relativePath.replace(/\\/g, "/"),
        entries,
    };
}