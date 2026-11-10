import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SavedSets, formatBytes } from './saved-sets';
import { SavedSetsService } from './saved-sets.service';
import type { SavedSet, SavedSetsStatus, StorageUsage } from './saved-sets.service';

const savedSet: SavedSet = {
  id: 's1',
  name: 'Friday night',
  createdAt: '2026-11-10T10:00:00.000Z',
  size: 5 * 1024 * 1024,
  cue: { id: 'c1', name: 'mix.cue', mime: 'text/plain', size: 10, url: '/api/files/c1' },
  audio: { id: 'a1', name: 'mix.mp3', mime: 'audio/mpeg', size: 90, url: '/api/files/a1' },
};

describe('SavedSets', () => {
  const sets = signal<SavedSet[]>([]);
  const status = signal<SavedSetsStatus>('ready');
  const storage = signal<StorageUsage | null>(null);
  const service = {
    sets,
    status,
    storage,
    refresh: vi.fn().mockResolvedValue(undefined),
    load: vi.fn(),
    remove: vi.fn(),
  };

  const create = () => {
    const fixture = TestBed.createComponent(SavedSets);
    fixture.detectChanges();
    return fixture;
  };
  const text = (fixture: ReturnType<typeof create>) => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (fixture: ReturnType<typeof create>, label: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((element) =>
      element.textContent?.includes(label)
    )!;

  beforeEach(async () => {
    sets.set([savedSet]);
    status.set('ready');
    storage.set({ usedBytes: 5 * 1024 * 1024, quotaBytes: 2 * 1024 ** 3, availableBytes: 0 });
    service.refresh.mockClear();
    service.load.mockReset();
    service.remove.mockReset();

    await TestBed.configureTestingModule({
      imports: [SavedSets],
      providers: [{ provide: SavedSetsService, useValue: service }],
    }).compileComponents();
  });

  it('refreshes on init and lists saved sets with storage usage', () => {
    const fixture = create();

    expect(service.refresh).toHaveBeenCalledOnce();
    expect(text(fixture)).toContain('Friday night');
    expect(text(fixture)).toContain('mix.mp3');
    expect(text(fixture)).toContain('5.0 MB of 2.0 GB used');
  });

  it('shows an empty state and an unavailable state', () => {
    sets.set([]);
    expect(text(create())).toContain('No saved sets yet');

    status.set('unavailable');
    expect(text(create())).toContain('unavailable');
  });

  it('emits the downloaded files when a set is loaded', async () => {
    const files = [new File(['cue'], 'mix.cue'), new File(['audio'], 'mix.mp3')];
    service.load.mockResolvedValue(files);
    const fixture = create();
    const emitted = vi.fn();
    fixture.componentInstance.setLoaded.subscribe(emitted);

    button(fixture, 'Load').click();
    await fixture.whenStable();

    expect(emitted).toHaveBeenCalledWith({ set: savedSet, files });
  });

  it('shows an error when loading fails', async () => {
    service.load.mockRejectedValue(new Error('Unable to load mix.cue (404)'));
    const fixture = create();

    button(fixture, 'Load').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Unable to load "Friday night": Unable to load mix.cue (404)');
  });

  it('asks for confirmation before deleting', async () => {
    service.remove.mockResolvedValue(undefined);
    const fixture = create();

    button(fixture, 'Delete').click();
    fixture.detectChanges();
    expect(service.remove).not.toHaveBeenCalled();

    button(fixture, 'Cancel').click();
    fixture.detectChanges();
    expect(button(fixture, 'Delete')).toBeTruthy();

    button(fixture, 'Delete').click();
    fixture.detectChanges();
    button(fixture, 'Confirm delete').click();
    await fixture.whenStable();

    expect(service.remove).toHaveBeenCalledWith(savedSet);
  });
});

describe('formatBytes', () => {
  it('formats sizes with a sensible unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(93 * 1024 * 1024)).toBe('93.0 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });
});
