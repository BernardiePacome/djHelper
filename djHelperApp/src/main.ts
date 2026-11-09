import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { isMockModeUrl } from './mocks/mock-mode';

async function bootstrap(): Promise<void> {
  if (isMockModeUrl(new URL(location.href))) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((error: unknown) => console.error(error));
