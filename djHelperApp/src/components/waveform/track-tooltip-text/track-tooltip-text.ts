import { Component, computed, input } from '@angular/core';
import { IndexedCueMarker } from '../../../interfaces/set-track';

@Component({
  selector: 'app-track-tooltip-text',
  standalone: true,
  templateUrl: './track-tooltip-text.html',
  styleUrl: './track-tooltip-text.scss',
})
export class TrackTooltipText {
  public readonly marker = input.required<IndexedCueMarker>();
  public readonly formattedText = computed(() => {
    const marker = this.marker();
    return `${marker.index + 1}. ${marker.artist} - ${marker.title}`;
  });
}
