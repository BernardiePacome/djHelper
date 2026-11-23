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
import { ElementRef } from '@angular/core';
import { WaveformCache, WaveformData } from '../../../services/waveform-cache/waveform-cache';
import { PlaybackOptionsService } from '../../../services/playback-options.service/playback-options.service';
import { isSameFile } from '../../../helpers/same-file/same-file';
import { ActivePlayerService } from '../../../services/active-player-service/active-player-service';
import { analyzeMp3 } from '../mp3-waveform/mp3-waveform';
import { PlaybackIcon } from '../playback-buttons/playback-icon';
import { TrackTooltipText } from '../track-tooltip-text/track-tooltip-text';
import { CueMarker, PositionedCueMarker } from '../../../interfaces/set-track';

interface SeekFade {
  outgoing: HTMLAudioElement;
  stop: () => void;
}

// Fades run on timers, not animation frames: browsers stop frames for tabs that are not being painted,
// which would freeze a crossfade halfway.
const FADE_TICK_MS = 10;

function runRamp(durationMs: number, onProgress: (progress: number) => void): () => void {
  const startTime = performance.now();
  const timer = setInterval(() => {
    const progress = Math.min(1, (performance.now() - startTime) / durationMs);
    onProgress(progress);
    if (progress >= 1) {
      clearInterval(timer);
    }
  }, FADE_TICK_MS);
  return () => clearInterval(timer);
}

@Component({
  selector: 'app-waveform',
  standalone: true,
  imports: [PlaybackIcon, TrackTooltipText],
  templateUrl: './waveform.html',
  styleUrl: './waveform.scss',
})
export class Waveform {
  protected readonly playbackOptions = inject(PlaybackOptionsService);
  private readonly activePlayers = inject(ActivePlayerService);
  private readonly waveformCache = inject(WaveformCache);
  private cachedFileId: string | null = null;
  private readonly audioPlayer = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  // Constants
  private readonly tooltipSeparationThreshold = 36;
  private readonly barCount = 400;
  private readonly previousCueLeadSeconds = 2;
  private static nextInstanceId = 0;
  protected readonly clipId = `waveform-clip-${Waveform.nextInstanceId++}`;
  // Inputs
  public readonly file = input.required<File>();
  public readonly trackMarkers = input<CueMarker[]>([]);
  // Id of the saved audio file on the server, which caches its waveform.
  public readonly cacheFileId = input<string | null>(null);
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
  private readonly seekFades = new Set<SeekFade>();
  private stopMainFade: (() => void) | null = null;
  private readonly pinnedMarker = signal<PositionedCueMarker | null>(null);

