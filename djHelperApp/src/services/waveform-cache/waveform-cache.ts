import { Injectable } from '@angular/core';

export interface WaveformData {
  peaks: number[];
  duration: number;
}

function isWaveformData(value: unknown): value is WaveformData {
  const data = value as WaveformData | null;
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.peaks) &&
    data.peaks.length > 0 &&
    data.peaks.every((peak) => typeof peak === 'number' && Number.isFinite(peak)) &&
    typeof data.duration === 'number' &&
    Number.isFinite(data.duration) &&
    data.duration > 0
  );
}

// Waveforms of saved audio files are cached by the server; every failure falls back to analyzing locally.
@Injectable({ providedIn: 'root' })
export class WaveformCache {
  public async load(fileId: string): Promise<WaveformData | null> {
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/waveform`);
      if (response.status !== 200) {
        return null;
      }
      const body: unknown = await response.json();
      return isWaveformData(body) ? body : null;
    } catch {
      return null;
    }
  }

  public async store(fileId: string, waveform: WaveformData): Promise<void> {
    try {
      await fetch(`/api/files/${encodeURIComponent(fileId)}/waveform`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(waveform),
      });
    } catch {
      // The cache is an optimization; the waveform is already displayed.
    }
  }
}
