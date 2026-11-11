import { TestBed } from '@angular/core/testing';
import type { SetTrack } from '../set-track';
import { PlaylistOutput } from './playlist-output';

describe('PlaylistOutput', () => {
  const tracks: SetTrack[] = [
    { artist: 'Artist One', title: 'Track One', playTime: '03:12' },
    { artist: 'Artist Two', title: 'Track Two', playTime: '04:05' },
  ];

  let clipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    await TestBed.configureTestingModule({
      imports: [PlaylistOutput],
    }).compileComponents();
  });

  afterEach(() => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('copies the formatted playlist and removes its temporary textarea', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const fixture = TestBed.createComponent(PlaylistOutput);
    fixture.componentRef.setInput('tracks', tracks);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const initialTextareas = document.querySelectorAll('textarea').length;

    await component.copyPlaylist();

    expect(writeText).toHaveBeenCalledWith(
      '1: Artist One - Track One - 03:12\n2: Artist Two - Track Two - 04:05',
    );
    expect(document.querySelectorAll('textarea')).toHaveLength(initialTextareas);
  });

  it('does not copy when the playlist is empty', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const fixture = TestBed.createComponent(PlaylistOutput);
    fixture.componentRef.setInput('tracks', []);
    fixture.detectChanges();

    await fixture.componentInstance.copyPlaylist();

    expect(writeText).not.toHaveBeenCalled();
  });

  it('collapses and expands the playlist text from the titled toggle', () => {
    const fixture = TestBed.createComponent(PlaylistOutput);
    fixture.componentRef.setInput('tracks', tracks);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.collapse-toggle')!;

    expect(toggle.textContent).toContain('Playlist text');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('textarea')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('textarea')).toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('textarea')).not.toBeNull();
  });
});
