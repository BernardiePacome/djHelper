import { TestBed } from '@angular/core/testing';
import { SavedSetsService } from './saved-sets.service';
import type { SavedSet } from './saved-sets.service';

const cueFile = { id: 'c1', name: 'mix.cue', mime: 'text/plain', size: 10, url: '/api/files/c1' };
const audioFile = { id: 'a1', name: 'mix.mp3', mime: 'audio/mpeg', size: 90, url: '/api/files/a1' };
const savedSet: SavedSet = {
  id: 's1',
  name: 'mix',
  createdAt: '2026-11-10T10:00:00.000Z',
  size: 100,
  cue: cueFile,
  audio: audioFile,
};
const usage = { usedBytes: 100, quotaBytes: 2048, availableBytes: 1948 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function uploadResponse(init: RequestInit): Response {
  const { name } = (init.body as FormData).get('file') as File;
  return json(name === 'mix.cue' ? cueFile : audioFile, 201);
}

describe('SavedSetsService', () => {
  let service: SavedSetsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = TestBed.inject(SavedSetsService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads sets and storage usage', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/sets' ? json({ sets: [savedSet] }) : json(usage)
    );

    await service.refresh();

    expect(service.status()).toBe('ready');
    expect(service.sets()).toEqual([savedSet]);
    expect(service.storage()).toEqual(usage);
  });

  it('reports the server as unavailable when the API is missing or malformed', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Not found</html>', { status: 404 }));
    await service.refresh();
    expect(service.status()).toBe('unavailable');

    fetchMock.mockImplementation(async () => json({ sets: [{ id: 1 }] }));
    await service.refresh();
    expect(service.status()).toBe('unavailable');
  });

  it('uploads the cue and audio files and then creates the set', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/files') {
        return uploadResponse(init!);
      }
      if (url === '/api/sets') {
        return json(savedSet, 201);
      }
      return json(usage);
    });

    const set = await service.save('mix', new File(['cue'], 'mix.cue'), new File(['audio'], 'mix.mp3'));

    expect(set).toEqual(savedSet);
    expect(service.sets()).toEqual([savedSet]);
    const setCall = fetchMock.mock.calls.find(([url]) => url === '/api/sets');
    expect(JSON.parse(setCall![1].body)).toEqual({ name: 'mix', cueFileId: 'c1', audioFileId: 'a1' });
  });

  it('saves the cue and audio under the set name, keeping the audio format', async () => {
    const uploadedNames: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/files') {
        uploadedNames.push(((init!.body as FormData).get('file') as File).name);
        return uploadResponse(init!);
      }
      return url === '/api/sets' ? json(savedSet, 201) : json(usage);
    });

    await service.save('mix', new File(['cue'], 'Other name.TXT'), new File(['audio'], 'Different Track.WAV'));

    expect(uploadedNames).toEqual(['mix.cue', 'mix.wav']);
  });

  it('deletes already uploaded files when saving fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/files' && init?.method === 'POST') {
        return uploadResponse(init);
      }
      if (url === '/api/sets') {
        return json({ error: 'Storage quota exceeded' }, 413);
      }
      return new Response(null, { status: 204 });
    });

    await expect(
      service.save('mix', new File(['cue'], 'mix.cue'), new File(['audio'], 'mix.mp3'))
    ).rejects.toThrow('Storage quota exceeded');

    const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);
    expect(deletes.sort()).toEqual(['/api/files/a1', '/api/files/c1']);
    expect(service.sets()).toEqual([]);
  });

  it('removes a set from the list', async () => {
    service.sets.set([savedSet]);
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/sets/s1' ? new Response(null, { status: 204 }) : json(usage)
    );

    await service.remove(savedSet);

    expect(service.sets()).toEqual([]);
  });

  it('downloads both files of a set as File objects', async () => {
    // jsdom's File cannot wrap the Blob that Node's Response produces, so hand it a jsdom Blob.
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([url.endsWith('c1') ? 'cue text' : 'audio']),
    }));

    const [cue, audio] = await service.load(savedSet);

    expect(cue.name).toBe('mix.cue');
    expect(await cue.text()).toBe('cue text');
    expect(audio.name).toBe('mix.mp3');
    expect(audio.type).toBe('audio/mpeg');
  });

  it('fails to load when a file is missing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(service.load(savedSet)).rejects.toThrow('Unable to load mix.cue (404)');
  });
});
