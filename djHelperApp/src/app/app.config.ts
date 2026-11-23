import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  APP_INITIALIZER,
} from '@angular/core';
import { SavedSetsService } from '../services/saved-sets.service/saved-sets.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: APP_INITIALIZER,
      useFactory: (savedSets: SavedSetsService) => async () => {
        try {
          await savedSets.refresh();
        } catch (error) {
          console.error('Failed to initialize saved sets:', error);
          // Ensure the status is set even if refresh fails unexpectedly
          if (savedSets.status() === 'loading') {
            savedSets.status.set('unavailable');
          }
        }
      },
      deps: [SavedSetsService],
      multi: true,
    },
  ],
};
