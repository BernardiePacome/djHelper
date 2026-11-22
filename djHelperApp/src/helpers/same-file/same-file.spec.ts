import { isSameFile } from './same-file';

describe('isSameFile', () => {
  const file = (name = 'mix.mp3', content = 'audio', lastModified = 1) =>
    new File([content], name, { lastModified });

  it('matches the same instance', () => {
    const mix = file();

    expect(isSameFile(mix, mix)).toBe(true);
  });

  it('matches different instances with the same name, size and modification time', () => {
    expect(isSameFile(file(), file())).toBe(true);
  });

  it('does not match files with a different name', () => {
    expect(isSameFile(file('mix.mp3'), file('other.mp3'))).toBe(false);
  });

  it('does not match files with a different size', () => {
    expect(isSameFile(file('mix.mp3', 'audio'), file('mix.mp3', 'longer audio'))).toBe(false);
  });

  it('does not match files with a different modification time', () => {
    expect(isSameFile(file('mix.mp3', 'audio', 1), file('mix.mp3', 'audio', 2))).toBe(false);
  });
});
