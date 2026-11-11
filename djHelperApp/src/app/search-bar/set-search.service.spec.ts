import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SavedSetsService } from '../saved-sets/saved-sets.service';
import type { SavedSet } from '../saved-sets/saved-sets.service';
import { SetSearchService } from './set-search.service';

function makeSet(id: string, name: string): SavedSet {
  return {
    id,
    name,
    createdAt: '2026-11-10T10:00:00.000Z',
    size: 100,
    cue: { id: `c-${id}`, name: `${name}.cue`, mime: 'text/plain', size: 10, url: `/api/files/c-${id}` },
    audio: { id: `a-${id}`, name: `${name}.mp3`, mime: 'audio/mpeg', size: 90, url: `/api/files/a-${id}` },
  };
}

function cue(...tracks: [artist: string, title: string, time: string][]): string {
  return tracks
    .map(
      ([artist, title, time], index) =>
        `  TRACK ${String(index + 1).padStart(2, '0')} AUDIO\n    TITLE "${title}"\n    PERFORMER "${artist}"\n    INDEX 01 ${time}\n`
    )
    .join('');
}

const cues: Record<string, string> = {
  '/api/files/c-s1': cue(['CamelPhat', 'Needed You', '00:00:00'], ['Marten Hørger', 'I Know', '03:10:00']),
  '/api/files/c-s2': cue(['Skrillex', 'Rumble', '00:00:00']),
};

describe('SetSearchService', () => {
  const sets = signal<SavedSet[]>([]);
  let service: SetSearchService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const indexAll = async () => {
    service.ensureIndexed();
    await vi.waitFor(() => expect(service.pendingCount()).toBe(0));
  };

  beforeEach(() => {
    sets.set([makeSet('s1', 'Friday night'), makeSet('s2', 'Warehouse')]);
    fetchMock = vi.fn(async (url: string) =>
      url in cues
        ? { ok: true, status: 200, text: async () => cues[url] }
        : { ok: false, status: 404, text: async () => '' }
    );
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [{ provide: SavedSetsService, useValue: { sets } }],
    });
    service = TestBed.inject(SetSearchService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing for a blank query', async () => {
    await indexAll();
    expect(service.search('   ')).toEqual([]);
  });

  it('finds sets by name without downloading anything', () => {
    const results = service.search('friday');

    expect(results.map(({ set }) => set.id)).toEqual(['s1']);
    expect(results[0].nameMatch).toBe(true);
    expect(results[0].tracks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('finds sets by artist and by song title', async () => {
    await indexAll();

    const byArtist = service.search('camelphat');
    expect(byArtist.map(({ set }) => set.id)).toEqual(['s1']);
    expect(byArtist[0].nameMatch).toBe(false);
    expect(byArtist[0].tracks).toEqual([{ artist: 'CamelPhat', title: 'Needed You', playTime: '00:00:00' }]);

    expect(service.search('rumble').map(({ set }) => set.id)).toEqual(['s2']);
  });

  it('matches accent-insensitively and requires every term to match', async () => {
    await indexAll();

    expect(service.search('horger know')[0].tracks.map(({ title }) => title)).toEqual(['I Know']);
    expect(service.search('camelphat rumble')).toEqual([]);
  });

  it('downloads each cue once and still finds sets whose cue cannot be read by name', async () => {
    sets.update((current) => [...current, makeSet('s3', 'Missing cue')]);

    await indexAll();
    await indexAll();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(service.search('missing').map(({ set }) => set.id)).toEqual(['s3']);
  });
});
