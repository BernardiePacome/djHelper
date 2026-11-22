import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { PlaybackOptionsService } from '../options-panel/playback-options.service';
import { isSameFile } from '../../helpers/same-file/same-file';
import { ActivePlayer } from './active-player';
import { analyzeMp3 } from './mp3-waveform';
import { PlaybackIcon } from './playback-icon';
import { TrackTooltipText } from './track-tooltip-text';
import type { CueMarker, PositionedCueMarker } from '../../interfaces/set-track';

@Component({
  selector: 'app-waveform',
  standalone: true,
  imports: [PlaybackIcon, TrackTooltipText],
  templateUrl: './waveform.html',
  styleUrl: './waveform.scss',
})
export class Waveform {
  // Constructor
  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.loadId++;
      this.fadeId++;
      this.stopPlaybackFrame();
      this.revokeAudioSource();
    });

    effect(() => {
      const file = this.file();
      untracked(() => void this.loadWaveform(file));
    });

    effect(() => {
      const activeId = this.activePlayer.activeId();
      const audio = this.audioPlayer()?.nativeElement;
      if (activeId !== this.clipId && audio && !audio.paused) {
        untracked(() => void this.fadeOutAndPause(audio));
      }
    });
  }
  protected readonly playbackOptions = inject(PlaybackOptionsService);
  private readonly activePlayer = inject(ActivePlayer);
  private readonly audioPlayer = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  private fadeId = 0;
  // Constants
  private readonly tooltipSeparationThreshold = 36;
  private readonly barCount = 400;
  private readonly previousCueLeadSeconds = 2;
  private static nextInstanceId = 0;
  protected readonly clipId = `waveform-clip-${Waveform.nextInstanceId++}`;
  // Inputs
  public readonly file = input.required<File>();
  public readonly trackMarkers = input<CueMarker[]>([]);
  public readonly canSave = input(false);
  public readonly isSaving = input(false);
  public readonly isSaved = input(false);
  public readonly saveRequested = output<void>();
  // Signals
  private readonly hoveredMarker = signal<PositionedCueMarker | null>(null);
  private loadId = 0;
  private currentAudioUrl: string | null = null;
  public readonly activeFile = signal<File | null>(null);
  private playbackFrameId: number | null = null;
  private readonly pinnedMarker = signal<PositionedCueMarker | null>(null);

  // The current player keeps running while a new file is analyzed; it is only swapped once decoding succeeds.
  private async loadWaveform(file: File): Promise<void> {
    const loadId = ++this.loadId;
    this.errorMessage.set('');

    const activeFile = this.activeFile();
    if (activeFile && isSameFile(activeFile, file)) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      let analysis: { peaks: number[]; duration: number } | null;
      if (/\.mp3$/i.test(file.name)) {
        analysis = await analyzeMp3(file, this.barCount, () => loadId === this.loadId);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        if (loadId !== this.loadId) {
          return;
        }

        const audioContext = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        if (
          channelData.length === 0 ||
          !Number.isFinite(audioBuffer.duration) ||
          audioBuffer.duration <= 0
        ) {
          throw new Error('Audio contains no samples');
        }
        analysis = {
          peaks: this.extractPeaks(channelData, this.barCount),
          duration: audioBuffer.duration,
        };
      }
      if (!analysis || loadId !== this.loadId) {
        return;
      }

      const audioUrl = URL.createObjectURL(file);
      this.stopPlaybackFrame();
      this.revokeAudioSource();
      this.currentAudioUrl = audioUrl;
      this.audioSource.set(this.currentAudioUrl);
      this.activeFile.set(file);
      this.isPlaying.set(false);
      this.currentTime.set(0);
      this.playbackError.set('');
      this.duration.set(analysis.duration);
      this.peaks.set(analysis.peaks);
    } catch (error) {
      if (loadId === this.loadId) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.errorMessage.set(`Unable to load ${file.name}: ${errorMsg}`);
      }
    } finally {
      if (loadId === this.loadId) {
        this.isLoading.set(false);
      }
    }
  }

  private extractPeaks(channelData: Float32Array, barCount: number): number[] {
    const peaks: number[] = [];
    const count = Math.min(channelData.length, barCount);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const start = Math.floor((i * channelData.length) / count);
      const end = Math.floor(((i + 1) * channelData.length) / count);
      for (let j = start; j < end; j++) {
        sum += channelData[j] * channelData[j];
      }
      peaks.push(Math.sqrt(sum / (end - start)));
    }
    const max = Math.max(...peaks, Number.EPSILON);
    return peaks.map((p) => p / max);
  }

  // Ramps the element volume; a newer fade cancels an older one. Resolves false when superseded.
  private async fadeTo(audio: HTMLAudioElement, target: number): Promise<boolean> {
    const fadeId = ++this.fadeId;
    const durationMs = this.playbackOptions.fadeSeconds() * 1000;
    const start = audio.volume;

    if (durationMs <= 0 || start === target) {
      audio.volume = target;
      return true;
    }

    const startedAt = performance.now();
    while (true) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (fadeId !== this.fadeId) {
        return false;
      }
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      audio.volume = start + (target - start) * progress;
      if (progress >= 1) {
        return true;
      }
    }
  }

  private async fadeIn(audio: HTMLAudioElement): Promise<void> {
    if (this.playbackOptions.fadeSeconds() > 0) {
      audio.volume = 0;
    }
    await this.fadeTo(audio, 1);
  }

  private async fadeOutAndPause(audio: HTMLAudioElement): Promise<void> {
    if (await this.fadeTo(audio, 0)) {
      audio.pause();
      audio.volume = 1;
    }
  }

  private revokeAudioSource(): void {
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  private formatTime(time: number): string {
    const totalSeconds = Math.floor(time);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private updatePlaybackFrame(audio: HTMLAudioElement): void {
    this.currentTime.set(audio.currentTime);
    if (audio.paused || audio.ended) {
      this.onAudioPause();
      return;
    }

    this.playbackFrameId = requestAnimationFrame(() => this.updatePlaybackFrame(audio));
  }

  private stopPlaybackFrame(): void {
    if (this.playbackFrameId !== null) {
      cancelAnimationFrame(this.playbackFrameId);
      this.playbackFrameId = null;
    }
  }

  public readonly audioSource = signal('');
  public readonly isLoading = signal(true);
  public readonly isPlaying = signal(false);
  public readonly errorMessage = signal('');
  public readonly playbackError = signal('');
  public readonly duration = signal(0);
  public readonly currentTime = signal(0);
  public readonly peaks = signal<number[]>([]);

  // Computed
  public readonly playbackPosition = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 1200 : 0,
  );

  public readonly hasPreviousCue = computed(() =>
    this.visibleTrackMarkers().some((marker) => marker.time < this.currentTime()),
  );

  public readonly hasNextCue = computed(() =>
    this.visibleTrackMarkers().some((marker) => marker.time > this.currentTime()),
  );

  public readonly formattedCurrentTime = computed(() => this.formatTime(this.currentTime()));

  public readonly formattedDuration = computed(() => {
    return this.formatTime(this.duration());
  });

  // The viewBox is 1200x100: bars rise from a baseline at y=70 and a shorter, dimmer reflection hangs below it.
  public readonly mainBarsPath = computed(() => this.barsPath(-66, 70));
  public readonly reflectionBarsPath = computed(() => this.barsPath(28, 71));

  private barsPath(maxHeight: number, baseline: number): string {
    const peaks = this.peaks();
    if (peaks.length === 0) {
      return '';
    }
    const columnWidth = 1200 / peaks.length;
    const width = Math.max(0.5, columnWidth * 0.66);
    const rises = maxHeight < 0;
    return peaks
      .map((peak, index) => {
        const height = Math.max(1, peak * Math.abs(maxHeight));
        const y = rises ? baseline - height : baseline;
        return `M${index * columnWidth} ${y}h${width}v${height}h-${width}z`;
      })
      .join('');
  }

  public readonly visibleTrackMarkers = computed(() =>
    this.duration() > 0
      ? this.trackMarkers()
          .map((marker, index) => ({ ...marker, index, x: (marker.time / this.duration()) * 1200 }))
          .filter(
            (marker) =>
              Number.isFinite(marker.time) && marker.time >= 0 && marker.time <= this.duration(),
          )
      : [],
  );

  public readonly activeTooltipMarkers = computed(() => {
    const activeMarker = this.hoveredMarker() ?? this.pinnedMarker();
    if (!activeMarker) {
      return [];
    }

    const nearbyMarker = this.visibleTrackMarkers()
      .filter((marker) => marker.index !== activeMarker.index)
      .map((marker) => ({ marker, distance: Math.abs(marker.x - activeMarker.x) }))
      .filter(({ distance }) => distance <= this.tooltipSeparationThreshold)
      .sort((first, second) => first.distance - second.distance)[0]?.marker;

    if (!nearbyMarker) {
      return [{ marker: activeMarker, position: 'top' as const }];
    }

    const [firstMarker, nextMarker] =
      activeMarker.index <= nearbyMarker.index
        ? [activeMarker, nearbyMarker]
        : [nearbyMarker, activeMarker];

    return [
      { marker: firstMarker, position: 'top' as const },
      { marker: nextMarker, position: 'bottom' as const },
    ];
  });

  public showMarkerTooltip(marker: PositionedCueMarker): void {
    this.hoveredMarker.set(marker);
  }

  public hideMarkerTooltip(): void {
    this.hoveredMarker.set(null);
  }

  public togglePinnedMarker(marker: PositionedCueMarker): void {
    this.pinnedMarker.update((pinnedMarker) =>
      pinnedMarker?.index === marker.index ? null : marker,
    );
  }

  public seekAudio(event: MouseEvent, audio: HTMLAudioElement): void {
    const waveform = event.currentTarget as SVGSVGElement;
    const bounds = waveform.getBoundingClientRect();
    if (bounds.width === 0 || !Number.isFinite(audio.duration)) {
      return;
    }

    const progress = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    audio.currentTime = progress * audio.duration;
    this.currentTime.set(audio.currentTime);
    this.pinnedMarker.set(null);
  }

  public async togglePlayback(audio: HTMLAudioElement): Promise<void> {
    this.playbackError.set('');
    if (!audio.paused) {
      await this.fadeOutAndPause(audio);
      return;
    }

    try {
      if (this.playbackOptions.fadeSeconds() > 0) {
        audio.volume = 0;
      }
      await audio.play();
      void this.fadeTo(audio, 1);
    } catch (error) {
      this.playbackError.set(
        error instanceof Error
          ? `Unable to play audio: ${error.message}`
          : 'Unable to play this audio file.',
      );
    }
  }

  public onAudioTimeUpdate(audio: HTMLAudioElement): void {
    this.currentTime.set(audio.currentTime);
  }

  public onAudioPlay(audio: HTMLAudioElement): void {
    this.activePlayer.activeId.set(this.clipId);
    this.isPlaying.set(true);
    this.updatePlaybackFrame(audio);
  }

  public onAudioPause(): void {
    this.isPlaying.set(false);
    this.stopPlaybackFrame();
  }

  public async seekToTime(time: number): Promise<void> {
    const audio = this.audioPlayer()?.nativeElement;
    if (!audio || !Number.isFinite(time) || time < 0 || time > this.duration()) {
      return;
    }
    await this.seekToPosition(audio, time);
  }

  private async seekToPosition(audio: HTMLAudioElement, time: number): Promise<void> {
    const wasPlaying = !audio.paused;
    if (wasPlaying && !(await this.fadeTo(audio, 0))) {
      return;
    }
    audio.currentTime = time;
    this.currentTime.set(audio.currentTime);
    this.pinnedMarker.set(null);
    if (wasPlaying) {
      await this.fadeIn(audio);
    }
  }

  public async skipToCue(audio: HTMLAudioElement, direction: 'previous' | 'next'): Promise<void> {
    if (!Number.isFinite(audio.duration)) {
      return;
    }

    const currentTime = audio.currentTime;
    const target = this.visibleTrackMarkers()
      .map((marker) => marker.time)
      .filter((time) => (direction === 'next' ? time > currentTime : time < currentTime))
      .sort((first, second) => (direction === 'next' ? first - second : second - first))[0];

    if (target !== undefined) {
      await this.seekToPosition(
        audio,
        direction === 'previous' ? Math.max(0, target - this.previousCueLeadSeconds) : target,
      );
    }
  }

  public onAudioEnded(): void {
    this.onAudioPause();
  }

  public onMarkerKeydown(event: KeyboardEvent, marker: PositionedCueMarker): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.togglePinnedMarker(marker);
    }
  }
}
