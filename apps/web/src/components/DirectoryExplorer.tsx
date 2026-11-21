import { useCallback, useEffect, useRef, useState } from "react";
import {
    ChevronRight,
    Download,
    File,
    Folder,
    Grid2X2,
    Heart,
    List,
    RefreshCw,
    Upload,
    FolderPlus,
    Pencil,
    Trash2,
} from "lucide-react";
import "./DirectoryExplorer.css";

interface Entry {
    name: string;
    path: string;
    type: "file" | "directory";
    size: number;
    modifiedAt: string;
    mediaId?: string;
    mimeType?: string;
    kind?: "video" | "audio" | "image" | "pdf" | "text" | "unsupported";
    browserCompatible?: boolean;
}

interface Props {
    readOnly?: boolean;
    section?: "Files" | "Media Library" | "Recent" | "Favorites";
    initialPath?: string;
}

const mediaExtensions = [
    "mp4", "webm", "ogv", "mov", "mp3", "m4a", "wav",
    "ogg", "flac", "aac", "jpg", "jpeg", "png", "gif", "webp", "avif",
];

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes < 0) return "--";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
}

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function readLocalList(key: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    } catch {
        return [];
    }
}

export default function DirectoryExplorer({
    readOnly = false,
    section = "Files",
    initialPath = "",
}: Props) {
    const [currentPath, setCurrentPath] = useState("");
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("name");
    const [view, setView] = useState<"list" | "grid">("list");
    const [recent, setRecent] = useState(() => readLocalList("orbital.recent"));
    const [favorites, setFavorites] = useState(() => readLocalList("orbital.favorites"));
    const uploadInput = useRef<HTMLInputElement>(null);

    const loadDirectory = useCallback(async (directory: string) => {
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch(
                `/api/files/list?${new URLSearchParams({ path: directory })}`,
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "Unable to load directory");
            setEntries(result.data.entries as Entry[]);
            setCurrentPath(result.data.path as string);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Unable to load directory");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadDirectory(initialPath), 0);
        return () => window.clearTimeout(timer);
    }, [loadDirectory, initialPath]);

    const api = async (url: string, options?: RequestInit) => {
        const response = await fetch(url, options);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "Request failed");
        return result;
    };

    const openEntry = async (entry: Entry) => {
        if (entry.type === "directory") {
            await loadDirectory(entry.path);
            return;
        }

        const nextRecent = [
            entry.path,
            ...recent.filter((path) => path !== entry.path),
        ].slice(0, 30);
        setRecent(nextRecent);
        localStorage.setItem("orbital.recent", JSON.stringify(nextRecent));
        localStorage.setItem("orbital.folder", currentPath);

        const kind = entry.kind ?? "unsupported";
        if (kind === "video" && entry.browserCompatible && entry.mediaId) {
            window.location.assign(`/watch/${entry.mediaId}`);
        } else if (kind === "audio" && entry.browserCompatible && entry.mediaId) {
            window.location.assign(`/audio/${entry.mediaId}`);
        } else if (kind === "image" && entry.browserCompatible && entry.mediaId) {
            window.location.assign(`/photos/${entry.mediaId}`);
        } else {
            const query = new URLSearchParams({ path: entry.path });
            window.location.assign(`/api/files/download?${query}&open=1`);
        }
    };

    const download = (entry: Entry) => {
        const query = new URLSearchParams({ path: entry.path });
        const anchor = document.createElement("a");
        anchor.href = `/api/files/download?${query}`;
        anchor.download = entry.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const toggleFavorite = (entry: Entry) => {
        const next = favorites.includes(entry.path)
            ? favorites.filter((path) => path !== entry.path)
            : [...favorites, entry.path];
        setFavorites(next);
        localStorage.setItem("orbital.favorites", JSON.stringify(next));
    };

    const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files?.length) return;
        setUploading(true);
        setError("");
        setNotice("");
        try {
            for (const file of Array.from(files)) {
                const form = new FormData();
                form.append("file", file);
                form.append("path", currentPath);
                await api("/api/files/upload", { method: "POST", body: form });
            }
            setNotice(`${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
            await loadDirectory(currentPath);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Upload failed");
        } finally {
            setUploading(false);
            if (uploadInput.current) uploadInput.current.value = "";
        }
    };

    const createFolder = async () => {
        const name = window.prompt("Folder name");
        if (!name?.trim()) return;
        try {
            await api("/api/files/directory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parentPath: currentPath, name }),
            });
            setNotice("Folder created");
            await loadDirectory(currentPath);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not create folder");
        }
    };

    const rename = async (entry: Entry) => {
        const name = window.prompt("New name", entry.name);
        if (!name?.trim() || name === entry.name) return;
        try {
            await api("/api/files/rename", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: entry.path, newName: name }),
            });
            setNotice("Renamed successfully");
            await loadDirectory(currentPath);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Rename failed");
        }
    };

    const remove = async (entry: Entry) => {
        if (!window.confirm(`Delete "${entry.name}"?`)) return;
        try {
            const query = new URLSearchParams({ path: entry.path });
            await api(`/api/files?${query}`, { method: "DELETE" });
            setNotice("Deleted successfully");
            await loadDirectory(currentPath);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Delete failed");
        }
    };

    const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];
    const visible = entries
        .filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase()))
        .filter((entry) => {
            if (section === "Media Library") {
                const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
                return entry.type === "file" && mediaExtensions.includes(extension);
            }
            if (section === "Recent") return recent.includes(entry.path);
            if (section === "Favorites") return favorites.includes(entry.path);
            return true;
        })
        .sort((a, b) => {
            if (sort === "modified") return Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt);
            if (sort === "size") return b.size - a.size;
            return a.name.localeCompare(b.name);
        });

    return (
        <section className="directory-explorer">
            <header className="directory-toolbar">
                <div className="directory-breadcrumbs">
                    <button type="button" onClick={() => void loadDirectory("")}>My files</button>
                    {breadcrumbs.map((segment, index) => {
                        const target = breadcrumbs.slice(0, index + 1).join("/");
                        return (
                            <span key={target}>
                                <ChevronRight size={13} />
                                <button type="button" onClick={() => void loadDirectory(target)}>{segment}</button>
                            </span>
                        );
                    })}
                </div>
                <div className="directory-actions">
                    {!readOnly && (
                        <>
                            <button type="button" onClick={createFolder}><FolderPlus size={15} /> New folder</button>
                            <button type="button" className="directory-primary" onClick={() => uploadInput.current?.click()} disabled={uploading}>
                                <Upload size={15} /> {uploading ? "Uploading" : "Upload"}
                            </button>
                            <input ref={uploadInput} type="file" multiple hidden onChange={upload} />
                        </>
                    )}
                    <button type="button" className="directory-icon-button" onClick={() => void loadDirectory(currentPath)} aria-label="Refresh">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </header>

            <div className="directory-controls">
                <input
                    aria-label="Search files"
                    placeholder="Search files"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <select aria-label="Sort files" value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="name">Name</option>
                    <option value="modified">Modified</option>
                    <option value="size">Size</option>
                </select>
                <div className="directory-view-toggle">
                    <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={15} /></button>
                    <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={15} /></button>
                </div>
            </div>

            {error && <div className="directory-alert error" role="alert">{error}</div>}
            {notice && <div className="directory-alert success">{notice}</div>}

            {loading ? (
                <div className="directory-empty">Loading directory...</div>
            ) : visible.length === 0 ? (
                <div className="directory-empty">
                    <Folder size={28} />
                    <strong>No files to show</strong>
                    <span>{search ? "Try a different search." : "This directory is empty."}</span>
                </div>
            ) : view === "list" ? (
                <div className="directory-table">
                    <div className="directory-table-head">
                        <span>Name</span><span>Type</span><span>Size</span><span>Modified</span><span />
                    </div>
                    {visible.map((entry) => (
                        <div className="directory-row" key={entry.path}>
                            <button type="button" className="directory-name" onClick={() => void openEntry(entry)}>
                                {entry.type === "directory" ? <Folder size={18} /> : <File size={18} />}
                                <span>{entry.name}</span>
                            </button>
                            <span>{entry.type === "directory" ? "Folder" : (entry.name.split(".").pop()?.toUpperCase() ?? "File")}</span>
                            <span>{entry.type === "file" ? formatBytes(entry.size) : "--"}</span>
                            <span>{formatDate(entry.modifiedAt)}</span>
                            <div className="directory-row-actions">
                                {entry.type === "file" && (
                                    <>
                                        <button type="button" aria-label="Download" onClick={() => download(entry)}><Download size={15} /></button>
                                        <button type="button" aria-label="Favorite" className={favorites.includes(entry.path) ? "active" : ""} onClick={() => toggleFavorite(entry)}>
                                            <Heart size={15} fill={favorites.includes(entry.path) ? "currentColor" : "none"} />
                                        </button>
                                    </>
                                )}
                                {!readOnly && (
                                    <>
                                        <button type="button" aria-label="Rename" onClick={() => void rename(entry)}><Pencil size={15} /></button>
                                        <button type="button" aria-label="Delete" onClick={() => void remove(entry)}><Trash2 size={15} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="directory-grid">
                    {visible.map((entry) => (
                        <article className="directory-card" key={entry.path}>
                            <button type="button" className="directory-card-open" onClick={() => void openEntry(entry)}>
                                <span className="directory-card-icon">
                                    {entry.type === "directory" ? <Folder size={26} /> : <File size={26} />}
                                </span>
                                <strong>{entry.name}</strong>
                                <small>{entry.type === "file" ? formatBytes(entry.size) : "Folder"}</small>
                            </button>
                            {entry.type === "file" && (
                                <button type="button" className="directory-card-download" onClick={() => download(entry)} aria-label="Download">
                                    <Download size={15} />
                                </button>
                            )}
                        </article>
                    ))}
                </div>
            )}

        </section>
    );
}
