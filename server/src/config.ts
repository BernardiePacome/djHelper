import path from 'node:path';

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  quotaBytes: number;
}

export const DEFAULT_QUOTA_BYTES = 2 * 1024 ** 3;

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env['HOST'] || '0.0.0.0',
    port: parsePositiveInteger(env['PORT'], 3000, 'PORT'),
    dataDir: path.resolve(env['DATA_DIR'] || './data'),
    quotaBytes: parsePositiveInteger(env['DATA_QUOTA_BYTES'], DEFAULT_QUOTA_BYTES, 'DATA_QUOTA_BYTES'),
  };
}
