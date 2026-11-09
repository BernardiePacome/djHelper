import { isMockModeUrl } from './mock-mode';

describe('isMockModeUrl', () => {
  it('enables mock mode for the mock server port', () => {
    expect(isMockModeUrl(new URL('http://localhost:8080/'))).toBe(true);
  });

  it('enables mock mode when explicitly requested', () => {
    expect(isMockModeUrl(new URL('http://localhost:4200/?mock=1'))).toBe(true);
  });

  it('keeps mock mode disabled on the regular development server', () => {
    expect(isMockModeUrl(new URL('http://localhost:4200/'))).toBe(false);
  });
});
