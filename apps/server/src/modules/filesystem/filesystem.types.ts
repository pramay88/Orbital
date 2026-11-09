export type FileEntryType = "file" | "directory";

export interface FileEntry {
    name: string;
    path: string;
    type: FileEntryType;
    size: number;
    modifiedAt: string;
}

export interface DirectoryListing {
    path: string;
    entries: FileEntry[];
}
