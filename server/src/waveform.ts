import * as fs from 'node:fs';
import * as wav from 'wav';

export interface WaveformData {
  peaks: number[];
  duration: number;
}

/**
 * Analyzes an audio file and extracts waveform data.
 * Supports WAV files primarily; MP3 support would require additional dependencies.
 */
export async function analyzeWaveform(
  filePath: string,
  barCount: number = 400,
): Promise<WaveformData> {
  return new Promise((resolve, reject) => {
    try {
      const fileStream = fs.createReadStream(filePath);
      const reader = new wav.Reader();

      // Handle end of file
      let audioBuffer: number[][] = [];
      let sampleRate = 0;
      let channels = 0;

      reader.on('format', (format) => {
        sampleRate = format.sampleRate;
        channels = format.channels;
      });

      reader.on('data', (chunk: Buffer) => {
        // Parse PCM data based on format
        // For simplicity, we'll handle 16-bit PCM (most common)
        const samples: number[] = [];
        for (let i = 0; i < chunk.length; i += 2) {
          // Read 16-bit signed integer (little-endian)
          const sample = chunk.readInt16LE(i);
          samples.push(sample);
        }

        // Store samples per channel
        if (audioBuffer.length === 0) {
          for (let c = 0; c < channels; c++) {
            audioBuffer[c] = [];
          }
        }

        // Distribute samples across channels
        for (let i = 0; i < samples.length; i += channels) {
          for (let c = 0; c < channels; c++) {
            if (i + c < samples.length) {
              // Normalize to [-1, 1]
              audioBuffer[c].push(samples[i + c] / 32768);
            }
          }
        }
      });

      reader.on('end', () => {
        try {
          if (audioBuffer.length === 0 || audioBuffer[0].length === 0) {
            reject(new Error('No audio data found in file'));
            return;
          }

          // Use first channel for waveform analysis
          const samples = audioBuffer[0];
          const duration = samples.length / sampleRate;
          const bucketSize = Math.max(1, Math.ceil(samples.length / barCount));
          const levels: number[] = [];

          // RMS per bucket
          for (let start = 0; start < samples.length; start += bucketSize) {
            let sumOfSquares = 0;
            const end = Math.min(start + bucketSize, samples.length);
            for (let index = start; index < end; index++) {
              sumOfSquares += samples[index] * samples[index];
            }
            levels.push(Math.sqrt(sumOfSquares / (end - start)));
          }

          const loudest = Math.max(...levels, Number.EPSILON);
          const peaks = levels.map((level) => level / loudest);

          resolve({
            peaks,
            duration,
          });
        } catch (error) {
          reject(error);
        }
      });

      reader.on('error', (error: Error) => {
        reject(new Error(`Failed to read audio file: ${error.message}`));
      });

      fileStream.on('error', (error: Error) => {
        reject(new Error(`Failed to open audio file: ${error.message}`));
      });

      fileStream.pipe(reader);
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error('Unknown error during waveform analysis'),
      );
    }
  });
}
