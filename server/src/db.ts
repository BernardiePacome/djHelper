import { DatabaseSync } from 'node:sqlite';
import type { FileKind } from './file-types.ts';

export interface StoredFile {
  id: string;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  createdAt: string;
}

export interface FileStore {
  insert(file: StoredFile): void;
  list(): StoredFile[];
  get(id: string): StoredFile | undefined;
  remove(id: string): boolean;
  totalSize(): number;
  ids(): Set<string>;
  isInSet(id: string): boolean;
  unattachedBefore(createdBefore: string): string[];
}

export interface StoredSet {
  id: string;
  name: string;
  cueFileId: string;
  audioFileId: string;
  createdAt: string;
}

export interface SetStore {
  insert(set: StoredSet): void;
  list(): StoredSet[];
  get(id: string): StoredSet | undefined;
  // Deletes the set and its two file rows atomically; returns the removed set.
  remove(id: string): StoredSet | undefined;
}

export function openDatabase(databasePath: string): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('cue', 'audio')),
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cue_file_id TEXT NOT NULL UNIQUE REFERENCES files(id),
      audio_file_id TEXT NOT NULL UNIQUE REFERENCES files(id),
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function toStoredFile(row: Record<string, unknown>): StoredFile {
  return {
    id: String(row['id']),
    name: String(row['name']),
    kind: row['kind'] as FileKind,
    mime: String(row['mime']),
    size: Number(row['size']),
    createdAt: String(row['created_at']),
  };
}

export function createFileStore(database: DatabaseSync): FileStore {
  const insertStatement = database.prepare(
    'INSERT INTO files (id, name, kind, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const listStatement = database.prepare('SELECT * FROM files ORDER BY created_at DESC, id');
  const getStatement = database.prepare('SELECT * FROM files WHERE id = ?');
  const removeStatement = database.prepare('DELETE FROM files WHERE id = ?');
  const totalStatement = database.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files');
  const idsStatement = database.prepare('SELECT id FROM files');
  const inSetStatement = database.prepare(
    'SELECT 1 AS found FROM sets WHERE cue_file_id = ? OR audio_file_id = ?',
  );
  const unattachedStatement = database.prepare(`
    SELECT id FROM files
    WHERE created_at < ?
      AND id NOT IN (SELECT cue_file_id FROM sets UNION SELECT audio_file_id FROM sets)
  `);

  return {
    insert(file) {
      insertStatement.run(file.id, file.name, file.kind, file.mime, file.size, file.createdAt);
    },
    list() {
      return listStatement.all().map(toStoredFile);
    },
    get(id) {
      const row = getStatement.get(id);
      return row ? toStoredFile(row) : undefined;
    },
    remove(id) {
      return Number(removeStatement.run(id).changes) > 0;
    },
    totalSize() {
      return Number(totalStatement.get()?.['total'] ?? 0);
    },
    ids() {
      return new Set(idsStatement.all().map((row) => String(row['id'])));
    },
    isInSet(id) {
      return inSetStatement.get(id, id) !== undefined;
    },
    unattachedBefore(createdBefore) {
      return unattachedStatement.all(createdBefore).map((row) => String(row['id']));
    },
  };
}

function toStoredSet(row: Record<string, unknown>): StoredSet {
  return {
    id: String(row['id']),
    name: String(row['name']),
    cueFileId: String(row['cue_file_id']),
    audioFileId: String(row['audio_file_id']),
    createdAt: String(row['created_at']),
  };
}

export function createSetStore(database: DatabaseSync, files: FileStore): SetStore {
  const insertStatement = database.prepare(
    'INSERT INTO sets (id, name, cue_file_id, audio_file_id, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const listStatement = database.prepare('SELECT * FROM sets ORDER BY created_at DESC, id');
  const getStatement = database.prepare('SELECT * FROM sets WHERE id = ?');
  const removeStatement = database.prepare('DELETE FROM sets WHERE id = ?');

  const get = (id: string): StoredSet | undefined => {
    const row = getStatement.get(id);
    return row ? toStoredSet(row) : undefined;
  };

  return {
    insert(set) {
      insertStatement.run(set.id, set.name, set.cueFileId, set.audioFileId, set.createdAt);
    },
    list() {
      return listStatement.all().map(toStoredSet);
    },
    get,
    remove(id) {
      const set = get(id);
      if (!set) {
        return undefined;
      }

      database.exec('BEGIN');
      try {
        removeStatement.run(id);
        files.remove(set.cueFileId);
        files.remove(set.audioFileId);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return set;
    },
  };
}
