import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { createFileStore, openDatabase } from './db.ts';
import type { StoredFile } from './db.ts';
import { classifyFile, sanitizeFileName } from './file-types.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATABASE_FILE_NAME = 'djhelper.sqlite';

function sizeOnDisk(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function encodeContentDispositionName(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function buildApp(config: Config, options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const uploadsDir = path.join(config.dataDir, 'uploads');
  const databasePath = path.join(config.dataDir, DATABASE_FILE_NAME);
  mkdirSync(uploadsDir, { recursive: true });

  const database = openDatabase(databasePath);
  const store = createFileStore(database);

  // A crash between writing a file and recording it leaves an untracked file behind.
  const knownIds = store.ids();
  for (const entry of readdirSync(uploadsDir)) {
    if (!knownIds.has(entry)) {
      rmSync(path.join(uploadsDir, entry), { force: true });
    }
  }

  // The quota covers everything the app writes to the volume, including the SQLite files.
  const usedBytes = (): number =>
    store.totalSize() +
    ['', '-wal', '-shm'].reduce((total, suffix) => total + sizeOnDisk(`${databasePath}${suffix}`), 0);

  const app = Fastify({ logger: options.logger ?? false });
  app.addHook('onClose', async () => database.close());
  await app.register(multipart, { limits: { files: 1 } });

  // Uploads run one at a time so concurrent requests cannot jointly exceed the quota.
  let uploadLock: Promise<void> = Promise.resolve();
  const withUploadLock = <T>(task: () => Promise<T>): Promise<T> => {
    const result = uploadLock.then(task);
    uploadLock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const toResponse = (file: StoredFile) => ({ ...file, url: `/api/files/${file.id}` });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/storage', async () => {
    const used = usedBytes();
    return {
      usedBytes: used,
      quotaBytes: config.quotaBytes,
      availableBytes: Math.max(config.quotaBytes - used, 0),
    };
  });

  app.get('/api/files', async () => ({ files: store.list().map(toResponse) }));

  app.post('/api/files', async (request, reply) =>
    withUploadLock(async () => {
      if (!request.isMultipart()) {
        return reply.code(415).send({ error: 'Expected multipart/form-data' });
      }

      const available = config.quotaBytes - usedBytes();
      if (available <= 0) {
        return reply.code(413).send({ error: 'Storage quota exceeded' });
      }

      const part = await request.file({ limits: { fileSize: available } });
      if (!part) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const name = sanitizeFileName(part.filename);
      const fileType = classifyFile(name);
      if (!name || !fileType) {
        part.file.resume();
        return reply.code(415).send({ error: 'Unsupported file type' });
      }

      const id = randomUUID();
      const target = path.join(uploadsDir, id);

      try {
        await pipeline(part.file, createWriteStream(target, { flags: 'wx' }));
        if (part.file.truncated) {
          throw Object.assign(new Error('Storage quota exceeded'), { code: 'FST_REQ_FILE_TOO_LARGE' });
        }

        const { size } = await stat(target);
        if (size === 0) {
          await rm(target, { force: true });
          return reply.code(400).send({ error: 'Uploaded file is empty' });
        }

        const file: StoredFile = {
          id,
          name,
          kind: fileType.kind,
          mime: fileType.mime,
          size,
          createdAt: new Date().toISOString(),
        };
        store.insert(file);
        return reply.code(201).send(toResponse(file));
      } catch (error) {
        await rm(target, { force: true });
        if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'Storage quota exceeded' });
        }
        throw error;
      }
    }),
  );

  app.get<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    const file = UUID_PATTERN.test(request.params.id) ? store.get(request.params.id) : undefined;
    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const filePath = path.join(uploadsDir, file.id);
    const size = await stat(filePath).then(
      (stats) => stats.size,
      () => undefined,
    );
    if (size === undefined) {
      return reply.code(404).send({ error: 'File not found' });
    }

    return reply
      .header('content-type', file.mime)
      .header('content-length', size)
      .header('content-disposition', `inline; filename*=UTF-8''${encodeContentDispositionName(file.name)}`)
      .header('x-content-type-options', 'nosniff')
      .send(createReadStream(filePath));
  });

  app.delete<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_PATTERN.test(id) || !store.remove(id)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    await rm(path.join(uploadsDir, id), { force: true });
    return reply.code(204).send();
  });

  return app;
}
