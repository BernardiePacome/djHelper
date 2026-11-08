import { Component, computed, input } from '@angular/core';
import type { CueMarker } from '../set-track';

interface IndexedCueMarker extends CueMarker {
  index: number;
}

@Component({
  selector: 'app-track-tooltip-text',
  standalone: true,
  template: '{{ formattedText() }}'
})
export class TrackTooltipText {
  public readonly marker = input.required<IndexedCueMarker>();
  public readonly formattedText = computed(() => {
    const marker = this.marker();
    return `${marker.index + 1}. ${marker.artist} - ${marker.title}`;
  });
}
