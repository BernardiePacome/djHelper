import { analyzeMp3 } from './mp3-waveform';

const decoder = vi.hoisted(() => ({
  decode: vi.fn(),
  free: vi.fn(),
}));

vi.mock('mpg123-decoder', () => ({
  MPEGDecoder: class {
    ready = Promise.resolve();
    decode = decoder.decode;
    free = decoder.free;
  },
}));

describe('MP3 waveform analysis', () => {
  beforeEach(() => {
    decoder.decode.mockReset();
    decoder.free.mockReset();
  });

  function fileWithChunks(size: number): File {
    const file = new File([new Uint8Array(size)], 'mix.mp3');
    vi.spyOn(file, 'slice').mockImplementation((start = 0, end = size) => {
      const length = Math.min(end, size) - start;
      return { arrayBuffer: async () => new ArrayBuffer(length) } as Blob;
    });
    return file;
  }

  it('decodes bounded chunks and computes peaks and duration across them', async () => {
    decoder.decode
      .mockReturnValueOnce({
        channelData: [Float32Array.from([0, 0.5])],
        samplesDecoded: 2,
        sampleRate: 4,
        errors: [],
      })
      .mockReturnValueOnce({
        channelData: [Float32Array.from([1, 0])],
        samplesDecoded: 2,
        sampleRate: 4,
        errors: [],
      });
    const file = fileWithChunks(65_537);

    const result = await analyzeMp3(file, 4, () => true);

    expect(file.slice).toHaveBeenCalledTimes(2);
    expect(decoder.decode.mock.calls.map(([bytes]) => bytes.length)).toEqual([65_536, 1]);
    expect(result).toEqual({ duration: 1, peaks: [0, 0.5, 1, 0] });
    expect(decoder.free).toHaveBeenCalledOnce();
  });

  it('compresses sample buckets while preserving the waveform across a long stream', async () => {
    decoder.decode.mockReturnValue({
      channelData: [Float32Array.from([...Array(8).fill(1), ...Array(9).fill(0)])],
      samplesDecoded: 17,
      sampleRate: 1,
      errors: [],
    });

    expect(await analyzeMp3(fileWithChunks(1), 2, () => true)).toEqual({
      duration: 17,
      peaks: [1, 0],
    });
  });

  it('stops and frees the decoder when loading is superseded', async () => {
    decoder.decode.mockReturnValue({
      channelData: [Float32Array.from([1])],
      samplesDecoded: 1,
      sampleRate: 1,
      errors: [],
    });
    let current = true;
    decoder.decode.mockImplementation(() => {
      current = false;
      return {
        channelData: [Float32Array.from([1])],
        samplesDecoded: 1,
        sampleRate: 1,
        errors: [],
      };
    });

    expect(await analyzeMp3(fileWithChunks(65_537), 4, () => current)).toBeNull();
    expect(decoder.decode).toHaveBeenCalledOnce();
    expect(decoder.free).toHaveBeenCalledOnce();
  });

  it('surfaces decoder errors and frees the decoder', async () => {
    decoder.decode.mockReturnValue({
      channelData: [],
      samplesDecoded: 0,
      sampleRate: 0,
      errors: [{ message: 'Invalid frame' }],
    });

    await expect(analyzeMp3(fileWithChunks(1), 4, () => true)).rejects.toThrow('Invalid frame');
    expect(decoder.free).toHaveBeenCalledOnce();
  });
});
