import { Component, computed, inject, signal } from '@angular/core';
import { parseCueTracks } from '../helpers/cue-parser/cue-parser';
import { isMockFileArray } from '../helpers/is-mock-file-array/is-mock-file-array';
import { CueFileDropzone } from '../components/cue-file-dropzone/cue-file-dropzone';
import { LoadingIndicator } from '../components/loading-indicator/loading-indicator';
import { OptionsPanel } from '../components/options-panel/options-panel';
import { PlaylistOutput } from '../components/playlist-output/playlist-output';
import { SavedSets } from '../components/saved-sets/saved-sets';
import { SavedSetsService } from '../services/saved-sets.service/saved-sets.service';
import { SearchBar } from '../components/search-bar/search-bar';
import { StartupInfo } from '../components/startup-info/startup-info';
import { TrackList } from '../components/track-list/track-list';
import { Waveform } from '../components/waveform/waveform/waveform';
import { isSameAudio } from '../helpers/same-file/same-file';
import { isMockModeUrl } from '../../mocks/mock-mode';
import { LoadedMix } from '../interfaces/loaded-mix';
import { ParsedCue } from '../interfaces/parsed-cue';
import { LoadedSet } from '../interfaces/saved-set';
import { SetTrack } from '../interfaces/set-track';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CueFileDropzone,
    LoadingIndicator,
    OptionsPanel,
    PlaylistOutput,
    SavedSets,
    SearchBar,
    StartupInfo,
    TrackList,
    Waveform,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  public readonly isMockMode = isMockModeUrl(new URL(location.href));
  public readonly errorMessage = signal('');
  // Newest first. Each mix keeps its own player, so loading another one never interrupts playback.
  public readonly loadedMixes = signal<LoadedMix[]>([]);
  public readonly loadedSetIds = computed(() =>
    this.loadedMixes().flatMap((mix) => (mix.savedSetId === null ? [] : [mix.savedSetId])),
  );

  public readonly hasAudio = computed(() => this.loadedMixes().some((mix) => mix.audioFile));
  public readonly isLoadingMockFiles = signal(false);
  public readonly isLoadingFiles = signal(false);
  public readonly savedSetsReady = computed(() => this.savedSets.status() === 'ready');
  public readonly loadedSetsList = computed(() => this.savedSets.sets());

  private readonly savedSets = inject(SavedSetsService);
  private nextMixId = 0;

  public canSaveMix(mix: LoadedMix): boolean {
    return (
      mix.cueFile !== null &&
      mix.audioFile !== null &&
      mix.playlist.length > 0 &&
      this.savedSets.status() === 'ready'
    );
  }

  public isMixedSaved(mix: LoadedMix): boolean {
    const id = mix.savedSetId;
    return id !== null && this.savedSets.sets().some((set) => set.id === id);
  }

  // Only audio stored on the server has a waveform cache; browser-local fallback sets do not.
  public cacheFileId(mix: LoadedMix): string | null {
    const id = this.savedSets.sets().find((set) => set.id === mix.savedSetId)?.audio.id ?? null;
    return id !== null && !id.startsWith('local-') ? id : null;
  }

  public removeMix(mixId: number): void {
    this.loadedMixes.update((mixes) => mixes.filter((mix) => mix.id !== mixId));
  }

  public async onFilesSelected(files: File[], savedSetId: string | null = null): Promise<void> {
    this.isLoadingFiles.set(true);
    this.errorMessage.set('');
    const cueFile = files.find((file) => /\.(cue|txt)$/i.test(file.name));
    const audioFiles = files.filter((file) =>
      /\.(wav|mp3|aiff|aif|flac|ogg|m4a|aac|opus|wma)$/i.test(file.name),
    );

    if (!cueFile && audioFiles.length > 0) {
      this.upsertMix(audioFiles[0], null, null, savedSetId);
      this.isLoadingFiles.set(false);
      return;
    }

    if (!cueFile) {
      this.errorMessage.set('Choose a .cue, .mp3, or .wav file.');
      this.isLoadingFiles.set(false);
      return;
    }

    try {
      const content = await this.readFile(cueFile);
      const audioFile = this.findAudioFile(audioFiles, content);
      const cue = this.processCueFile(content);
      this.upsertMix(audioFile, cueFile, cue, savedSetId);
    } catch {
      this.errorMessage.set(`Unable to read ${cueFile.name}`);
    } finally {
      this.isLoadingFiles.set(false);
    }
  }

  public async saveSet(mixId: number): Promise<void> {
    const mix = this.loadedMixes().find((candidate) => candidate.id === mixId);
    if (!mix?.cueFile || !mix.audioFile || mix.isSaving) {
      return;
    }

    const { cueFile, audioFile } = mix;

    this.patchMix(mixId, { isSaving: true });
    this.errorMessage.set('');

    try {
      const set = await this.savedSets.save(
        cueFile.name.replace(/\.[^.]+$/, ''),
        cueFile,
        audioFile,
      );
      // Ignore the result if the mix was removed or given other files while the upload was running.
      this.loadedMixes.update((mixes) =>
        mixes.map((candidate) =>
          candidate.id === mixId &&
          candidate.cueFile === cueFile &&
          candidate.audioFile === audioFile
            ? { ...candidate, savedSetId: set.id }
            : candidate,
        ),
      );
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage.set(`Unable to save set: ${details}`);
    } finally {
      this.patchMix(mixId, { isSaving: false });
    }
  }

  public async onSavedSetLoaded({ set, files }: LoadedSet): Promise<void> {
    if (!this.loadedMixes().some((mix) => mix.savedSetId === set.id)) {
      await this.onFilesSelected(files, set.id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  public async loadMockFiles(): Promise<void> {
    this.isLoadingMockFiles.set(true);
    this.isLoadingFiles.set(true);
    this.errorMessage.set('');

    try {
      const manifestResponse = await fetch('/api/mock-files');
      if (!manifestResponse.ok) {
        throw new Error(`Mock manifest request failed (${manifestResponse.status})`);
      }

      const manifest: unknown = await manifestResponse.json();
      if (!isMockFileArray(manifest)) {
        throw new Error('Mock manifest has an invalid format');
      }

      const files = await Promise.all(
        manifest.files.map(async ({ name, url, type }) => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Unable to load ${name} (${response.status})`);
          }

          return new File([await response.blob()], name, { type });
        }),
      );

      await this.onFilesSelected(files);
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage.set(`Unable to load mock files: ${details}`);
    } finally {
      this.isLoadingFiles.set(false);
      this.isLoadingMockFiles.set(false);
    }
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsText(file);
    });
  }

  private findAudioFile(droppedAudio: File[], cueText: string): File | null {
    const loadedAudio = this.loadedMixes().flatMap((mix) => (mix.audioFile ? [mix.audioFile] : []));
    const cueAudioName = cueText.match(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/im);
    const referencedName = (cueAudioName?.[1] ?? cueAudioName?.[2])
      ?.split(/[\\/]/)
      .pop()
      ?.toLocaleLowerCase();

    if (referencedName) {
      const matchedFile = [...droppedAudio, ...loadedAudio].find(
        (file) => file.name.toLocaleLowerCase() === referencedName,
      );
      if (matchedFile) {
        return matchedFile;
      }
    }

    const candidates = droppedAudio.length > 0 ? droppedAudio : loadedAudio;
    return candidates.length === 1 ? candidates[0] : null;
  }

  private processCueFile(cueText: string): ParsedCue | null {
    const tracks = parseCueTracks(cueText);

    if (tracks.length === 0) {
      this.errorMessage.set('Please check the cue file for missing field');
      return null;
    }

    const trackMarkers = tracks.map((track) => ({
      time: this.cueTimeToSeconds(track.playTime),
      title: track.title,
      artist: track.artist,
    }));

    const lastTrackTime = tracks[tracks.length - 1].playTime;
    const removeLeadingZeroMinutes = lastTrackTime.split(':')[0] === '00';
    const parsedTracks = tracks.map((track) => ({
      ...track,
      playTime: removeLeadingZeroMinutes ? track.playTime.substring(3) : track.playTime,
    }));

    return { playlist: this.dedupeTracks(parsedTracks), trackMarkers };
  }

  private dedupeTracks(tracks: SetTrack[]): SetTrack[] {
    const uniqueTracks: SetTrack[] = [];

    for (const track of tracks) {
      const isDuplicate = uniqueTracks.some(
        (existingTrack) =>
          existingTrack.title === track.title && existingTrack.artist === track.artist,
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

  // Reuses the mix that already holds this audio so its player keeps going when a cue is added.
  private upsertMix(
    audioFile: File | null,
    cueFile: File | null,
    cue: ParsedCue | null,
    savedSetId: string | null,
  ): void {
    const existing = audioFile
      ? this.loadedMixes().find((mix) => mix.audioFile && isSameAudio(mix.audioFile, audioFile))
      : undefined;

    if (existing) {
      if (cue) {
        this.loadedMixes.update((mixes) =>
          mixes.map((mix) =>
            mix.id === existing.id
              ? { ...mix, cueFile, ...cue, savedSetId: savedSetId ?? mix.savedSetId }
              : mix,
          ),
        );
      }
      return;
    }

    if (!audioFile && !cue) {
      return;
    }

    const mix: LoadedMix = {
      id: this.nextMixId++,
      audioFile,
      cueFile: cue ? cueFile : null,
      playlist: cue?.playlist ?? [],
      trackMarkers: cue?.trackMarkers ?? [],
      savedSetId: cue ? savedSetId : null,
      isSaving: false,
    };
    this.loadedMixes.update((mixes) => [mix, ...mixes]);
  }

  private patchMix(mixId: number, changes: Partial<LoadedMix>): void {
    this.loadedMixes.update((mixes) =>
      mixes.map((mix) => (mix.id === mixId ? { ...mix, ...changes } : mix)),
    );
  }
}
