import { Injectable, signal } from '@angular/core';

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

interface LocalSetRecord {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSavedFile(value: unknown): value is SavedFile {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['mime'] === 'string' &&
    typeof value['size'] === 'number' &&
    typeof value['url'] === 'string'
  );
}

function isSavedSet(value: unknown): value is SavedSet {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['size'] === 'number' &&
    isSavedFile(value['cue']) &&
    isSavedFile(value['audio'])
  );
}

function isStorageUsage(value: unknown): value is StorageUsage {
  return (
    isRecord(value) &&
    typeof value['usedBytes'] === 'number' &&
    typeof value['quotaBytes'] === 'number' &&
    typeof value['availableBytes'] === 'number'
  );
}

function fileExtension(fileName: string): string {
  return /\.[^./\\]+$/.exec(fileName)?.[0].toLowerCase() ?? '';
}

function renamedFile(file: File, name: string): File {
  return file.name === name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified });
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body['error'] === 'string') {
      return body['error'];
    }
  } catch {
    // The body was not JSON (e.g. an HTML error page); fall through to the status code.
  }

  return `Request failed (${response.status})`;
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

@Injectable({ providedIn: 'root' })
export class SavedSetsService {
  public readonly sets = signal<SavedSet[]>([]);
  public readonly storage = signal<StorageUsage | null>(null);
  public readonly status = signal<SavedSetsStatus>('loading');
  private backend: 'server' | 'local' = 'server';
  private readonly localUrls = new Map<string, string[]>();

  public async refresh(): Promise<void> {
    try {
      const [setsBody, storageBody] = await Promise.all([
        requestJson('/api/sets'),
        requestJson('/api/storage'),
      ]);

      if (
        !isRecord(setsBody) ||
        !Array.isArray(setsBody['sets']) ||
        !setsBody['sets'].every(isSavedSet) ||
        !isStorageUsage(storageBody)
      ) {
        throw new Error('Unexpected response from the server');
      }

      this.sets.set(setsBody['sets']);
      this.storage.set(storageBody);
      this.backend = 'server';
      this.status.set('ready');
    } catch {
      try {
        await this.refreshLocal();
        this.backend = 'local';
        this.status.set('ready');
      } catch {
        this.status.set('unavailable');
      }
    }
  }

