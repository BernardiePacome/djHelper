import { Component, input, output, signal } from '@angular/core';
import { CueMarker, SetTrack } from '../../interfaces/set-track';

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
  public readonly seekRequested = output<number>();
  public readonly isExpanded = signal(false);

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
}
