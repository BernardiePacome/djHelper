import { Injectable, signal } from '@angular/core';

// Tracks which waveform is playing so the others can pause: only one set plays at a time.
@Injectable({ providedIn: 'root' })
export class ActivePlayer {
  public readonly activeId = signal<string | null>(null);
}
