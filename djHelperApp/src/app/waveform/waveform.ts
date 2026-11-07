import { Component, computed, effect, input, signal } from '@angular/core';
import type { CueMarker } from '../set-track';

interface PositionedCueMarker extends CueMarker {
  index: number;
  x: number;
}

@Component({
  selector: 'app-waveform',
  standalone: true,
  templateUrl: './waveform.html',
  styleUrl: './waveform.scss'
})
export class Waveform {
  private readonly tooltipSeparationThreshold = 36;
  private readonly hoveredMarker = signal<PositionedCueMarker | null>(null);
  private readonly pinnedMarker = signal<PositionedCueMarker | null>(null);

  readonly file = input.required<File>();
  readonly trackMarkers = input<CueMarker[]>([]);
  readonly audioSource = signal('');
  readonly isLoading = signal(true);
  readonly isPlaying = signal(false);
  readonly errorMessage = signal('');
  readonly playbackError = signal('');
  readonly duration = signal(0);
  readonly currentTime = signal(0);
  readonly peaks = signal<number[]>([]);
  readonly hasPreviousCue = computed(() =>
    this.visibleTrackMarkers().some((marker) => marker.time < this.currentTime())
  );
  readonly hasNextCue = computed(() =>
    this.visibleTrackMarkers().some((marker) => marker.time > this.currentTime())
  );
  readonly formattedCurrentTime = computed(() => this.formatTime(this.currentTime()));
  readonly formattedDuration = computed(() => {
    return this.formatTime(this.duration());
  });

  readonly waveformPath = computed(() => {
    const peaks = this.peaks();
    if (peaks.length === 0) {
      return '';
    }

    const columnWidth = 1200 / peaks.length;
    return peaks
      .map((peak, index) => {
        const x = index * columnWidth;
        const y = 50 - peak * 46;
        const height = Math.max(1, peak * 92);
        const width = Math.max(0.5, columnWidth * 0.72);
        return `M${x} ${y}v${height}h${width}v-${height}z`;
      })
      .join('');
  });
  readonly visibleTrackMarkers = computed(() =>
    this.duration() > 0
      ? this.trackMarkers()
          .map((marker, index) => ({ ...marker, index, x: (marker.time / this.duration()) * 1200 }))
          .filter((marker) => Number.isFinite(marker.time) && marker.time >= 0 && marker.time <= this.duration())
      : []
  );
  readonly activeTooltipMarkers = computed(() => {
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
      activeMarker.index <= nearbyMarker.index ? [activeMarker, nearbyMarker] : [nearbyMarker, activeMarker];

    return [
      { marker: firstMarker, position: 'top' as const },
      { marker: nextMarker, position: 'bottom' as const }
    ];
  });

  private loadId = 0;

  constructor() {
    effect((onCleanup) => {
      const source = URL.createObjectURL(this.file());
      this.audioSource.set(source);
      onCleanup(() => URL.revokeObjectURL(source));
    });

    effect(() => {
      void this.loadWaveform(this.file());
    });
  }

  public showMarkerTooltip(marker: PositionedCueMarker): void {
    this.hoveredMarker.set(marker);
  }

  public hideMarkerTooltip(): void {
    this.hoveredMarker.set(null);
  }

  public togglePinnedMarker(marker: PositionedCueMarker): void {
    this.pinnedMarker.update((pinnedMarker) => (pinnedMarker?.index === marker.index ? null : marker));
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
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      this.playbackError.set(
        error instanceof Error ? `Unable to play audio: ${error.message}` : 'Unable to play this audio file.'
      );
    }
  }

  public onAudioTimeUpdate(audio: HTMLAudioElement): void {
    this.currentTime.set(audio.currentTime);
  }

  public skipToCue(audio: HTMLAudioElement, direction: 'previous' | 'next'): void {
    if (!Number.isFinite(audio.duration)) {
      return;
    }

    const currentTime = audio.currentTime;
    const target = this.visibleTrackMarkers()
      .map((marker) => marker.time)
      .filter((time) => (direction === 'next' ? time > currentTime : time < currentTime))
      .sort((first, second) => (direction === 'next' ? first - second : second - first))[0];

    if (target !== undefined) {
      audio.currentTime = target;
      this.currentTime.set(target);
      this.pinnedMarker.set(null);
    }
  }

  public onAudioEnded(): void {
    this.isPlaying.set(false);
  }

  public onMarkerKeydown(event: KeyboardEvent, marker: PositionedCueMarker): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.togglePinnedMarker(marker);
    }
  }

  private async loadWaveform(file: File): Promise<void> {
    const loadId = ++this.loadId;
    this.isLoading.set(true);
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.playbackError.set('');
    this.errorMessage.set('');
    this.duration.set(0);
    this.peaks.set([]);

    let audioContext: AudioContext | undefined;

    try {
      audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

      if (loadId !== this.loadId) {
        return;
      }

      const samples = audioBuffer.getChannelData(0);
      const bucketSize = Math.max(1, Math.ceil(samples.length / 1200));
      const waveformPeaks: number[] = [];

      for (let start = 0; start < samples.length; start += bucketSize) {
        let peak = 0;
        const end = Math.min(start + bucketSize, samples.length);
        for (let index = start; index < end; index++) {
          peak = Math.max(peak, Math.abs(samples[index]));
        }
        waveformPeaks.push(peak);
      }

      this.peaks.set(waveformPeaks);
      this.duration.set(audioBuffer.duration);
    } catch {
      if (loadId === this.loadId) {
        this.errorMessage.set(`Unable to decode ${file.name}. Try a browser-supported audio format such as WAV, MP3, or AIFF.`);
      }
    } finally {
      if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
      }
      if (loadId === this.loadId) {
        this.isLoading.set(false);
      }
    }
  }

  private formatTime(time: number): string {
    const totalSeconds = Math.floor(time);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
