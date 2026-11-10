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
  describe('save button', () => {
    const render = (inputs: Record<string, boolean>) => {
      const fixture = TestBed.createComponent(PlaylistOutput);
      fixture.componentRef.setInput('tracks', tracks);
      for (const [name, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(name, value);
      }
      fixture.detectChanges();
      const saveButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        (element) => /Save|Saving|Saved/.test(element.textContent ?? ''),
      )!;
      return { fixture, saveButton };
    };

    it('is disabled until the set can be saved', () => {
      const { saveButton } = render({ canSave: false });
      expect(saveButton.disabled).toBe(true);
      expect(saveButton.textContent).toContain('Save Set');
    });

    it('emits saveRequested when enabled', () => {
      const { fixture, saveButton } = render({ canSave: true });
      const requested = vi.fn();
      fixture.componentInstance.saveRequested.subscribe(requested);

      saveButton.click();

      expect(saveButton.disabled).toBe(false);
      expect(requested).toHaveBeenCalledOnce();
    });

    it('shows progress and the saved state without allowing another save', () => {
      const saving = render({ canSave: true, isSaving: true }).saveButton;
      expect(saving.textContent).toContain('Saving');
      expect(saving.disabled).toBe(true);

      const saved = render({ canSave: true, isSaved: true }).saveButton;
      expect(saved.textContent).toContain('Saved');
      expect(saved.disabled).toBe(true);
    });
  });
});
