import {
    mkdir,
    readdir,
    realpath,
    lstat,
    rename as renameFs,
    unlink,
    rmdir,
    open,
    type FileHandle,
} from "node:fs/promises";

import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
// Reject symbolic links and junctions in every path component.
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

    // Reject traversal and invalid Windows filename components.
    for (const segment of segments) {
        if (segment === "." || segment === "..") {
            throw new FilesystemError(
                "Path traversal is not allowed",
                403,
            );
        }

        // Validate each segment without silently changing its name.
        if (validateEntryName(segment) !== segment) {
            throw new FilesystemError("Invalid path", 400);
        }
    }

    let currentPath = root;

    // Inspect every component rather than resolving the entire path
    // through realpath() and potentially following an intermediate link.
    for (let i = 0; i < segments.length; i++) {
        currentPath = path.join(currentPath, segments[i]);

        let stats;

        try {
            stats = await lstat(currentPath);
        } catch (error) {
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                (error.code === "ENOENT" || error.code === "ENOTDIR")
            ) {
                throw new FilesystemError("Path not found", 404);
            }

            throw error;
        }

        // Reject symbolic links and Windows junctions.
        if (stats.isSymbolicLink()) {
            throw new FilesystemError(
                "Symbolic links are not supported",
                403,
            );
        }

        // Intermediate components must be directories.
        if (
            i < segments.length - 1 &&
            !stats.isDirectory()
        ) {
            throw new FilesystemError(
                "Path component is not a directory",
                400,
            );
        }

        // Verify the actual resolved location remains inside storage.
        const actualPath = await realpath(currentPath);

        if (!isInsideRoot(actualPath)) {
            throw new FilesystemError("Access denied", 403);
        }

        currentPath = actualPath;
    }

    return currentPath;
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
    return withMutationLock(async () => {

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
    });
}

export async function renameEntry(
    relativePath: string,
    newName: string,
): Promise<void> {
    return withMutationLock(async () => {
        const sourcePath = await resolveSafeEntry(relativePath);
        const safeName = validateEntryName(newName);

        const currentName = path.basename(sourcePath);

        if (
            process.platform === "win32"
                ? currentName.toLowerCase() === safeName.toLowerCase()
                : currentName === safeName
        ) {
            return;
        }

        const targetPath = path.join(
            path.dirname(sourcePath),
            safeName,
        );

        // Check destination before attempting the rename.
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

        try {
            await renameFs(sourcePath, targetPath);
        } catch (error) {
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                ["EEXIST", "ENOTEMPTY"].includes(String(error.code))
            ) {
                throw new FilesystemError(
                    "An entry with this name already exists",
                    409,
                );
            }

            throw error;
        }
    });
}

export async function deleteEntry(
    relativePath: string,
): Promise<void> {
    return withMutationLock(async () => {
        const targetPath = await resolveSafeEntry(relativePath);

        const stats = await lstat(targetPath);

        // Do not follow or delete a symbolic link.
        if (stats.isSymbolicLink()) {
            throw new FilesystemError(
                "Symbolic links are not supported",
                403,
            );
        }

        if (stats.isDirectory()) {
            try {
                // Only empty directories can be deleted.
                await rmdir(targetPath);
            } catch (error) {
                if (
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    ["ENOTEMPTY", "EEXIST"].includes(String(error.code))
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

        throw new FilesystemError(
            "Unsupported filesystem entry",
            400,
        );
    });
}

export interface DownloadFile {
    handle: FileHandle;
    name: string;
    size: number;
}

export async function openDownloadFile(
    relativePath: string,
): Promise<DownloadFile> {
    const targetPath = await resolveSafeEntry(relativePath);

    let handle: FileHandle;

    try {
        // Open the file exactly once.
        handle = await open(targetPath, "r");
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            throw new FilesystemError("File not found", 404);
        }

        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EISDIR"
        ) {
            throw new FilesystemError(
                "Only files can be downloaded",
                400,
            );
        }

        throw error;
    }

    try {
        // Inspect the opened file, not the pathname.
        const stats = await handle.stat();

        if (!stats.isFile()) {
            throw new FilesystemError(
                "Only files can be downloaded",
                400,
            );
        }

        return {
            handle,
            name: path.basename(targetPath),
            size: stats.size,
        };
    } catch (error) {
        await handle.close().catch(() => { });
        throw error;
    }
}

export async function uploadFile(
    parentRelativePath: string,
    name: string,
    content: Buffer,
): Promise<FileEntry> {
    return withMutationLock(async () => {
        if (content.length > MAX_UPLOAD_BYTES) {
            throw new FilesystemError(
                "Maximum upload size is 50 MB",
                413,
            );
        }

        const parentPath = await resolveSafePath(parentRelativePath);
        const safeName = validateEntryName(name);
        const targetPath = path.join(parentPath, safeName);

        let handle: FileHandle | undefined;
        let created = false;

        try {
            // Create exclusively. Never overwrite an existing entry.
            handle = await open(targetPath, "wx");
            created = true;

            await handle.writeFile(content);

            const stats = await handle.stat();

            await handle.close();
            handle = undefined;

            return {
                name: safeName,
                path: path.relative(
                    getRoot(),
                    targetPath,
                ).split(path.sep).join("/"),
                type: "file",
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
            };
        } catch (error) {
            if (handle) {
                await handle.close().catch(() => { });
                handle = undefined;
            }

            // Remove only the file created by this upload.
            if (created) {
                await unlink(targetPath).catch(() => { });
            }

            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "EEXIST"
            ) {
                throw new FilesystemError(
                    "An entry with this name already exists",
                    409,
                );
            }

            throw error;
        }
    });
}

// Serialize filesystem mutations initiated by this process.
// This prevents concurrent HomeHub requests from interfering
// with one another during create, rename, delete, and upload.
let mutationQueue: Promise<void> = Promise.resolve();

async function withMutationLock<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const previous = mutationQueue;

    let release!: () => void;

    mutationQueue = new Promise<void>((resolve) => {
        release = resolve;
    });

    await previous;

    try {
        return await operation();
    } finally {
        release();
    }
}