  // Constructor
  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.loadId++;
      this.stopPlaybackFrame();
      this.cancelVolumeFades();
      this.activePlayers.deactivate(this.clipId);
      this.revokeAudioSource();
    });

    effect(() => {
      const file = this.file();
      untracked(() => void this.loadWaveform(file));
    });

    // A set saved after its waveform was analyzed uploads that waveform to the server cache.
    effect(() => {
      const cacheId = this.cacheFileId();
      untracked(() => {
        const activeFile = this.activeFile();
        if (
          cacheId &&
          cacheId !== this.cachedFileId &&
          activeFile &&
          isSameFile(activeFile, this.file()) &&
          this.peaks().length > 0
        ) {
          this.cachedFileId = cacheId;
          void this.waveformCache.store(cacheId, {
            peaks: this.peaks(),
            duration: this.duration(),
          });
        }
      });
    });
  }

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
      const cacheId = this.cacheFileId();
      const cached = cacheId ? await this.waveformCache.load(cacheId) : null;
      const analysis = cached ?? (await this.analyzeFile(file, loadId));
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
      if (cacheId && cacheId !== this.cachedFileId) {
        this.cachedFileId = cacheId;
        if (!cached) {
          void this.waveformCache.store(cacheId, analysis);
        }
      }
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

  private async analyzeFile(file: File, loadId: number): Promise<WaveformData | null> {
    if (/\.mp3$/i.test(file.name)) {
      return analyzeMp3(file, this.barCount, () => loadId === this.loadId);
    }

    const arrayBuffer = await file.arrayBuffer();
    if (loadId !== this.loadId) {
      return null;
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
    return {
      peaks: this.extractPeaks(channelData, this.barCount),
      duration: audioBuffer.duration,
    };
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
      audio.pause();
      this.onAudioPause();
      return;
    }

    try {
      await audio.play();
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
    this.cancelVolumeFades();
    audio.volume = 1;
    // Starting a player fades the others out while this one fades in.
    const crossfading = this.activePlayers.activate(this.clipId, () => this.fadeOutAndPause());
    if (crossfading) {
      this.fadeVolume(audio, 0, 1, () => undefined);
    }
    this.isPlaying.set(true);
    this.updatePlaybackFrame(audio);
  }

  public onAudioPause(): void {
    this.cancelVolumeFades();
    this.activePlayers.deactivate(this.clipId);
    this.isPlaying.set(false);
    this.stopPlaybackFrame();
  }

  public async seekToTime(time: number): Promise<void> {
    const audio = this.audioPlayer()?.nativeElement;
    if (!audio || !Number.isFinite(time) || time < 0 || time > this.duration()) {
      return;
    }
    await this.seekToPosition(audio, time, false);
  }

  // Only the Previous/Next Transition buttons crossfade; clicks on the waveform or the playlist jump directly.
  private async seekToPosition(
    audio: HTMLAudioElement,
    time: number,
    crossfade = true,
  ): Promise<void> {
    const durationMs = this.playbackOptions.crossfadeMs();
    if (crossfade && !audio.paused && durationMs > 0 && this.currentAudioUrl) {
      this.startSeekCrossfade(audio, time, durationMs);
    } else {
      this.cancelVolumeFades();
      audio.volume = 1;
      audio.currentTime = time;
    }
    this.currentTime.set(audio.currentTime);
    this.pinnedMarker.set(null);
  }

  // A (the old position) keeps playing on a temporary copy of the track and fades out linearly
  // while B (the player, moved to the target) fades in linearly.
  private startSeekCrossfade(audio: HTMLAudioElement, time: number, durationMs: number): void {
    const startVolume = audio.volume;
    const outgoing = new Audio(this.currentAudioUrl as string);
    outgoing.currentTime = audio.currentTime;
    outgoing.volume = startVolume;
    try {
      void Promise.resolve(outgoing.play()).catch(() => undefined);
    } catch {
      // The incoming player still fades in if the outgoing copy cannot play.
    }

    this.cancelMainFade();
    audio.currentTime = time;
    this.fadeVolume(audio, 0, 1, () => undefined);

    const fade: SeekFade = { outgoing, stop: () => undefined };
    this.seekFades.add(fade);
    fade.stop = runRamp(durationMs, (progress) => {
      outgoing.volume = startVolume * (1 - progress);
      if (progress >= 1) {
        this.endSeekFade(fade);
      }
    });
  }

  private fadeOutAndPause(): void {
    const audio = this.audioPlayer()?.nativeElement;
    if (!audio || audio.paused) {
      return;
    }
    this.fadeVolume(audio, audio.volume, 0, () => {
      audio.pause();
      audio.volume = 1;
    });
  }

  private fadeVolume(audio: HTMLAudioElement, from: number, to: number, onDone: () => void): void {
    this.cancelMainFade();
    const durationMs = this.playbackOptions.crossfadeMs();
    if (durationMs <= 0) {
      audio.volume = to;
      onDone();
      return;
    }

    audio.volume = from;
    this.stopMainFade = runRamp(durationMs, (progress) => {
      audio.volume = from + (to - from) * progress;
      if (progress >= 1) {
        this.stopMainFade = null;
        onDone();
      }
    });
  }

  private cancelMainFade(): void {
    this.stopMainFade?.();
    this.stopMainFade = null;
  }

  private cancelVolumeFades(): void {
    this.cancelMainFade();
    [...this.seekFades].forEach((fade) => this.endSeekFade(fade));
  }

  private endSeekFade(fade: SeekFade): void {
    fade.stop();
    fade.outgoing.pause();
    this.seekFades.delete(fade);
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

  public onAudioError(): void {
    this.playbackError.set('Unable to play this audio file.');
    this.onAudioPause();
  }

  public onMarkerKeydown(event: KeyboardEvent, marker: PositionedCueMarker): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.togglePinnedMarker(marker);
    }
  }
}
