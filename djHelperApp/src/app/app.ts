import { Component, signal } from '@angular/core';
import { CueFileDropzone } from './cue-file-dropzone/cue-file-dropzone';
import { PlaylistOutput } from './playlist-output/playlist-output';
import { Waveform } from './waveform/waveform';
import type { SetTrack } from './set-track';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CueFileDropzone, PlaylistOutput, Waveform],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly fileName = signal('');
  readonly errorMessage = signal('');
  readonly playlist = signal<SetTrack[]>([]);
  readonly audioFile = signal<File | null>(null);
  readonly trackMarkers = signal<number[]>([]);

  public onFilesSelected(files: File[]): void {
    const cueFile = files.find((file) => /\.(cue|txt)$/i.test(file.name));
    const audioFiles = files.filter((file) =>
      /\.(wav|mp3|aiff|aif|flac|ogg|m4a|aac|opus|wma)$/i.test(file.name)
    );

    if (!cueFile && audioFiles.length > 0) {
      this.audioFile.set(audioFiles[0]);
      this.errorMessage.set('');
      return;
    }

    if (!cueFile) {
      this.errorMessage.set('Choose a .cue, .mp3, or .wav file.');
      return;
    }

    this.readFile(cueFile)
      .then((content) => {
        const currentAudio = this.audioFile();
        const availableAudioFiles = currentAudio ? [...audioFiles, currentAudio] : audioFiles;
        this.audioFile.set(this.findAudioFile(availableAudioFiles, content));
        this.processCueFile(cueFile.name, content);
      })
      .catch(() => {
        this.errorMessage.set(`Unable to read ${cueFile.name}`);
      });
  }

  public clearPlaylist(): void {
    this.playlist.set([]);
    this.fileName.set('');
    this.errorMessage.set('');
    this.audioFile.set(null);
    this.trackMarkers.set([]);
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsText(file);
    });
  }

  private findAudioFile(files: File[], cueText: string): File | null {
    const cueAudioName = cueText.match(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/im);
    const referencedName = (cueAudioName?.[1] ?? cueAudioName?.[2])
      ?.split(/[\\/]/)
      .pop()
      ?.toLocaleLowerCase();

    if (referencedName) {
      const matchedFile = files.find((file) => file.name.toLocaleLowerCase() === referencedName);
      if (matchedFile) {
        return matchedFile;
      }
    }

    return files.length === 1 ? files[0] : null;
  }

  private processCueFile(fileName: string, cueText: string): void {
    const tracks: SetTrack[] = [];
    let currentTrack: Partial<SetTrack> | undefined;

    for (const line of cueText.split(/\r?\n/)) {
      const trackStart = line.match(/^\s*TRACK\s+\d+\s+/i);
      if (trackStart) {
        if (currentTrack?.title && currentTrack.playTime) {
          tracks.push({
            title: currentTrack.title,
            artist: currentTrack.artist ?? 'Unknown',
            playTime: currentTrack.playTime
          });
        }
        currentTrack = {};
        continue;
      }

      if (!currentTrack) {
        continue;
      }

      const title = line.match(/^\s*TITLE\s+"(.*)"/i);
      const artist = line.match(/^\s*PERFORMER\s+"(.*)"/i);
      const index = line.match(/^\s*INDEX\s+01\s+(\S+)/i);

      if (title) {
        currentTrack.title = title[1];
      } else if (artist) {
        currentTrack.artist = artist[1];
      } else if (index) {
        currentTrack.playTime = index[1];
      }
    }

    if (currentTrack?.title && currentTrack.playTime) {
      tracks.push({
        title: currentTrack.title,
        artist: currentTrack.artist ?? 'Unknown',
        playTime: currentTrack.playTime
      });
    }

    if (tracks.length === 0) {
      this.errorMessage.set('Please check the cue file for missing field');
      return;
    }

    this.trackMarkers.set(tracks.map((track) => this.cueTimeToSeconds(track.playTime)));

    const lastTrackTime = tracks[tracks.length - 1].playTime;
    const removeLeadingZeroMinutes = lastTrackTime.split(':')[0] === '00';
    const parsedTracks = tracks.map((track) => ({
      ...track,
      playTime: removeLeadingZeroMinutes ? track.playTime.substring(3) : track.playTime
    }));

    this.playlist.set(this.dedupeTracks(parsedTracks));
    this.fileName.set(fileName);
    this.errorMessage.set('');
  }

  private dedupeTracks(tracks: SetTrack[]): SetTrack[] {
    const uniqueTracks: SetTrack[] = [];

    for (const track of tracks) {
      const isDuplicate = uniqueTracks.some(
        (existingTrack) => existingTrack.title === track.title && existingTrack.artist === track.artist
      );

      if (!isDuplicate) {
        uniqueTracks.push(track);
      }
    }

    return uniqueTracks;
  }

  private cueTimeToSeconds(timestamp: string): number {
    const parts = timestamp.split(':').map(Number);
    if (parts.some((part) => !Number.isFinite(part))) {
      return Number.NaN;
    }

    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours * 3600 + minutes * 60 + seconds;
    }

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes * 60 + seconds;
    }

    return Number.NaN;
  }
}
