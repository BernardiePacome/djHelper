import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-cue-file-dropzone',
  standalone: true,
  templateUrl: './cue-file-dropzone.html',
  styleUrl: './cue-file-dropzone.scss'
})
export class CueFileDropzone {
  public readonly fileName = input('');
  public readonly audioFileName = input('');
  public readonly errorMessage = input('');
  public readonly filesSelected = output<File[]>();
  public readonly clearRequested = output<void>();
  public readonly isDragging = signal(false);

  public onFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const files = inputElement.files ? Array.from(inputElement.files) : [];

    if (files.length > 0) {
      this.filesSelected.emit(files);
    }

    inputElement.value = '';
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length > 0) {
      this.filesSelected.emit(files);
    }
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  public onDragLeave(): void {
    this.isDragging.set(false);
  }
}
