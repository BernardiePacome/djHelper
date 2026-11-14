import { Component, inject } from '@angular/core';
import { PlaybackOptionsService } from './playback-options.service';

@Component({
  selector: 'app-options-panel',
  standalone: true,
  templateUrl: './options-panel.html',
  styleUrl: './options-panel.scss'
})
export class OptionsPanel {
  protected readonly options = inject(PlaybackOptionsService);

  protected onFadeInput(event: Event): void {
    this.options.fadeSeconds.set(Number((event.target as HTMLInputElement).value));
  }
}
