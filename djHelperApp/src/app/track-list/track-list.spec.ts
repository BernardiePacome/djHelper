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
});
