import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { isMockModeUrl } from '../mocks/mock-mode';

// Set up global error handlers to prevent browser-level page reloads
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

async function bootstrap(): Promise<void> {
  if (isMockModeUrl(new URL(location.href))) {
    const { worker } = await import('../mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((error: unknown) => console.error(error));
