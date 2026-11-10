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
      this.status.set('ready');
    } catch {
      this.status.set('unavailable');
    }
  }

  public async save(name: string, cueFile: File, audioFile: File): Promise<SavedSet> {
    const uploadedIds: string[] = [];

    try {
      const cue = await this.upload(cueFile);
      uploadedIds.push(cue.id);
      const audio = await this.upload(audioFile);
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
