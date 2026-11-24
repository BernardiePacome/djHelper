import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PlaybackOptionsService } from '../../services/playback-options.service/playback-options.service';
import { OptionsPanel } from './options-panel';

describe('OptionsPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionsPanel],
    }).compileComponents();
  });

  it('sets the crossfade duration between 0s and 5s', () => {
    const fixture = TestBed.createComponent(OptionsPanel);
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector(
      'input[aria-label="Crossfade duration in seconds"]',
    ) as HTMLInputElement;
    const options = TestBed.inject(PlaybackOptionsService);

    expect(slider.min).toBe('0');
    expect(slider.max).toBe('5');
    expect(fixture.nativeElement.textContent).not.toMatch(/\b[AB]\b/);

    slider.value = '0.05';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(options.crossfadeDuration()).toBe(0.05);
    expect(fixture.nativeElement.querySelector('output').textContent.trim()).toBe('0.05s');
  });

  it('updates whether playlist output text is shown from its checkbox', () => {
    const fixture = TestBed.createComponent(OptionsPanel);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"][aria-label="Show playlist output text"]',
    ) as HTMLInputElement;
    const options = TestBed.inject(PlaybackOptionsService);

    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(options.showPlaylistOutputText()).toBe(true);
  });
});
