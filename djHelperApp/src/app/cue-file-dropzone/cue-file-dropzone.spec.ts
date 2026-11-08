import { TestBed } from '@angular/core/testing';
import { CueFileDropzone } from './cue-file-dropzone';

describe('CueFileDropzone', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CueFileDropzone],
    }).compileComponents();
  });

  it('emits selected files and clears the file input', () => {
    const fixture = TestBed.createComponent(CueFileDropzone);
    const component = fixture.componentInstance;
    const file = new File(['cue data'], 'set.cue');
    const inputElement = { files: [file], value: 'selected' } as unknown as HTMLInputElement;
    const selectedFiles: File[][] = [];
    component.filesSelected.subscribe((files) => selectedFiles.push(files));

    component.onFileSelected({ target: inputElement } as unknown as Event);

    expect(selectedFiles).toEqual([[file]]);
    expect(inputElement.value).toBe('');
  });

  it('does not emit when the file selection is empty', () => {
    const component = TestBed.createComponent(CueFileDropzone).componentInstance;
    const inputElement = { files: null, value: 'selected' } as unknown as HTMLInputElement;
    const selectedFiles: File[][] = [];
    component.filesSelected.subscribe((files) => selectedFiles.push(files));

    component.onFileSelected({ target: inputElement } as unknown as Event);

    expect(selectedFiles).toEqual([]);
    expect(inputElement.value).toBe('');
  });

  it('updates dragging state while dragging over and leaving the dropzone', () => {
    const component = TestBed.createComponent(CueFileDropzone).componentInstance;
    const event = new Event('dragover');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    component.onDragOver(event as DragEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(component.isDragging()).toBe(true);

    component.onDragLeave();
    expect(component.isDragging()).toBe(false);
  });

  it('emits dropped files, prevents the browser default, and clears dragging state', () => {
    const component = TestBed.createComponent(CueFileDropzone).componentInstance;
    const file = new File(['audio data'], 'track.mp3');
    const event = new Event('drop') as DragEvent;
    const preventDefault = vi.spyOn(event, 'preventDefault');
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    const selectedFiles: File[][] = [];
    component.filesSelected.subscribe((files) => selectedFiles.push(files));
    component.isDragging.set(true);

    component.onDrop(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(selectedFiles).toEqual([[file]]);
    expect(component.isDragging()).toBe(false);
  });

  it('does not emit when no files are dropped', () => {
    const component = TestBed.createComponent(CueFileDropzone).componentInstance;
    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: null });
    const selectedFiles: File[][] = [];
    component.filesSelected.subscribe((files) => selectedFiles.push(files));

    component.onDrop(event);

    expect(selectedFiles).toEqual([]);
  });
});
