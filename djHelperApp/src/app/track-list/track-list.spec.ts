import { TestBed } from '@angular/core/testing';
import { TrackList } from './track-list';

describe('TrackList', () => {
  it('starts collapsed and toggles the Playlist tracks', async () => {
    const fixture = TestBed.createComponent(TrackList);
    fixture.componentRef.setInput('tracks', [
      { artist: 'Artist', title: 'Song', playTime: '0:00' },
    ]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.collapse-toggle')!;

    expect(toggle.textContent).toContain('Playlist');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.track-list')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.track-list')?.textContent).toContain('Artist - Song');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.track-list')).toBeNull();
  });

  it('only enables timestamps with a matching playable marker and emits its original time', async () => {
    const fixture = TestBed.createComponent(TrackList);
    fixture.componentRef.setInput('tracks', [
      { artist: 'Artist', title: 'Song', playTime: '02:08' },
      { artist: 'Artist', title: 'Other', playTime: '03:00' },
    ]);
    fixture.componentRef.setInput('seekableMarkers', [
      { artist: 'Artist', title: 'Song', time: 128 },
    ]);
    const seek = vi.fn();
    fixture.componentInstance.seekRequested.subscribe(seek);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.collapse-toggle')!.click();
    fixture.detectChanges();

    const buttons = element.querySelectorAll<HTMLButtonElement>('.track-time');
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    buttons[0].click();
    expect(seek).toHaveBeenCalledExactlyOnceWith(128);
  });
});
