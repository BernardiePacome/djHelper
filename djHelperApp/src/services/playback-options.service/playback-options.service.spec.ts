import { describe, expect, it } from 'vitest';
import { PlaybackOptionsService } from './playback-options.service';

describe('PlaybackOptionsService', () => {
  it('recomputes crossfade milliseconds when the duration changes', () => {
    const service = new PlaybackOptionsService();

    expect(service.crossfadeMs()).toBe(2000);
    service.crossfadeDuration.set(4);
    expect(service.crossfadeMs()).toBe(4000);
  });
});
