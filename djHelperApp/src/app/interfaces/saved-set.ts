export interface SavedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface SavedSet {
  id: string;
  name: string;
  createdAt: string;
  size: number;
  cue: SavedFile;
  audio: SavedFile;
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
}

export type SavedSetsStatus = 'loading' | 'ready' | 'unavailable';

export interface LocalSetRecord {
  id: string;
  name: string;
  createdAt: string;
  cue: {
    id: string;
    name: string;
    mime: string;
    size: number;
    blob: Blob;
  };
  audio: {
    id: string;
    name: string;
    mime: string;
    size: number;
    blob: Blob;
  };
}

export interface LoadedSet {
  set: SavedSet;
  files: File[];
}
