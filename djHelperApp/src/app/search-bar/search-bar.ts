import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { SavedSetsService } from '../saved-sets/saved-sets.service';
import type { SavedSet } from '../saved-sets/saved-sets.service';
import type { LoadedSet } from '../saved-sets/saved-sets';
import { SetSearchService } from './set-search.service';
import { highlightMatches } from './search-text';
import type { TextSegment } from './search-text';

const MAX_TRACKS_SHOWN = 5;

interface ResultRow {
  set: SavedSet;
  name: TextSegment[];
  tracks: { artist: TextSegment[]; title: TextSegment[]; playTime: string }[];
  hiddenTrackCount: number;
}

@Component({
  selector: 'app-search-bar',
  standalone: true,
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss'
})
export class SearchBar {
  private readonly savedSets = inject(SavedSetsService);
  private readonly setSearch = inject(SetSearchService);

  public readonly setLoaded = output<LoadedSet>();

  public readonly query = signal('');
  public readonly hasQuery = computed(() => this.query().trim().length > 0);
  public readonly rows = computed<ResultRow[]>(() => {
    const query = this.query();
    return this.setSearch.search(query).map(({ set, tracks }) => ({
      set,
      name: highlightMatches(set.name, query),
      tracks: tracks.slice(0, MAX_TRACKS_SHOWN).map((track) => ({
        artist: highlightMatches(track.artist, query),
        title: highlightMatches(track.title, query),
        playTime: track.playTime
      })),
      hiddenTrackCount: Math.max(0, tracks.length - MAX_TRACKS_SHOWN)
    }));
  });
  public readonly isIndexing = computed(() => this.setSearch.pendingCount() > 0);
  public readonly isUnavailable = computed(() => this.savedSets.status() === 'unavailable');
  public readonly busySetId = signal<string | null>(null);
  public readonly errorMessage = signal('');

  public constructor() {
    // Cue files are only downloaded once someone actually searches, and again for newly saved sets.
    effect(() => {
      if (this.hasQuery()) {
        this.setSearch.ensureIndexed();
      }
    });
  }

  public onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.errorMessage.set('');
  }

  public clear(): void {
    this.query.set('');
    this.errorMessage.set('');
  }

  public async load(set: SavedSet): Promise<void> {
    this.busySetId.set(set.id);
    this.errorMessage.set('');

    try {
      this.setLoaded.emit({ set, files: await this.savedSets.load(set) });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage.set(`Unable to load "${set.name}": ${details}`);
    } finally {
      this.busySetId.set(null);
    }
  }
}