  public async save(name: string, cueFile: File, audioFile: File): Promise<SavedSet> {
    if (this.backend === 'local') {
      return this.saveLocal(name, cueFile, audioFile);
    }

    const uploadedIds: string[] = [];

    try {
      // Both files share the set name; only their extensions differ (.cue and the audio's own format).
      const cue = await this.upload(renamedFile(cueFile, `${name}.cue`));
      uploadedIds.push(cue.id);
      const audio = await this.upload(renamedFile(audioFile, `${name}${fileExtension(audioFile.name)}`));
      uploadedIds.push(audio.id);

      const body = await requestJson('/api/sets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, cueFileId: cue.id, audioFileId: audio.id }),
      });
      if (!isSavedSet(body)) {
        throw new Error('Unexpected response from the server');
      }

      this.sets.update((sets) => [body, ...sets]);
      await this.refreshStorage();
      return body;
    } catch (error) {
      // Files that never made it into a set would otherwise keep using the quota.
      await Promise.allSettled(
        uploadedIds.map((id) => fetch(`/api/files/${id}`, { method: 'DELETE' }))
      );
      throw error;
    }
  }

  public async remove(set: SavedSet): Promise<void> {
    if (this.backend === 'local') {
      await this.deleteLocal(set.id);
      this.sets.update((sets) => sets.filter(({ id }) => id !== set.id));
      await this.refreshLocalStorage();
      return;
    }

    const response = await fetch(`/api/sets/${set.id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(await readError(response));
    }

    this.sets.update((sets) => sets.filter(({ id }) => id !== set.id));
    await this.refreshStorage();
  }

  public load(set: SavedSet): Promise<File[]> {
    return Promise.all(
      [set.cue, set.audio].map(async ({ name, mime, url }) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Unable to load ${name} (${response.status})`);
        }

        return new File([await response.blob()], name, { type: mime });
      })
    );
  }

  private async refreshLocal(): Promise<void> {
    const records = await this.localRecords();
    this.revokeLocalUrls();
    this.sets.set(records.map((record) => this.toLocalSet(record)));
    await this.refreshLocalStorage(records);
  }

  private async saveLocal(name: string, cueFile: File, audioFile: File): Promise<SavedSet> {
    const id = this.newId();
    const record: LocalSetRecord = {
      id,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      cue: { id: `${id}-cue`, name: `${name}.cue`, mime: cueFile.type || 'text/plain', size: cueFile.size, blob: cueFile },
      audio: {
        id: `${id}-audio`,
        name: `${name}${fileExtension(audioFile.name)}`,
        mime: audioFile.type || 'application/octet-stream',
        size: audioFile.size,
        blob: audioFile,
      },
    };

    await this.putLocal(record);
    const set = this.toLocalSet(record);
    this.sets.update((sets) => [set, ...sets]);
    await this.refreshLocalStorage();
    return set;
  }

  private async deleteLocal(id: string): Promise<void> {
    await this.deleteLocalRecord(id);
    const urls = this.localUrls.get(id) ?? [];
    urls.forEach((url) => URL.revokeObjectURL(url));
    this.localUrls.delete(id);
  }

  private toLocalSet(record: LocalSetRecord): SavedSet {
    const urls = [URL.createObjectURL(record.cue.blob), URL.createObjectURL(record.audio.blob)];
    this.localUrls.set(record.id, urls);
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      size: record.cue.size + record.audio.size,
      cue: { id: record.cue.id, name: record.cue.name, mime: record.cue.mime, size: record.cue.size, url: urls[0] },
      audio: {
        id: record.audio.id,
        name: record.audio.name,
        mime: record.audio.mime,
        size: record.audio.size,
        url: urls[1],
      },
    };
  }

  private async refreshLocalStorage(records?: LocalSetRecord[]): Promise<void> {
    const localRecords = records ?? (await this.localRecords());
    const usedBytes = localRecords.reduce((total, record) => total + record.cue.size + record.audio.size, 0);
    const estimate = await navigator.storage?.estimate();
    const quotaBytes = estimate?.quota ?? 2 * 1024 ** 3;
    this.storage.set({ usedBytes, quotaBytes, availableBytes: Math.max(quotaBytes - usedBytes, 0) });
  }

  private localRecords(): Promise<LocalSetRecord[]> {
    return this.withLocalStore('readonly', (store) => this.requestResult(store.getAll()));
  }

  private putLocal(record: LocalSetRecord): Promise<void> {
    return this.withLocalStore('readwrite', (store) => this.requestResult(store.put(record)).then(() => undefined));
  }

  private deleteLocalRecord(id: string): Promise<void> {
    return this.withLocalStore('readwrite', (store) => this.requestResult(store.delete(id)).then(() => undefined));
  }

  private withLocalStore<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('Browser storage is unavailable'));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('djhelper', 1);
      request.onerror = () => reject(request.error ?? new Error('Unable to open browser storage'));
      request.onupgradeneeded = () => request.result.createObjectStore('sets', { keyPath: 'id' });
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('sets', mode);
        action(transaction.objectStore('sets')).then(resolve, reject);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage request failed'));
      };
    });
  }

  private requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Browser storage request failed'));
    });
  }

  private revokeLocalUrls(): void {
    this.localUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
    this.localUrls.clear();
  }

  private newId(): string {
    return `local-${crypto.randomUUID()}`;
  }

  private async upload(file: File): Promise<SavedFile> {
    const form = new FormData();
    form.append('file', file, file.name);

    const body = await requestJson('/api/files', { method: 'POST', body: form });
    if (!isSavedFile(body)) {
      throw new Error('Unexpected response from the server');
    }

    return body;
  }

  private async refreshStorage(): Promise<void> {
    try {
      const body = await requestJson('/api/storage');
      if (isStorageUsage(body)) {
        this.storage.set(body);
      }
    } catch {
      // The usage figure is informational; keep the previous value.
    }
  }
}
