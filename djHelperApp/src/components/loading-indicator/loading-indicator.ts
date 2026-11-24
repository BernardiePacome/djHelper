import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  templateUrl: './loading-indicator.html',
  styleUrl: './loading-indicator.scss',
})
export class LoadingIndicator {
  public readonly label = input('Loading…');
}
