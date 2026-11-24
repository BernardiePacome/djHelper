import { Component, input } from '@angular/core';
import { SavedSet } from '../../interfaces/saved-set';

@Component({
  selector: 'app-loaded-sets-info',
  standalone: true,
  templateUrl: './loaded-sets-info.html',
  styleUrl: './loaded-sets-info.scss',
})
export class LoadedSetsInfo {
  public readonly sets = input.required<SavedSet[]>();
  public readonly loadedSetIds = input<readonly string[]>([]);
  public readonly playingSetId = input<string | null>(null);
}
