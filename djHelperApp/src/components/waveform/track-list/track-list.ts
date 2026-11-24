import { Component, computed, input, output, signal } from '@angular/core';
import { CueMarker, SetTrack } from '../../../interfaces/set-track';
import { matchesAllTerms, searchTerms } from '../../search-bar/search-text';

@Component({
  selector: 'app-track-list',
  standalone: true,
  templateUrl: './track-list.html',
  styleUrl: './track-list.scss',
})
export class TrackList {
  private static nextInstanceId = 0;
  protected readonly listId = `track-list-${TrackList.nextInstanceId++}`;

  public readonly tracks = input.required<SetTrack[]>();
  public readonly seekableMarkers = input<CueMarker[]>([]);
  public readonly currentTime = input(0);
  public readonly isPlaying = input(false);
  public readonly seekRequested = output<number>();
  public readonly isExpanded = signal(false);
  public readonly query = signal('');
  public readonly filteredTracks = computed(() => {
    const terms = searchTerms(this.query());
    return this.tracks()
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => matchesAllTerms(`${track.artist} ${track.title}`, terms));
  });
  public readonly activeTrackIndex = computed(() => {
    if (!this.isPlaying()) {
      return -1;
    }

    const activeMarker = this.seekableMarkers()
      .filter((marker) => Number.isFinite(marker.time) && marker.time <= this.currentTime())
      .sort((first, second) => first.time - second.time)
      .at(-1);

    return activeMarker
      ? this.tracks().findIndex(
          (track) => track.artist === activeMarker.artist && track.title === activeMarker.title,
        )
      : -1;
  });

  public seekableTime(track: SetTrack): number | undefined {
    return this.seekableMarkers().find(
      (marker) => marker.artist === track.artist && marker.title === track.title,
    )?.time;
  }

  public seekToTrack(track: SetTrack): void {
    const time = this.seekableTime(track);
    if (time !== undefined) {
      this.seekRequested.emit(time);
    }
  }

  public toggleExpanded(): void {
    this.isExpanded.update((expanded) => !expanded);
  }

  public onSearchInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
