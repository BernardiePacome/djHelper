import { describe, expect, it } from 'vitest';
import { isMockFileArray } from './is-mock-file-array';

describe('isMockFileArray', () => {
  it('accepts a manifest containing valid mock files', () => {
    expect(
      isMockFileArray({
        files: [
          { name: 'mix.cue', url: '/mocks/mix.cue', type: 'text/plain' },
          { name: 'mix.mp3', url: '/mocks/mix.mp3', type: 'audio/mpeg' },
        ],
      }),
    ).toBe(true);
  });

  it('rejects values without a files array', () => {
    expect(isMockFileArray(null)).toBe(false);
    expect(isMockFileArray({})).toBe(false);
    expect(isMockFileArray({ files: 'mix.mp3' })).toBe(false);
  });

  it('rejects entries with missing or non-string fields', () => {
    expect(isMockFileArray({ files: [{ name: 'mix.cue', url: '/mix.cue' }] })).toBe(false);
    expect(
      isMockFileArray({
        files: [{ name: 'mix.cue', url: 123, type: 'text/plain' }],
      }),
    ).toBe(false);
  });

  it('rejects non-object entries in the files array', () => {
    expect(isMockFileArray({ files: [null] })).toBe(false);
    expect(isMockFileArray({ files: ['mix.cue'] })).toBe(false);
  });
});
