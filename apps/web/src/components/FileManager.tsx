import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import "./FileManager.css";

type EntryType = "file" | "directory";

interface FileEntry {
    name: string;
    path: string;
    type: EntryType;
    size: number;
    modifiedAt: string;
}

interface DirectoryListing {
    path: string;
    entries: FileEntry[];
}

interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
    error?: string;
}

async function apiRequest<T>(
    url: string,
    options?: RequestInit,
): Promise<ApiResponse<T>> {
    const response = await fetch(url, options);

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Request failed");
    }

    return result as ApiResponse<T>;
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "--";
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );

    return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`;
}

function formatDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "--";

    return date.toLocaleString();
}

export default function FileManager({ readOnly = false }: { readOnly?: boolean }) {
    const [currentPath, setCurrentPath] = useState("");
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadDirectory = useCallback(async (directory: string) => {
        setLoading(true);
        setError("");
        setMessage("");

        try {
            const query = new URLSearchParams({ path: directory });

            const result = await apiRequest<DirectoryListing>(
                `/api/files/list?${query.toString()}`,
            );

            setEntries(result.data.entries);
            setCurrentPath(result.data.path);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load directory",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadDirectory("");
        }, 0);

        return () => window.clearTimeout(timer);
    }, [loadDirectory]);

    const navigateTo = (directory: string) => {
        void loadDirectory(directory);
    };

    const refresh = () => {
        void loadDirectory(currentPath);
    };

    const breadcrumbs = currentPath
        ? currentPath.split("/").filter(Boolean)
        : [];

    const getParentPath = () => {
        const segments = currentPath.split("/").filter(Boolean);
        segments.pop();
        return segments.join("/");
    };

    const handleUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const files = event.target.files;

        if (!files?.length) return;

        setUploading(true);
        setError("");
        setMessage("");

        try {
            for (const file of Array.from(files)) {
                const form = new FormData();

                form.append("file", file);
                form.append("path", currentPath);

                await apiRequest("/api/files/upload", {
                    method: "POST",
                    body: form,
                });
            }

            setMessage(
                `${files.length} file${files.length === 1 ? "" : "s"} uploaded successfully`,
            );

            await loadDirectory(currentPath);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Upload failed",
            );

            await loadDirectory(currentPath);
        } finally {
            setUploading(false);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleCreateFolder = async () => {
        const name = window.prompt("Enter folder name:");

        if (!name?.trim()) return;

        setError("");
        setMessage("");

        try {
            await apiRequest("/api/files/directory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    parentPath: currentPath,
                    name,
                }),
            });

            setMessage("Folder created successfully");
            await loadDirectory(currentPath);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not create folder",
            );
        }
    };

    const handleRename = async (entry: FileEntry) => {
        const newName = window.prompt(
            "Enter the new name:",
            entry.name,
        );

        if (!newName?.trim() || newName === entry.name) return;

        setError("");
        setMessage("");

        try {
            await apiRequest("/api/files/rename", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: entry.path,
                    newName,
                }),
            });

            setMessage("Renamed successfully");
            await loadDirectory(currentPath);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Rename failed",
            );
        }
    };

    const handleDelete = async (entry: FileEntry) => {
        const confirmed = window.confirm(
            `Delete "${entry.name}"? ${entry.type === "directory"
                ? "Only empty folders can be deleted."
                : "This action cannot be undone."
            }`,
        );

        if (!confirmed) return;

        setError("");
        setMessage("");

        try {
            const query = new URLSearchParams({ path: entry.path });

            await apiRequest(`/api/files?${query.toString()}`, {
                method: "DELETE",
            });

            setMessage("Deleted successfully");
            await loadDirectory(currentPath);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Delete failed",
            );
        }
    };

    const handleDownload = (entry: FileEntry) => {
        const query = new URLSearchParams({
            path: entry.path,
        });

        const anchor = document.createElement("a");

        anchor.href = `/api/files/download?${query.toString()}`;
        anchor.download = entry.name;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    return (
        <section className="file-manager">
            <div className="file-manager-header">
                <div>
                    <h2>File Manager</h2>
                    <p>Manage files stored on your HomeHub server</p>
                </div>

                <button
                    className="fm-button"
                    onClick={refresh}
                    disabled={loading}
                >
                    ↻ Refresh
                </button>
            </div>

            <div className="fm-toolbar">
                <div className="fm-toolbar-actions">
                    {!readOnly && (
                        <>
                            <button
                                className="fm-button fm-primary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? "Uploading..." : "↑ Upload"}
                            </button>

                            <button
                                className="fm-button"
                                onClick={handleCreateFolder}
                            >
                                + New folder
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                hidden
                                onChange={handleUpload}
                            />
                        </>
                    )}
                </div>

                <span className="fm-entry-count">
                    {entries.length} items
                </span>
            </div>

            <div className="fm-breadcrumbs">
                <button onClick={() => navigateTo("")}>
                    Home
                </button>

                {breadcrumbs.map((segment, index) => {
                    const target = breadcrumbs
                        .slice(0, index + 1)
                        .join("/");

                    return (
                        <span key={target} className="fm-breadcrumb-item">
                            <span className="fm-separator">/</span>

                            <button onClick={() => navigateTo(target)}>
                                {segment}
                            </button>
                        </span>
                    );
                })}
            </div>

            {error && (
                <div className="fm-alert fm-error">
                    {error}
                </div>
            )}

            {message && (
                <div className="fm-alert fm-success">
                    {message}
                </div>
            )}

            <div className="fm-table-wrapper">
                <table className="fm-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Modified</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {currentPath && !loading && (
                            <tr>
                                <td colSpan={5}>
                                    <button
                                        className="fm-entry-name fm-parent-entry"
                                        onClick={() => navigateTo(getParentPath())}
                                    >
                                        <span>↰</span>
                                        ..
                                    </button>
                                </td>
                            </tr>
                        )}

                        {loading ? (
                            <tr>
                                <td colSpan={5} className="fm-empty">
                                    Loading files...
                                </td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="fm-empty">
                                    This folder is empty.
                                    <br />
                                    Upload a file or create a folder to get started.
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.path}>
                                    <td>
                                        <button
                                            className="fm-entry-name"
                                            onClick={() => {
                                                if (entry.type === "directory") {
                                                    navigateTo(entry.path);
                                                }
                                            }}
                                            disabled={entry.type === "file"}
                                        >
                                            <span className="fm-entry-icon">
                                                {entry.type === "directory" ? "📁" : "📄"}
                                            </span>

                                            {entry.name}
                                        </button>
                                    </td>

                                    <td>{entry.type}</td>

                                    <td>
                                        {entry.type === "file"
                                            ? formatBytes(entry.size)
                                            : "--"}
                                    </td>

                                    <td>{formatDate(entry.modifiedAt)}</td>
                                    {!readOnly ? (
                                        <td>
                                            <div className="fm-row-actions">
                                                {entry.type === "file" && (
                                                    <button
                                                        className="fm-icon-button"
                                                        title="Download"
                                                        onClick={() => void handleDownload(entry)}
                                                    >
                                                        ↓
                                                    </button>
                                                )}

                                                <button
                                                    className="fm-icon-button"
                                                    title="Rename"
                                                    onClick={() => void handleRename(entry)}
                                                >
                                                    ✎
                                                </button>

                                                <button
                                                    className="fm-icon-button fm-danger"
                                                    title="Delete"
                                                    onClick={() => void handleDelete(entry)}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </td>
                                    ) : entry.type === "file" ? (
                                        <td>
                                            <button
                                                className="fm-icon-button"
                                                title="Download"
                                                onClick={() => void handleDownload(entry)}
                                            >
                                                ↓
                                            </button>
                                        </td>
                                    ) : (
                                        <td />
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="fm-footer">
                <span>
                    Storage location: HomeHub Storage
                </span>

                <span>
                    Current directory: /{currentPath}
                </span>
            </div>
        </section>
    );
}
