import { Injectable, inject, signal } from '@angular/core';
import { parseCueTracks } from '../cue-parser';
import type { SetTrack } from '../set-track';
import { SavedSetsService } from '../saved-sets/saved-sets.service';
import type { SavedSet } from '../saved-sets/saved-sets.service';
import { matchesAllTerms, searchTerms } from './search-text';

export interface SetSearchResult {
  set: SavedSet;
  nameMatch: boolean;
  tracks: SetTrack[];
}

@Injectable({ providedIn: 'root' })
export class SetSearchService {
  private readonly savedSets = inject(SavedSetsService);
  // Keyed by cue file id; artists and titles only exist inside each set's cue file.
  private readonly tracksByCueId = signal<Record<string, SetTrack[]>>({});
  private readonly attemptedCueIds = new Set<string>();

  public readonly pendingCount = signal(0);

  public ensureIndexed(): void {
    for (const { cue } of this.savedSets.sets()) {
      if (!this.attemptedCueIds.has(cue.id)) {
        this.attemptedCueIds.add(cue.id);
        void this.indexCue(cue.id, cue.url);
      }
    }
  }

  public search(query: string): SetSearchResult[] {
    const terms = searchTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const indexed = this.tracksByCueId();
    const results: SetSearchResult[] = [];

    for (const set of this.savedSets.sets()) {
      const nameMatch = matchesAllTerms(set.name, terms);
      const tracks = (indexed[set.cue.id] ?? []).filter((track) =>
        matchesAllTerms(`${track.artist} ${track.title}`, terms)
      );

      if (nameMatch || tracks.length > 0) {
        results.push({ set, nameMatch, tracks });
      }
    }

    return results;
  }

  private async indexCue(cueId: string, url: string): Promise<void> {
    this.pendingCount.update((count) => count + 1);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }

      const tracks = parseCueTracks(await response.text());
      this.tracksByCueId.update((indexed) => ({ ...indexed, [cueId]: tracks }));
    } catch {
      // A set whose cue cannot be read is still searchable by name.
    } finally {
      this.pendingCount.update((count) => count - 1);
    }
  }
}
