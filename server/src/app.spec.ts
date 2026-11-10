import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { DEFAULT_QUOTA_BYTES, loadConfig } from './config.ts';
import { openDatabase } from './db.ts';

const CUE_CONTENT = 'TRACK 01 AUDIO\n  TITLE "Song"\n  INDEX 01 00:00:00\n';

async function multipartBody(content: string | Uint8Array, fileName: string) {
  const form = new FormData();
  form.append('file', new Blob([content as BlobPart]), fileName);
  const response = new Response(form);
  return {
    payload: Buffer.from(await response.arrayBuffer()),
    headers: { 'content-type': response.headers.get('content-type') ?? '' },
  };
}

describe('server', () => {
  let dataDir: string;
  let app: FastifyInstance;

  const start = async (quotaBytes = DEFAULT_QUOTA_BYTES) => {
    app = await buildApp({ host: '127.0.0.1', port: 0, dataDir, quotaBytes });
  };

  const upload = async (content: string | Uint8Array, fileName: string) =>
    app.inject({ method: 'POST', url: '/api/files', ...(await multipartBody(content, fileName)) });

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'djhelper-'));
  });

  afterEach(async () => {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('reports health', async () => {
    await start();
    const response = await app.inject('/api/health');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('uploads, lists, downloads and deletes a file', async () => {
    await start();

    const created = await upload(CUE_CONTENT, 'set.cue');
    expect(created.statusCode).toBe(201);
    const file = created.json();
    expect(file).toMatchObject({ name: 'set.cue', kind: 'cue', size: CUE_CONTENT.length });

    const list = await app.inject('/api/files');
    expect(list.json().files).toHaveLength(1);

    const download = await app.inject(file.url);
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe(CUE_CONTENT);
    expect(download.headers['content-type']).toContain('text/plain');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    const removed = await app.inject({ method: 'DELETE', url: file.url });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject(file.url)).statusCode).toBe(404);
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
  });

  it('stores audio under its detected type and strips client paths from names', async () => {
    await start();
    const created = await upload(new Uint8Array([1, 2, 3, 4]), '../../etc/My Mix.MP3');
    expect(created.json()).toMatchObject({ name: 'My Mix.MP3', kind: 'audio', mime: 'audio/mpeg' });
  });

  it('rejects unsupported file types', async () => {
    await start();
    const response = await upload('<script>alert(1)</script>', 'page.html');
    expect(response.statusCode).toBe(415);
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
  });

  it('rejects empty files and non-multipart requests', async () => {
    await start();
    expect((await upload('', 'empty.cue')).statusCode).toBe(400);
    const response = await app.inject({ method: 'POST', url: '/api/files', payload: { a: 1 } });
    expect(response.statusCode).toBe(415);
  });

  it('rejects uploads that exceed the quota and cleans up', async () => {
    await start(1024 * 1024);
    const tooBig = await upload(new Uint8Array(2 * 1024 * 1024).fill(1), 'big.wav');
    expect(tooBig.statusCode).toBe(413);
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);

    const fits = await upload(new Uint8Array(512 * 1024).fill(1), 'ok.wav');
    expect(fits.statusCode).toBe(201);
  });

  it('counts stored files against the remaining quota', async () => {
    await start(1024 * 1024);
    expect((await upload(new Uint8Array(600 * 1024).fill(1), 'a.wav')).statusCode).toBe(201);
    expect((await upload(new Uint8Array(600 * 1024).fill(1), 'b.wav')).statusCode).toBe(413);

    const storage = (await app.inject('/api/storage')).json();
    expect(storage.quotaBytes).toBe(1024 * 1024);
    expect(storage.usedBytes).toBeGreaterThanOrEqual(600 * 1024);
    expect(storage.availableBytes).toBe(storage.quotaBytes - storage.usedBytes);
  });

  it('serialises concurrent uploads so the quota is never exceeded', async () => {
    await start(1024 * 1024);
    const results = await Promise.all(
      ['a.wav', 'b.wav', 'c.wav'].map((name) => upload(new Uint8Array(600 * 1024).fill(1), name)),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 413, 413]);
    expect((await app.inject('/api/storage')).json().usedBytes).toBeLessThanOrEqual(1024 * 1024);
  });

  it('returns 404 for malformed or unknown ids', async () => {
    await start();
    expect((await app.inject('/api/files/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404);
    expect((await app.inject('/api/files/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/files/not-a-uuid' })).statusCode).toBe(404);
  });

  it('removes untracked files left in the uploads directory on startup', async () => {
    await start();
    await app.close();
    const orphan = path.join(dataDir, 'uploads', '11111111-1111-4111-8111-111111111111');
    writeFileSync(orphan, 'leftover');

    await start();
    expect(existsSync(orphan)).toBe(false);
  });
});

