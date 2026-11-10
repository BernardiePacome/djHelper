import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { SavedSetsService } from './saved-sets/saved-sets.service';
import type { SavedSet } from './saved-sets/saved-sets.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.main-title')?.textContent).toContain('DJ ToolBox');
  });
});

describe('App saved sets', () => {
  const savedSet: SavedSet = {
    id: 's1',
    name: 'mix',
    createdAt: '2026-11-10T10:00:00.000Z',
    size: 100,
    cue: { id: 'c1', name: 'mix.cue', mime: 'text/plain', size: 10, url: '/api/files/c1' },
    audio: { id: 'a1', name: 'mix.mp3', mime: 'audio/mpeg', size: 90, url: '/api/files/a1' },
  };
  const cueText = 'FILE "mix.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Song"\n    PERFORMER "Artist"\n    INDEX 01 00:00:00\n';

  const sets = signal<SavedSet[]>([]);
  const status = signal<'loading' | 'ready' | 'unavailable'>('ready');
  const service = {
    sets,
    status,
    storage: signal(null),
    refresh: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
  };

  const createApp = () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.componentInstance;
  };

  const loadFiles = async (app: App) => {
    app.onFilesSelected([new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')]);
    await vi.waitFor(() => expect(app.playlist()).toHaveLength(1));
  };

  beforeEach(async () => {
    sets.set([]);
    status.set('ready');
    service.save.mockReset();
    service.load.mockReset();
    vi.stubGlobal('scrollTo', vi.fn());

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: SavedSetsService, useValue: service }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('can only save once a cue and its audio are loaded and the server is reachable', async () => {
    const app = createApp();
    expect(app.canSaveSet()).toBe(false);

    app.onFilesSelected([new File(['audio'], 'mix.mp3')]);
    expect(app.canSaveSet()).toBe(false);

    await loadFiles(app);
    expect(app.canSaveSet()).toBe(true);

    status.set('unavailable');
    expect(app.canSaveSet()).toBe(false);
  });

  it('saves the loaded cue and audio under the cue file name', async () => {
    service.save.mockImplementation(async () => {
      sets.set([savedSet]);
      return savedSet;
    });
    const app = createApp();
    await loadFiles(app);

    await app.saveSet();

    expect(service.save).toHaveBeenCalledWith('mix', app.cueFile(), app.audioFile());
    expect(app.isCurrentSetSaved()).toBe(true);
    expect(app.isSavingSet()).toBe(false);
  });

  it('reports a failed save and allows retrying', async () => {
    service.save.mockRejectedValue(new Error('Storage quota exceeded'));
    const app = createApp();
    await loadFiles(app);

    await app.saveSet();

    expect(app.errorMessage()).toBe('Unable to save set: Storage quota exceeded');
    expect(app.isCurrentSetSaved()).toBe(false);
    expect(app.isSavingSet()).toBe(false);
  });

  it('loads a saved set into the app and marks it as already saved', async () => {
    sets.set([savedSet]);
    const app = createApp();

    app.onSavedSetLoaded({
      set: savedSet,
      files: [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')],
    });
    await vi.waitFor(() => expect(app.playlist()).toHaveLength(1));

    expect(app.audioFile()?.name).toBe('mix.mp3');
    expect(app.isCurrentSetSaved()).toBe(true);
  });

  it('no longer shows a loaded set as saved once it is deleted', async () => {
    sets.set([savedSet]);
    const app = createApp();
    app.onSavedSetLoaded({
      set: savedSet,
      files: [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')],
    });
    await vi.waitFor(() => expect(app.playlist()).toHaveLength(1));

    sets.set([]);

    expect(app.isCurrentSetSaved()).toBe(false);
  });
});
