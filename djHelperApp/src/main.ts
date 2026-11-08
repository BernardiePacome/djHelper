import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

async function bootstrap(): Promise<void> {
  if (new URLSearchParams(location.search).get('mock') === '1') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((error: unknown) => console.error(error));
