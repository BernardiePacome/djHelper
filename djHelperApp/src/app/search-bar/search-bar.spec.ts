import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SavedSetsService } from '../saved-sets/saved-sets.service';
import type { SavedSet, SavedSetsStatus } from '../saved-sets/saved-sets.service';
import { SearchBar } from './search-bar';

const savedSet: SavedSet = {
  id: 's1',
  name: 'Friday night',
  createdAt: '2026-11-10T10:00:00.000Z',
  size: 100,
  cue: { id: 'c1', name: 'mix.cue', mime: 'text/plain', size: 10, url: '/api/files/c1' },
  audio: { id: 'a1', name: 'mix.mp3', mime: 'audio/mpeg', size: 90, url: '/api/files/a1' },
};
const cueText =
  'FILE "mix.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Needed You"\n    PERFORMER "CamelPhat"\n    INDEX 01 00:00:00\n';

describe('SearchBar', () => {
  const sets = signal<SavedSet[]>([]);
  const status = signal<SavedSetsStatus>('ready');
  const service = { sets, status, load: vi.fn() };

  const create = () => {
    const fixture = TestBed.createComponent(SearchBar);
    fixture.detectChanges();
    return fixture;
  };
  const root = (fixture: ReturnType<typeof create>) => fixture.nativeElement as HTMLElement;
  const type = async (fixture: ReturnType<typeof create>, value: string) => {
    const input = root(fixture).querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    sets.set([savedSet]);
    status.set('ready');
    service.load.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => cueText }))
    );

    await TestBed.configureTestingModule({
      imports: [SearchBar],
      providers: [{ provide: SavedSetsService, useValue: service }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows nothing until something is typed, and does not download cues', () => {
    const fixture = create();

    expect(root(fixture).querySelector('.result-list')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists sets matching by name', async () => {
    const fixture = create();

    await type(fixture, 'friday');

    expect(root(fixture).querySelector('.result-name')?.textContent).toContain('Friday night');
  });

  it('lists sets matching by artist or song title and shows the matching track', async () => {
    const fixture = create();

    await type(fixture, 'camelphat');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.track-matches')?.textContent).toContain('Needed You');
    });

    await type(fixture, 'needed');
    expect(root(fixture).querySelector('.result-name')?.textContent).toContain('Friday night');
  });

  it('underlines the searched text in the results', async () => {
    const fixture = create();
    const marks = (selector: string) =>
      Array.from(root(fixture).querySelectorAll(selector)).map((mark) => mark.textContent);

    await type(fixture, 'FRI');
    expect(marks('.result-name mark')).toEqual(['Fri']);
    expect(root(fixture).querySelector('.result-name')?.textContent?.trim()).toBe('Friday night');

    await type(fixture, 'camelphat need');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(marks('.track-matches mark')).toEqual(['CamelPhat', 'Need']);
    });
  });

  it('says when nothing matches', async () => {
    const fixture = create();

    await type(fixture, 'zzz');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).textContent).toContain('No saved sets match "zzz"');
    });
  });

  it('reports the server as unavailable', async () => {
    status.set('unavailable');
    const fixture = create();

    await type(fixture, 'friday');

    expect(root(fixture).textContent).toContain('unavailable');
  });

  it('clears the query with Escape', async () => {
    const fixture = create();
    await type(fixture, 'friday');

    root(fixture).querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.query()).toBe('');
    expect(root(fixture).querySelector('.result-list')).toBeNull();
  });

  it('emits the downloaded files when a result is loaded', async () => {
    const files = [new File(['cue'], 'mix.cue'), new File(['audio'], 'mix.mp3')];
    service.load.mockResolvedValue(files);
    const fixture = create();
    const emitted = vi.fn();
    fixture.componentInstance.setLoaded.subscribe(emitted);
    await type(fixture, 'friday');

    root(fixture).querySelector<HTMLButtonElement>('.primary-button')!.click();
    await fixture.whenStable();

    expect(emitted).toHaveBeenCalledWith({ set: savedSet, files });
  });

  it('shows an error when loading a result fails', async () => {
    service.load.mockRejectedValue(new Error('Unable to load mix.cue (404)'));
    const fixture = create();
    await type(fixture, 'friday');

    root(fixture).querySelector<HTMLButtonElement>('.primary-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root(fixture).textContent).toContain('Unable to load "Friday night": Unable to load mix.cue (404)');
  });
});
