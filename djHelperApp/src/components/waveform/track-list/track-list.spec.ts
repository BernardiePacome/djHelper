import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TrackList } from './track-list';

describe('TrackList', () => {
  it('searches title and artist together while preserving numbering, playback highlight and seeking', () => {
    const fixture = TestBed.createComponent(TrackList);
    fixture.componentRef.setInput('tracks', [
      { artist: 'Other', title: 'Opening', playTime: '00:00' },
      { artist: 'Beyoncé', title: 'Halo', playTime: '01:00' },
    ]);
    fixture.componentRef.setInput('seekableMarkers', [
      { artist: 'Other', title: 'Opening', time: 0 },
      { artist: 'Beyoncé', title: 'Halo', time: 60 },
    ]);
    fixture.componentRef.setInput('isPlaying', true);
    fixture.componentRef.setInput('currentTime', 75);
    const seek = vi.fn();
    fixture.componentInstance.seekRequested.subscribe(seek);
    fixture.componentInstance.isExpanded.set(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;

    for (const query of ['HALO', 'beyonce', ' halo  BEYONCE ']) {
      input.value = query;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const rows = element.querySelectorAll('li');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('2.');
      expect(rows[0].textContent).toContain('Beyoncé - Halo');
      expect(rows[0].getAttribute('aria-current')).toBe('true');
    }

    element.querySelector<HTMLButtonElement>('.track-time')!.click();
    expect(seek).toHaveBeenCalledExactlyOnceWith(60);
  });

  it('searches each playlist independently, excludes timestamps, and clears with Escape', () => {
    const fixtures = [TestBed.createComponent(TrackList), TestBed.createComponent(TrackList)];
    for (const fixture of fixtures) {
      fixture.componentRef.setInput('tracks', [
        { artist: 'Artist', title: 'Song', playTime: '02:08' },
      ]);
      fixture.componentInstance.isExpanded.set(true);
      fixture.detectChanges();
    }
    const element = fixtures[0].nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = '02:08';
    input.dispatchEvent(new Event('input'));
    fixtures[0].detectChanges();

    expect(element.querySelectorAll('li')).toHaveLength(0);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('No songs match');
    expect(fixtures[1].nativeElement.querySelectorAll('li')).toHaveLength(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixtures[0].detectChanges();

    expect(input.value).toBe('');
    expect(element.querySelectorAll('li')).toHaveLength(1);
    expect(element.querySelector('[role="status"]')).toBeNull();
  });

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

  it('marks the playing track with a green list item and play icon', async () => {
    const fixture = TestBed.createComponent(TrackList);
    fixture.componentRef.setInput('tracks', [
      { artist: 'Artist', title: 'First', playTime: '0:00' },
      { artist: 'Artist', title: 'Second', playTime: '1:00' },
    ]);
    fixture.componentRef.setInput('seekableMarkers', [
      { artist: 'Artist', title: 'First', time: 0 },
      { artist: 'Artist', title: 'Second', time: 60 },
    ]);
    fixture.componentRef.setInput('currentTime', 75);
    fixture.componentRef.setInput('isPlaying', true);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.collapse-toggle')!.click();
    fixture.detectChanges();

    const rows = element.querySelectorAll<HTMLLIElement>('.track-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('current-track')).toBe(false);
    expect(rows[1].classList.contains('current-track')).toBe(true);
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[1].querySelector('svg.current-track-icon')).not.toBeNull();
  });

  it('does not mark a track as playing while playback is paused', async () => {
    const fixture = TestBed.createComponent(TrackList);
    fixture.componentRef.setInput('tracks', [
      { artist: 'Artist', title: 'Song', playTime: '0:00' },
    ]);
    fixture.componentRef.setInput('seekableMarkers', [
      { artist: 'Artist', title: 'Song', time: 0 },
    ]);
    fixture.componentRef.setInput('currentTime', 10);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.collapse-toggle')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.current-track')).toBeNull();
  });
});
