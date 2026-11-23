import { Component, inject } from '@angular/core';
import { PlaybackOptionsService } from '../../services/playback-options.service/playback-options.service';

@Component({
  selector: 'app-options-panel',
  standalone: true,
  templateUrl: './options-panel.html',
  styleUrl: './options-panel.scss',
})
export class OptionsPanel {
  protected readonly options = inject(PlaybackOptionsService);

  protected onCrossfadeDurationInput(event: Event): void {
    this.options.crossfadeDuration.set(Number((event.target as HTMLInputElement).value));
  }
}
