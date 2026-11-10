import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = await buildApp(config, { logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ dataDir: config.dataDir, quotaBytes: config.quotaBytes }, 'storage ready');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
