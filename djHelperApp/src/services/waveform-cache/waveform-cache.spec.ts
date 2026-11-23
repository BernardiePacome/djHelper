import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformCache, WaveformData } from './waveform-cache';

describe('WaveformCache', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads valid cached waveform data using an encoded file ID', async () => {
    const waveform: WaveformData = { peaks: [0.2, 0.8], duration: 12 };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(waveform), { status: 200 }));

    expect(await new WaveformCache().load('track/one')).toEqual(waveform);
    expect(fetchMock).toHaveBeenCalledWith('/api/files/track%2Fone/waveform');
  });

  it('returns null when the response is not a valid cached waveform', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ peaks: [], duration: 0 }), { status: 200 }),
    );

    expect(await new WaveformCache().load('track')).toBeNull();
  });

  it('stores waveform data with a PUT request', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const waveform: WaveformData = { peaks: [0.5], duration: 8 };

    await new WaveformCache().store('track', waveform);

    expect(fetchMock).toHaveBeenCalledWith('/api/files/track/waveform', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(waveform),
    });
  });
});
