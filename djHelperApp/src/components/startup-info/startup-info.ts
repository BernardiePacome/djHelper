import { Component, input } from '@angular/core';
import { SavedSet } from '../../interfaces/saved-set';

@Component({
  selector: 'app-startup-info',
  standalone: true,
  templateUrl: './startup-info.html',
  styleUrl: './startup-info.scss',
})
export class StartupInfo {
  public readonly sets = input.required<SavedSet[]>();
}
