export type FileEntryType = "file" | "directory";

export interface FileEntry {
    name: string;
    path: string;
    type: FileEntryType;
    size: number;
    modifiedAt: string;
    mediaId?: string;
    mimeType?: string;
    kind?: "video" | "audio" | "image" | "pdf" | "text" | "unsupported";
    browserCompatible?: boolean;
}

export interface DirectoryListing {
    path: string;
    entries: FileEntry[];
}
