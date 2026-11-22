import { EnergyBucket } from '../../../interfaces/energy-bucket';

const CHUNK_SIZE = 64 * 1024;

export async function analyzeMp3(
  file: File,
  barCount: number,
  isCurrent: () => boolean,
): Promise<{ peaks: number[]; duration: number } | null> {
  const { MPEGDecoder } = await import('mpg123-decoder');
  if (!isCurrent()) {
    return null;
  }

  const decoder = new MPEGDecoder();
  const buckets: EnergyBucket[] = [];

  let bucketSize = 1;
  let sum = 0;
  let count = 0;
  let totalSamples = 0;
  let sampleRate = 0;

  try {
    await decoder.ready;
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      if (!isCurrent()) {
        return null;
      }

      const bytes = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      if (!isCurrent()) {
        return null;
      }

      const decoded = decoder.decode(new Uint8Array(bytes));
      if (decoded.errors.length > 0) {
        throw new Error(`MP3 decoding failed: ${decoded.errors[0].message}`);
      }
      if (decoded.samplesDecoded === 0) {
        continue;
      }
      if (sampleRate && decoded.sampleRate !== sampleRate) {
        throw new Error('MP3 sample rate changes within the file');
      }
      sampleRate = decoded.sampleRate;
      const channel = decoded.channelData[0];
      if (!channel || channel.length !== decoded.samplesDecoded || sampleRate <= 0) {
        throw new Error('Invalid MP3 audio data');
      }

      for (const sample of channel) {
        sum += sample * sample;
        count++;
        totalSamples++;
        if (count === bucketSize) {
          buckets.push({ sum, count });
          sum = 0;
          count = 0;
          if (buckets.length === barCount * 2) {
            for (let i = 0; i < barCount; i++) {
              const first = buckets[i * 2];
              const second = buckets[i * 2 + 1];
              buckets[i] = { sum: first.sum + second.sum, count: first.count + second.count };
            }
            buckets.length = barCount;
            bucketSize *= 2;
          }
        }
      }

      // Yield between chunks so long analyses do not block playback or the UI.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (!isCurrent()) {
      return null;
    }
    if (count > 0) {
      buckets.push({ sum, count });
    }
    if (totalSamples === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error('Audio contains no samples');
    }

    const peaks: number[] = [];
    const outputCount = Math.min(totalSamples, barCount);
    let bucketIndex = 0;
    let bucketStart = 0;
    for (let i = 0; i < outputCount; i++) {
      const start = Math.floor((i * totalSamples) / outputCount);
      const end = Math.floor(((i + 1) * totalSamples) / outputCount);
      let energy = 0;
      while (bucketIndex < buckets.length && bucketStart < end) {
        const bucket = buckets[bucketIndex];
        const bucketEnd = bucketStart + bucket.count;
        const overlap = Math.min(end, bucketEnd) - Math.max(start, bucketStart);
        if (overlap > 0) {
          energy += (bucket.sum * overlap) / bucket.count;
        }
        if (bucketEnd > end) {
          break;
        }
        bucketStart = bucketEnd;
        bucketIndex++;
      }
      peaks.push(Math.sqrt(energy / (end - start)));
    }
    const max = Math.max(...peaks, Number.EPSILON);
    return { peaks: peaks.map((peak) => peak / max), duration: totalSamples / sampleRate };
  } finally {
    decoder.free();
  }
}
