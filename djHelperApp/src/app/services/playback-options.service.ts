import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlaybackOptionsService {
  public readonly waveformColors = [
    { name: 'Cyan blue', value: '#00d0ff' },
    { name: 'Magenta', value: '#ff00fb' },
    { name: 'Orange', value: '#ff8c1a' },
  ] as const;
  public readonly waveformColor = signal<string>('#ff00fb');
  public readonly maxCrossfadeDuration = 5;
  public readonly crossfadeDuration = signal(2);
  public readonly crossfadeMs = computed(() => this.crossfadeDuration() * 1000);
}
