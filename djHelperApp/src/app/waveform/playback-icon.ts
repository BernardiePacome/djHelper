import { Component, computed, input } from '@angular/core';

type PlaybackIconName = 'play' | 'pause' | 'previous' | 'next';

@Component({
  selector: 'app-playback-icon',
  standalone: true,
  template: `
    <img [src]="src()" alt="" aria-hidden="true" />
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      img {
        display: block;
        width: 20px;
        height: 20px;
      }
    `
  ]
})
export class PlaybackIcon {
  private readonly assets: Record<PlaybackIconName, string> = {
    play: '/assets/icons/play.svg',
    pause: '/assets/icons/pause.svg',
    previous: '/assets/icons/previous.svg',
    next: '/assets/icons/next.svg'
  };

  public readonly name = input.required<PlaybackIconName>();
  public readonly src = computed(() => this.assets[this.name()]);
}
