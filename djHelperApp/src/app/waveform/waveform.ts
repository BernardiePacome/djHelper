import { Component, computed, effect, input, signal } from '@angular/core';

@Component({
  selector: 'app-waveform',
  standalone: true,
  templateUrl: './waveform.html',
  styleUrl: './waveform.scss'
})
export class Waveform {
  readonly file = input.required<File>();
  readonly trackMarkers = input<number[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly duration = signal(0);
  readonly peaks = signal<number[]>([]);
  readonly formattedDuration = computed(() => {
    const totalSeconds = Math.floor(this.duration());
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
          .filter((time) => Number.isFinite(time) && time >= 0 && time <= this.duration())
          .map((time) => (time / this.duration()) * 1200)
      : []
  );

  private loadId = 0;

  constructor() {
    effect(() => {
      void this.loadWaveform(this.file());
    });
  }

  private async loadWaveform(file: File): Promise<void> {
    const loadId = ++this.loadId;
    this.isLoading.set(true);
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
}
