import { Component, input } from '@angular/core';
import type { SetTrack } from '../set-track';

@Component({
  selector: 'app-track-list',
  standalone: true,
  templateUrl: './track-list.html',
  styleUrl: './track-list.scss'
})
export class TrackList {
  public readonly tracks = input.required<SetTrack[]>();
}
