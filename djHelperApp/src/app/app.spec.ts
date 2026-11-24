import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { SavedSetsService } from '../services/saved-sets.service/saved-sets.service';
import { SavedSet } from '../interfaces/saved-set';

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

  it('keeps the dropzone visible in mock mode so more files can be added', async () => {
    history.replaceState(null, '', '/?mock=1');
    try {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;

      expect(fixture.componentInstance.isMockMode).toBe(true);
      expect(compiled.querySelector('.mock-load-button')).toBeTruthy();
      expect(compiled.querySelector('app-cue-file-dropzone .dropzone')).toBeTruthy();
    } finally {
      history.replaceState(null, '', '/');
    }
  });

  it('hides search and saved sets while loading but keeps loaded sets on screen', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const cueText =
      'FILE "mix.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Song"\n    PERFORMER "Artist"\n    INDEX 01 00:00:00\n';
    const files = [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')];

    const loading = app.onFilesSelected(files);
    fixture.detectChanges();

    expect(app.isLoadingFiles()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-search-bar')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-saved-sets')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-loading-indicator')).toBeTruthy();

    await loading;
    fixture.detectChanges();

    expect(app.isLoadingFiles()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-search-bar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-saved-sets')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-track-list')).toBeTruthy();
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
  const cueText =
    'FILE "mix.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Song"\n    PERFORMER "Artist"\n    INDEX 01 00:00:00\n';

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
    await vi.waitFor(() => expect(app.loadedMixes()[0]?.playlist).toHaveLength(1));
    return app.loadedMixes()[0];
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

  it('seeks only the selected set when its playlist timestamp is clicked', async () => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        async decodeAudioData() {
          return { duration: 180, getChannelData: () => Float32Array.from([0, 1]) };
        }
      },
    );
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static override createObjectURL() {
          return 'blob:test';
        }
        static override revokeObjectURL() {}
      },
    );
    const audio = (name: string) => {
      const file = new File(['audio'], name);
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new ArrayBuffer(4),
      });
      return file;
    };
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.loadedMixes.set(
      [audio('one.wav'), audio('two.wav'), null].map((audioFile, index) => ({
        id: index,
        audioFile,
        cueFile: null,
        playlist: [{ artist: 'Artist', title: `Song ${index}`, playTime: '02:08' }],
        trackMarkers: [{ artist: 'Artist', title: `Song ${index}`, time: 128 }],
        savedSetId: null,
        isSaving: false,
      })),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll(
      'article.loaded-set',
    ) as NodeListOf<HTMLElement>;
    rows.forEach((row) => row.querySelector<HTMLButtonElement>('.collapse-toggle')!.click());
    fixture.detectChanges();

    expect(rows[1].querySelector<HTMLButtonElement>('.track-time')!.disabled).toBe(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(rows[1].querySelector<HTMLButtonElement>('.track-time')!.disabled).toBe(false);
    });
    const first = rows[0].querySelector<HTMLAudioElement>('audio')!;
    const second = rows[1].querySelector<HTMLAudioElement>('audio')!;
    const button = rows[1].querySelector<HTMLButtonElement>('.track-time')!;
    expect(button.disabled).toBe(false);
    expect(rows[2].querySelector<HTMLButtonElement>('.track-time')!.disabled).toBe(true);
    button.click();

    expect(first.currentTime).toBe(0);
    expect(second.currentTime).toBe(128);
    expect(second.paused).toBe(true);
  });

  it('can only save once a cue and its audio are loaded and the server is reachable', async () => {
    const app = createApp();
    app.onFilesSelected([new File(['audio'], 'solo.mp3')]);
    expect(app.canSaveMix(app.loadedMixes()[0])).toBe(false);

    const mix = await loadFiles(app);
    expect(app.canSaveMix(mix)).toBe(true);

    status.set('unavailable');
    expect(app.canSaveMix(mix)).toBe(false);
  });

  it('saves the loaded cue and audio under the cue file name', async () => {
    service.save.mockImplementation(async () => {
      sets.set([savedSet]);
      return savedSet;
    });
    const app = createApp();
    const mix = await loadFiles(app);

    await app.saveSet(mix.id);

    expect(service.save).toHaveBeenCalledWith('mix', mix.cueFile, mix.audioFile);
    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(true);
    expect(app.loadedMixes()[0].isSaving).toBe(false);
  });

  it('reports a failed save and allows retrying', async () => {
    service.save.mockRejectedValue(new Error('Storage quota exceeded'));
    const app = createApp();
    const mix = await loadFiles(app);

    await app.saveSet(mix.id);

    expect(app.errorMessage()).toBe('Unable to save set: Storage quota exceeded');
    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(false);
    expect(app.loadedMixes()[0].isSaving).toBe(false);
  });

  it('loads a saved set into the app and marks it as already saved', async () => {
    sets.set([savedSet]);
    const app = createApp();

    app.onSavedSetLoaded({
      set: savedSet,
      files: [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')],
    });
    await vi.waitFor(() => expect(app.loadedMixes()).toHaveLength(1));

    expect(app.loadedMixes()[0].audioFile?.name).toBe('mix.mp3');
    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(true);
  });

  it('does not load a saved set twice', async () => {
    sets.set([savedSet]);
    const app = createApp();
    const files = () => [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')];

    await app.onSavedSetLoaded({ set: savedSet, files: files() });
    const [first] = app.loadedMixes();
    await app.onSavedSetLoaded({ set: savedSet, files: files() });

    expect(app.loadedMixes()).toEqual([first]);
  });

  it('links a saved set to the same audio already loaded instead of adding a duplicate', async () => {
    sets.set([savedSet]);
    const app = createApp();
    await app.onFilesSelected([new File(['audio'], 'mix.mp3', { lastModified: 1 })]);
    const [playing] = app.loadedMixes();

    await app.onSavedSetLoaded({
      set: savedSet,
      files: [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3', { lastModified: 2 })],
    });

    expect(app.loadedMixes()).toHaveLength(1);
    expect(app.loadedMixes()[0].audioFile).toBe(playing.audioFile);
    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(true);
  });

  it('keeps the saved link when the same cue and audio are loaded again', async () => {
    sets.set([savedSet]);
    const app = createApp();
    const files = (lastModified: number) => [
      new File([cueText], 'mix.cue'),
      new File(['audio'], 'mix.mp3', { lastModified }),
    ];
    await app.onSavedSetLoaded({ set: savedSet, files: files(1) });

    await app.onFilesSelected(files(2));

    expect(app.loadedMixes()).toHaveLength(1);
    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(true);
  });

  it('reflects saved and removed mixes in the saved set load button', async () => {
    service.save.mockImplementation(async () => {
      sets.set([savedSet]);
      return savedSet;
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const mix = await loadFiles(app);

    await app.saveSet(mix.id);
    fixture.detectChanges();
    let loadButton = fixture.nativeElement.querySelector(
      'app-saved-sets .primary-button',
    ) as HTMLButtonElement;
    expect(loadButton.textContent?.trim()).toBe('Loaded ✓');
    expect(loadButton.disabled).toBe(true);

    app.removeMix(mix.id);
    fixture.detectChanges();
    loadButton = fixture.nativeElement.querySelector(
      'app-saved-sets .primary-button',
    ) as HTMLButtonElement;
    expect(loadButton.textContent?.trim()).toBe('Load');
    expect(loadButton.disabled).toBe(false);
  });

  it('marks a saved set as loaded only after its files are processed', async () => {
    sets.set([savedSet]);
    service.load.mockResolvedValue([
      new File([cueText], 'mix.cue'),
      new File(['audio'], 'mix.mp3'),
    ]);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('app-saved-sets .primary-button').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      const loadButton = fixture.nativeElement.querySelector(
        'app-saved-sets .primary-button',
      ) as HTMLButtonElement | null;
      expect(loadButton?.textContent?.trim()).toBe('Loaded ✓');
      expect(loadButton?.disabled).toBe(true);
    });
  });

  it('pairs a renamed saved audio file with its cue even if the cue references another name', async () => {
    const app = createApp();
    const audio = new File(['audio'], 'set name.mp3');

    app.onSavedSetLoaded({ set: savedSet, files: [new File([cueText], 'set name.cue'), audio] });
    await vi.waitFor(() => expect(app.loadedMixes()).toHaveLength(1));

    expect(app.loadedMixes()[0].audioFile).toBe(audio);
  });

  it('keeps the current audio file while a cue file is loading', async () => {
    const app = createApp();
    const audio = new File(['audio'], 'mix.mp3');
    app.onFilesSelected([audio]);
    const [audioOnly] = app.loadedMixes();

    app.onFilesSelected([new File([cueText], 'other.cue')]);
    expect(app.loadedMixes()[0].audioFile).toBe(audio);

    await vi.waitFor(() => expect(app.loadedMixes()[0].playlist).toHaveLength(1));
    expect(app.loadedMixes()).toHaveLength(1);
    expect(app.loadedMixes()[0].id).toBe(audioOnly.id);
    expect(app.loadedMixes()[0].audioFile).toBe(audio);
  });

  it('adds a new loaded set for another audio file and keeps the existing one', async () => {
    const app = createApp();
    const playing = new File(['audio'], 'first.mp3');
    app.onFilesSelected([playing]);
    const [firstMix] = app.loadedMixes();

    app.onFilesSelected([new File(['other'], 'second.mp3')]);

    expect(app.loadedMixes().map((mix) => mix.audioFile?.name)).toEqual([
      'second.mp3',
      'first.mp3',
    ]);
    expect(app.loadedMixes()[1]).toBe(firstMix);
  });

  it('ignores an audio file that is already loaded', () => {
    const app = createApp();
    app.onFilesSelected([new File(['audio'], 'mix.mp3', { lastModified: 1 })]);

    app.onFilesSelected([new File(['audio'], 'mix.mp3', { lastModified: 1 })]);

    expect(app.loadedMixes()).toHaveLength(1);
  });

  it('removes a loaded set', () => {
    const app = createApp();
    app.onFilesSelected([new File(['audio'], 'mix.mp3')]);

    app.removeMix(app.loadedMixes()[0].id);

    expect(app.loadedMixes()).toEqual([]);
  });

  it('no longer shows a loaded set as saved once it is deleted', async () => {
    sets.set([savedSet]);
    const app = createApp();
    await app.onSavedSetLoaded({
      set: savedSet,
      files: [new File([cueText], 'mix.cue'), new File(['audio'], 'mix.mp3')],
    });

    sets.set([]);

    expect(app.isMixedSaved(app.loadedMixes()[0])).toBe(false);
  });
});
