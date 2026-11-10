import {
    mkdir,
    readdir,
    realpath,
    lstat,
    rename as renameFs,
    unlink,
    rmdir,
} from "node:fs/promises";

import path from "node:path";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
        public readonly statusCode: ContentfulStatusCode,
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

function validateEntryName(name: string): string {
    const trimmed = name.trim();

    if (
        !trimmed ||
        trimmed === "." ||
        trimmed === ".." ||
        trimmed.includes("\0") ||
        /[<>:"/\\|?*]/.test(trimmed) ||
        /[. ]$/.test(trimmed) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(trimmed)
    ) {
        throw new FilesystemError("Invalid file or directory name", 400);
    }

    if (trimmed.length > 255) {
        throw new FilesystemError("Name is too long", 400);
    }

    return trimmed;
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

async function resolveSafeEntry(relativePath: string): Promise<string> {
    const normalized = relativePath.replace(/\\/g, "/");

    if (!normalized || normalized.endsWith("/")) {
        throw new FilesystemError("Invalid entry path", 400);
    }

    const parentRelative = path.posix.dirname(normalized);
    const entryName = validateEntryName(path.posix.basename(normalized));

    const parentPath = await resolveSafePath(
        parentRelative === "." ? "" : parentRelative,
    );

    const entryPath = path.join(parentPath, entryName);

    let stats;

    try {
        stats = await lstat(entryPath);
    } catch {
        throw new FilesystemError("Entry not found", 404);
    }

    // Do not operate on symbolic links or junctions.
    if (stats.isSymbolicLink()) {
        throw new FilesystemError("Symbolic links are not supported", 403);
    }

    const actualPath = await realpath(entryPath);

    if (!isInsideRoot(actualPath)) {
        throw new FilesystemError("Access denied", 403);
    }

    return entryPath;
}

export async function createDirectory(
    parentRelativePath: string,
    name: string,
): Promise<void> {
    const parentPath = await resolveSafePath(parentRelativePath);
    const safeName = validateEntryName(name);

    const targetPath = path.join(parentPath, safeName);

    try {
        await mkdir(targetPath);
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST"
        ) {
            throw new FilesystemError("An entry with this name already exists", 409);
        }

        throw error;
    }
}

export async function renameEntry(
    relativePath: string,
    newName: string,
): Promise<void> {
    const sourcePath = await resolveSafeEntry(relativePath);
    const safeName = validateEntryName(newName);

    if (path.basename(sourcePath) === safeName) {
        return;
    }

    const targetPath = path.join(path.dirname(sourcePath), safeName);

    try {
        await lstat(targetPath);

        throw new FilesystemError(
            "An entry with this name already exists",
            409,
        );
    } catch (error) {
        if (error instanceof FilesystemError) {
            throw error;
        }

        if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "ENOENT"
        ) {
            throw error;
        }
    }

    await renameFs(sourcePath, targetPath);
}

export async function deleteEntry(
    relativePath: string,
): Promise<void> {
    const targetPath = await resolveSafeEntry(relativePath);

    const stats = await lstat(targetPath);

    if (stats.isDirectory()) {
        try {
            // Only empty directories can be deleted.
            await rmdir(targetPath);
        } catch (error) {
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "ENOTEMPTY"
            ) {
                throw new FilesystemError(
                    "Directory is not empty",
                    409,
                );
            }

            throw error;
        }

        return;
    }

    if (stats.isFile()) {
        await unlink(targetPath);
        return;
    }

    throw new FilesystemError("Unsupported filesystem entry", 400);
}
