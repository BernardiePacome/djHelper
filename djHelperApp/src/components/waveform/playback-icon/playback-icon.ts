import { Component, computed, input } from '@angular/core';
import type { PlaybackIconName } from '../../interfaces/playback-icon';

@Component({
  selector: 'app-playback-icon',
  standalone: true,
  templateUrl: './playback-icon.html',
  styleUrl: './playback-icon.scss',
})
export class PlaybackIcon {
  private readonly assets: Record<PlaybackIconName, string> = {
    play: 'assets/icons/play.svg',
    pause: 'assets/icons/pause.svg',
    previous: 'assets/icons/previous.svg',
    next: 'assets/icons/next.svg',
  };
  private readonly labels: Record<PlaybackIconName, string> = {
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous Transition',
    next: 'Next Transition',
  };

  public readonly name = input.required<PlaybackIconName>();
  public readonly src = computed(() => this.assets[this.name()]);
  public readonly label = computed(() => this.labels[this.name()]);
}
