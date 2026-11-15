import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  APP_INITIALIZER,
} from '@angular/core';
import { SavedSetsService } from './saved-sets/saved-sets.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: APP_INITIALIZER,
      useFactory: (savedSets: SavedSetsService) => () => savedSets.refresh(),
      deps: [SavedSetsService],
      multi: true,
    },
  ],
};
