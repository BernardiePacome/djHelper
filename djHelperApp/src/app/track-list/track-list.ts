import { Component, input, signal } from '@angular/core';
import type { SetTrack } from '../interfaces/set-track';

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
  public readonly isExpanded = signal(false);

  public toggleExpanded(): void {
    this.isExpanded.update((expanded) => !expanded);
  }
}
