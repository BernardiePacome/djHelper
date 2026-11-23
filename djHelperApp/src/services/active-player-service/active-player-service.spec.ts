import { describe, expect, it, vi } from 'vitest';
import { ActivePlayerService } from './active-player-service';

describe('ActivePlayerService', () => {
  it('fades out other active players and reports whether one was playing', () => {
    const service = new ActivePlayerService();
    const fadeOut = vi.fn();

    expect(service.activate('first', fadeOut)).toBe(false);
    expect(service.activate('second', vi.fn())).toBe(true);
    expect(fadeOut).toHaveBeenCalledOnce();
  });

  it('does not fade out the same player and stops tracking deactivated players', () => {
    const service = new ActivePlayerService();
    const oldFadeOut = vi.fn();
    const newFadeOut = vi.fn();

    service.activate('player', oldFadeOut);
    expect(service.activate('player', newFadeOut)).toBe(false);
    expect(oldFadeOut).not.toHaveBeenCalled();

    service.deactivate('player');
    expect(service.activate('another', vi.fn())).toBe(false);
    expect(newFadeOut).not.toHaveBeenCalled();
  });
});
