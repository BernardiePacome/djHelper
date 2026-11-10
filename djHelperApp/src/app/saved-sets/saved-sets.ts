import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, output, signal } from '@angular/core';
import { SavedSetsService } from './saved-sets.service';
import type { SavedSet } from './saved-sets.service';

export interface LoadedSet {
  set: SavedSet;
  files: File[];
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

@Component({
  selector: 'app-saved-sets',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './saved-sets.html',
  styleUrl: './saved-sets.scss'
})
export class SavedSets implements OnInit {
  private readonly savedSets = inject(SavedSetsService);

  public readonly setLoaded = output<LoadedSet>();

  public readonly sets = this.savedSets.sets;
  public readonly storage = this.savedSets.storage;
  public readonly status = this.savedSets.status;
  public readonly busySetId = signal<string | null>(null);
  public readonly pendingDeleteId = signal<string | null>(null);
  public readonly errorMessage = signal('');
  public readonly formatBytes = formatBytes;

  public ngOnInit(): void {
    void this.savedSets.refresh();
  }

  public async load(set: SavedSet): Promise<void> {
    await this.runFor(set, async () => {
      this.setLoaded.emit({ set, files: await this.savedSets.load(set) });
    }, 'load');
  }

  public async delete(set: SavedSet): Promise<void> {
    this.pendingDeleteId.set(null);
    await this.runFor(set, () => this.savedSets.remove(set), 'delete');
  }

  private async runFor(set: SavedSet, action: () => Promise<void>, verb: string): Promise<void> {
    this.busySetId.set(set.id);
    this.errorMessage.set('');

    try {
      await action();
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage.set(`Unable to ${verb} "${set.name}": ${details}`);
    } finally {
      this.busySetId.set(null);
    }
  }
}