describe('saved sets', () => {
  let dataDir: string;
  let app: FastifyInstance;

  const start = async (quotaBytes = DEFAULT_QUOTA_BYTES) => {
    app = await buildApp({ host: '127.0.0.1', port: 0, dataDir, quotaBytes });
  };

  const upload = async (content: string | Uint8Array, fileName: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/files',
      ...(await multipartBody(content, fileName)),
    });
    return response.json();
  };

  const createSet = (body: object) => app.inject({ method: 'POST', url: '/api/sets', payload: body });

  const uploadPair = async () => ({
    cue: await upload(CUE_CONTENT, 'set.cue'),
    audio: await upload(new Uint8Array([1, 2, 3, 4]), 'set.mp3'),
  });

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'djhelper-'));
  });

  afterEach(async () => {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('saves, lists and deletes a set together with its files', async () => {
    await start();
    const { cue, audio } = await uploadPair();

    const created = await createSet({ name: '  Friday night  ', cueFileId: cue.id, audioFileId: audio.id });
    expect(created.statusCode).toBe(201);
    const set = created.json();
    expect(set).toMatchObject({
      name: 'Friday night',
      size: CUE_CONTENT.length + 4,
      cue: { id: cue.id, name: 'set.cue' },
      audio: { id: audio.id, name: 'set.mp3' },
    });

    expect((await app.inject('/api/sets')).json().sets).toHaveLength(1);

    const removed = await app.inject({ method: 'DELETE', url: `/api/sets/${set.id}` });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject('/api/sets')).json().sets).toEqual([]);
    expect((await app.inject(cue.url)).statusCode).toBe(404);
    expect((await app.inject(audio.url)).statusCode).toBe(404);
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
    expect((await app.inject('/api/storage')).json().usedBytes).toBeLessThan(1024 * 1024);
  });

  it('keeps sets and their audio across a restart', async () => {
    await start();
    const { cue, audio } = await uploadPair();
    await createSet({ name: 'Persisted', cueFileId: cue.id, audioFileId: audio.id });
    await app.close();

    await start();
    const [set] = (await app.inject('/api/sets')).json().sets;
    expect(set.name).toBe('Persisted');
    expect((await app.inject(set.audio.url)).rawPayload).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('validates the request body', async () => {
    await start();
    const { cue, audio } = await uploadPair();

    expect((await createSet({ cueFileId: cue.id, audioFileId: audio.id })).statusCode).toBe(400);
    expect((await createSet({ name: '   ', cueFileId: cue.id, audioFileId: audio.id })).statusCode).toBe(400);
    expect((await createSet({ name: 'x', cueFileId: 'nope', audioFileId: audio.id })).statusCode).toBe(400);
  });

  it('requires a cue file and an audio file that exist', async () => {
    await start();
    const { cue, audio } = await uploadPair();
    const missing = '00000000-0000-4000-8000-000000000000';

    expect((await createSet({ name: 'x', cueFileId: audio.id, audioFileId: cue.id })).statusCode).toBe(400);
    expect((await createSet({ name: 'x', cueFileId: missing, audioFileId: audio.id })).statusCode).toBe(400);
  });

  it('does not let two sets share files, or let a set file be deleted on its own', async () => {
    await start();
    const { cue, audio } = await uploadPair();
    expect((await createSet({ name: 'one', cueFileId: cue.id, audioFileId: audio.id })).statusCode).toBe(201);

    expect((await createSet({ name: 'two', cueFileId: cue.id, audioFileId: audio.id })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: audio.url })).statusCode).toBe(409);
    expect((await app.inject(audio.url)).statusCode).toBe(200);
  });

  it('returns 404 when deleting an unknown set', async () => {
    await start();
    expect((await app.inject({ method: 'DELETE', url: '/api/sets/not-a-uuid' })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/sets/00000000-0000-4000-8000-000000000000' })).statusCode,
    ).toBe(404);
  });

  it('purges stale uploads that never joined a set, and keeps saved ones', async () => {
    await start();
    const kept = await uploadPair();
    await createSet({ name: 'Kept', cueFileId: kept.cue.id, audioFileId: kept.audio.id });
    const stale = await upload(CUE_CONTENT, 'stale.cue');
    const fresh = await upload(CUE_CONTENT, 'fresh.cue');
    await app.close();

    const database = openDatabase(path.join(dataDir, 'djhelper.sqlite'));
    database.prepare("UPDATE files SET created_at = '2000-01-01T00:00:00.000Z'").run();
    database.prepare('UPDATE files SET created_at = ? WHERE id = ?').run(new Date().toISOString(), fresh.id);
    database.close();

    await start();
    expect((await app.inject(stale.url)).statusCode).toBe(404);
    expect((await app.inject(fresh.url)).statusCode).toBe(200);
    expect((await app.inject(kept.audio.url)).statusCode).toBe(200);
    expect(readdirSync(path.join(dataDir, 'uploads')).sort()).toEqual(
      [kept.cue.id, kept.audio.id, fresh.id].sort(),
    );
  });
});

describe('loadConfig', () => {
  it('defaults to a 2 GiB quota', () => {
    expect(loadConfig({}).quotaBytes).toBe(2 * 1024 ** 3);
  });

  it('reads overrides and rejects invalid numbers', () => {
    expect(loadConfig({ PORT: '4000', DATA_QUOTA_BYTES: '1024' })).toMatchObject({ port: 4000, quotaBytes: 1024 });
    expect(() => loadConfig({ DATA_QUOTA_BYTES: '-1' })).toThrow('DATA_QUOTA_BYTES');
  });
});
