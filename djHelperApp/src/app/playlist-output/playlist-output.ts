import { Component, computed, input } from '@angular/core';
import type { SetTrack } from '../set-track';

@Component({
  selector: 'app-playlist-output',
  standalone: true,
  templateUrl: './playlist-output.html',
  styleUrl: './playlist-output.scss'
})
export class PlaylistOutput {

  readonly tracks = input.required<SetTrack[]>();

  readonly formattedText = computed(() =>
    this.tracks()
      .map((track, index) => `${index + 1}: ${track.artist} - ${track.title} - ${track.playTime}`)
      .join('\n')
  );

  public async copyPlaylist(): Promise<void> {
    const playlistText = this.formattedText();
    if (!playlistText) {
      return;
    }

    const textArea = document.createElement('textarea');

    textArea.value = playlistText;
    textArea.setAttribute('readonly', 'true');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.select();

    try {
      await navigator.clipboard.writeText(playlistText);
    } catch {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
