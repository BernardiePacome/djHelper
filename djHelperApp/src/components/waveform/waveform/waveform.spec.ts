import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlaybackOptionsService } from '../../../app/services/playback-options.service';
import { Waveform } from './waveform';
import { CueMarker } from '../../../interfaces/set-track';

class MockOfflineAudioContext {
  public decodeAudioData = vi.fn(async () => ({
    duration: 60,
    getChannelData: () => Float32Array.from([0, 0.5, -1, 0]),
  }));
}

describe('Waveform', () => {
  const markers: CueMarker[] = [
    { time: 10, artist: 'Artist One', title: 'Track One' },
    { time: 30, artist: 'Artist Two', title: 'Track Two' },
    { time: 50, artist: 'Artist Three', title: 'Track Three' },
  ];

  let createObjectURLDescriptor: PropertyDescriptor | undefined;
  let revokeObjectURLDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test-audio'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

    await TestBed.configureTestingModule({
      imports: [Waveform],
    }).compileComponents();
    TestBed.inject(PlaybackOptionsService).crossfadeDuration.set(0.2);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (createObjectURLDescriptor) {
      Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (revokeObjectURLDescriptor) {
      Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  async function createWaveform() {
    const file = new File(['audio data'], 'set.wav');
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });
    const fixture = TestBed.createComponent(Waveform);
    fixture.componentRef.setInput('file', file);
    fixture.componentRef.setInput('trackMarkers', markers);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  // Lets the asynchronous waveform load finish; whenStable alone does not cover every awaited step.
  async function settle(fixture: ComponentFixture<Waveform>) {
    await fixture.whenStable();
    for (let attempt = 0; attempt < 20 && fixture.componentInstance.isLoading(); attempt++) {
      await Promise.resolve();
    }
  }

  function createAudio(options: { paused: boolean; duration: number; currentTime: number }) {
    const audio = document.createElement('audio');
    Object.defineProperties(audio, {
      paused: { configurable: true, value: options.paused },
      duration: { configurable: true, value: options.duration },
      currentTime: { configurable: true, writable: true, value: options.currentTime },
      ended: { configurable: true, value: false },
      play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
      pause: { configurable: true, value: vi.fn() },
    });
    return audio;
  }

  describe('save button', () => {
    const render = async (inputs: Record<string, boolean>) => {
      const fixture = await createWaveform();
      for (const [name, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(name, value);
      }
      fixture.detectChanges();
      const buttons = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.player-controls button'),
      );
      const saveButton = buttons.find((element) =>
        /Save|Saving|Saved/.test(element.textContent ?? ''),
      )!;
      return { fixture, buttons, saveButton: saveButton as HTMLButtonElement };
    };

    it('sits right after the next transition button and is disabled until the set can be saved', async () => {
      const { buttons, saveButton } = await render({ canSave: false });
      expect(buttons.indexOf(saveButton)).toBe(
        buttons.findIndex((button) => button.getAttribute('aria-label') === 'Next Transition') + 1,
      );
      expect(saveButton.disabled).toBe(true);
      expect(saveButton.textContent).toContain('Save Set');
    });

    it('emits saveRequested when enabled', async () => {
      const { fixture, saveButton } = await render({ canSave: true });
      const requested = vi.fn();
      fixture.componentInstance.saveRequested.subscribe(requested);

      saveButton.click();

      expect(saveButton.disabled).toBe(false);
      expect(requested).toHaveBeenCalledOnce();
    });

    it('shows progress and the saved state without allowing another save', async () => {
      const saving = (await render({ canSave: true, isSaving: true })).saveButton;
      expect(saving.textContent).toContain('Saving');
      expect(saving.disabled).toBe(true);

      const saved = (await render({ canSave: true, isSaved: true })).saveButton;
      expect(saved.textContent).toContain('Saved');
      expect(saved.disabled).toBe(true);
    });
  });

  it('renders the decoded waveform and duration after loading', async () => {
    const fixture = await createWaveform();
    fixture.detectChanges();

    expect(fixture.componentInstance.duration()).toBe(60);
    expect(fixture.componentInstance.peaks()).toEqual([0, 0.5, 1, 0]);
    expect(fixture.componentInstance.isLoading()).toBe(false);
    const path = fixture.nativeElement.querySelector('.bars-main') as SVGPathElement;
    expect(path.getAttribute('d')).toContain('v66');
    expect(path.getAttribute('d')).not.toContain('NaN');
  });

  it('reports an analysis failure without replacing the current player', async () => {
    const fixture = await createWaveform();
    const source = fixture.componentInstance.audioSource();
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = vi.fn().mockRejectedValue(new Error('Invalid audio'));
      },
    );
    const file = new File(['broken'], 'broken.wav');
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });
    fixture.componentRef.setInput('file', file);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.errorMessage()).toContain('Invalid audio'),
    );
    expect(fixture.componentInstance.audioSource()).toBe(source);
    expect(fixture.componentInstance.isLoading()).toBe(false);
  });

  it('keeps the current player while a new file is being analyzed', async () => {
    const fixture = await createWaveform();
    fixture.detectChanges();
    const player = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const firstSource = player.getAttribute('src');

    let finishDecoding: () => void = () => undefined;
    const nextFile = new File(['next audio'], 'next.wav');
    Object.defineProperty(nextFile, 'arrayBuffer', {
      value: vi.fn(
        () =>
          new Promise<ArrayBuffer>(
            (resolve) => (finishDecoding = () => resolve(new ArrayBuffer(4))),
          ),
      ),
    });
    fixture.componentRef.setInput('file', nextFile);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.isLoading()).toBe(true);
    expect(fixture.nativeElement.querySelector('audio')).toBe(player);
    expect(player.getAttribute('src')).toBe(firstSource);

    finishDecoding();
    await vi.waitFor(() => expect(fixture.componentInstance.isLoading()).toBe(false));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeFile()).toBe(nextFile);
  });

  describe('server waveform cache', () => {
    const cacheId = '11111111-1111-4111-8111-111111111111';

    it('uses the cached waveform instead of analyzing the file', async () => {
      const cached = { peaks: [0.1, 0.9], duration: 42 };
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(cached)));
      vi.stubGlobal('fetch', fetchMock);
      const audioContext = vi.fn();
      vi.stubGlobal('OfflineAudioContext', audioContext);

      const fixture = TestBed.createComponent(Waveform);
      fixture.componentRef.setInput('file', new File(['audio data'], 'set.wav'));
      fixture.componentRef.setInput('cacheFileId', cacheId);
      fixture.detectChanges();
      await settle(fixture);

      expect(fetchMock).toHaveBeenCalledWith(`/api/files/${cacheId}/waveform`);
      expect(fixture.componentInstance.duration()).toBe(42);
      expect(fixture.componentInstance.peaks()).toEqual([0.1, 0.9]);
      expect(audioContext).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('analyzes and uploads the waveform when the server has none', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetchMock);
      const file = new File(['audio data'], 'set.wav');
      Object.defineProperty(file, 'arrayBuffer', {
        value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });

      const fixture = TestBed.createComponent(Waveform);
      fixture.componentRef.setInput('file', file);
      fixture.componentRef.setInput('cacheFileId', cacheId);
      fixture.detectChanges();
      await settle(fixture);

      expect(fixture.componentInstance.duration()).toBe(60);
      const upload = fetchMock.mock.calls[1];
      expect(upload[0]).toBe(`/api/files/${cacheId}/waveform`);
      expect(upload[1].method).toBe('PUT');
      expect(JSON.parse(upload[1].body)).toMatchObject({ duration: 60 });
    });

    it('uploads an already analyzed waveform once its set is saved', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetchMock);
      const fixture = await createWaveform();

      fixture.componentRef.setInput('cacheFileId', cacheId);
      fixture.detectChanges();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    });
  });

  it('updates the current time from the audio player', async () => {
    const component = (await createWaveform()).componentInstance;

    component.onAudioTimeUpdate(createAudio({ paused: true, duration: 60, currentTime: 17 }));

    expect(component.currentTime()).toBe(17);
    expect(component.formattedCurrentTime()).toBe('0:00:17');
  });

  it('starts and pauses audio playback', async () => {
    const component = (await createWaveform()).componentInstance;
    const pausedAudio = createAudio({ paused: true, duration: 60, currentTime: 0 });

    await component.togglePlayback(pausedAudio);

    expect(pausedAudio.play).toHaveBeenCalledOnce();
    expect(component.playbackError()).toBe('');

    const playingAudio = createAudio({ paused: false, duration: 60, currentTime: 0 });
    await component.togglePlayback(playingAudio);

    expect(playingAudio.pause).toHaveBeenCalledOnce();
  });

  it('fades the playing waveform out when another one starts', async () => {
    vi.useFakeTimers();
    try {
      const first = await createWaveform();
      const second = await createWaveform();
      first.detectChanges();
      second.detectChanges();
      const firstAudio = first.nativeElement.querySelector('audio') as HTMLAudioElement;
      const secondAudio = second.nativeElement.querySelector('audio') as HTMLAudioElement;
      Object.defineProperty(firstAudio, 'paused', { configurable: true, value: false });
      Object.defineProperty(secondAudio, 'paused', { configurable: true, value: false });
      const pauseFirst = vi.spyOn(firstAudio, 'pause').mockImplementation(() => undefined);

      first.componentInstance.onAudioPlay(firstAudio);
      expect(firstAudio.volume).toBe(1);
      second.componentInstance.onAudioPlay(secondAudio);
      expect(secondAudio.volume).toBe(0);

      vi.advanceTimersByTime(100);
      expect(firstAudio.volume).toBeGreaterThan(0);
      expect(firstAudio.volume).toBeLessThan(1);
      expect(secondAudio.volume).toBeGreaterThan(0);
      expect(secondAudio.volume).toBeLessThan(1);
      expect(pauseFirst).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);
      expect(secondAudio.volume).toBe(1);
      expect(pauseFirst).toHaveBeenCalledOnce();
      expect(first.nativeElement.querySelector('.deck-label')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports playback failures', async () => {
    const component = (await createWaveform()).componentInstance;
    const audio = createAudio({ paused: true, duration: 60, currentTime: 0 });
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('blocked')),
    });

    await component.togglePlayback(audio);

    expect(component.playbackError()).toBe('Unable to play audio: blocked');
  });

  it('stops playback when the audio element reports an error', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const fixture = await createWaveform();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const audio = createAudio({ paused: false, duration: 60, currentTime: 0 });
    component.onAudioPlay(audio);

    component.onAudioError();
    fixture.detectChanges();

    expect(component.isPlaying()).toBe(false);
    expect(component.playbackError()).toBe('Unable to play this audio file.');
  });

  it('updates playback state when playback starts, pauses, and ends', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const component = (await createWaveform()).componentInstance;
    const audio = createAudio({ paused: false, duration: 60, currentTime: 12 });

    component.onAudioPlay(audio);
    expect(component.isPlaying()).toBe(true);
    expect(component.currentTime()).toBe(12);

    component.onAudioPause();
    expect(component.isPlaying()).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);

    component.onAudioPlay(audio);
    component.onAudioEnded();
    expect(component.isPlaying()).toBe(false);
  });

  it('highlights only the playing panel and clears the highlight on pause or end', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const playing = await createWaveform();
    const other = await createWaveform();
    playing.detectChanges();
    other.detectChanges();
    const panel = playing.nativeElement.querySelector('.waveform-panel') as HTMLElement;
    const otherPanel = other.nativeElement.querySelector('.waveform-panel') as HTMLElement;
    const audio = playing.nativeElement.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });

    expect(panel.classList.contains('is-playing')).toBe(false);
    audio.dispatchEvent(new Event('play'));
    playing.detectChanges();
    expect(panel.classList.contains('is-playing')).toBe(true);
    expect(otherPanel.classList.contains('is-playing')).toBe(false);

    audio.dispatchEvent(new Event('pause'));
    playing.detectChanges();
    expect(panel.classList.contains('is-playing')).toBe(false);

    audio.dispatchEvent(new Event('play'));
    playing.detectChanges();
    audio.dispatchEvent(new Event('ended'));
    playing.detectChanges();
    expect(panel.classList.contains('is-playing')).toBe(false);
  });

  it('seeks to the clicked waveform position', async () => {
    const component = (await createWaveform()).componentInstance;
    const audio = createAudio({ paused: true, duration: 100, currentTime: 0 });
    const waveform = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.defineProperty(waveform, 'getBoundingClientRect', {
      value: () => ({ left: 10, width: 100 }),
    });
    const event = new MouseEvent('click', { clientX: 60 });
    Object.defineProperty(event, 'currentTarget', { value: waveform });

    component.seekAudio(event, audio);

    expect(audio.currentTime).toBe(50);
    expect(component.currentTime()).toBe(50);
  });

  it('seeks to a playlist transition while preserving playback', async () => {
    const fixture = await createWaveform();
    fixture.detectChanges();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    await fixture.componentInstance.seekToTime(30);

    expect(audio.currentTime).toBe(30);
    expect(fixture.componentInstance.currentTime()).toBe(30);
    expect(audio.volume).toBe(1);
    expect(pause).not.toHaveBeenCalled();

    await fixture.componentInstance.seekToTime(61);
    expect(audio.currentTime).toBe(30);
  });

  it('skips to the nearest previous or next cue', async () => {
    const component = (await createWaveform()).componentInstance;
    component.duration.set(60);
    const audio = createAudio({ paused: true, duration: 60, currentTime: 20 });

    await component.skipToCue(audio, 'next');
    expect(audio.currentTime).toBe(30);

    await component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(8);
    expect(component.currentTime()).toBe(8);
  });

  it('crossfades linearly between the old and new position when skipping while playing', async () => {
    vi.useFakeTimers();
    try {
      const clones: { currentTime: number; volume: number; play: () => void; pause: () => void }[] =
        [];
      vi.stubGlobal(
        'Audio',
        vi.fn(function () {
          const clone = { currentTime: 0, volume: 1, play: vi.fn(), pause: vi.fn() };
          clones.push(clone);
          return clone;
        }),
      );
      const component = (await createWaveform()).componentInstance;
      component.duration.set(60);
      const audio = createAudio({ paused: false, duration: 60, currentTime: 20 });

      await component.skipToCue(audio, 'next');

      expect(audio.currentTime).toBe(30);
      expect(clones[0].currentTime).toBe(20);
      expect(clones[0].play).toHaveBeenCalledOnce();
      expect(audio.volume).toBe(0);

      vi.advanceTimersByTime(100);
      expect(audio.volume).toBeGreaterThan(0.4);
      expect(audio.volume).toBeLessThan(0.6);
      expect(audio.volume + clones[0].volume).toBeCloseTo(1, 5);

      vi.advanceTimersByTime(150);
      expect(audio.volume).toBe(1);
      expect(clones[0].volume).toBe(0);
      expect(clones[0].pause).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps fading out the previous position when another transition is pressed mid-fade', async () => {
    vi.useFakeTimers();
    try {
      const clones: { currentTime: number; volume: number; play: () => void; pause: () => void }[] =
        [];
      vi.stubGlobal(
        'Audio',
        vi.fn(function () {
          const clone = { currentTime: 0, volume: 1, play: vi.fn(), pause: vi.fn() };
          clones.push(clone);
          return clone;
        }),
      );
      const component = (await createWaveform()).componentInstance;
      component.duration.set(60);
      const audio = createAudio({ paused: false, duration: 60, currentTime: 20 });

      await component.skipToCue(audio, 'next');
      vi.advanceTimersByTime(100);
      await component.skipToCue(audio, 'previous');

      expect(clones).toHaveLength(2);
      expect(clones[0].pause).not.toHaveBeenCalled();
      expect(audio.volume).toBe(0);

      vi.advanceTimersByTime(250);
      expect(clones.every((clone) => clone.volume === 0)).toBe(true);
      expect(audio.volume).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues to earlier transitions on repeated previous skips', async () => {
    const component = (await createWaveform()).componentInstance;
    component.duration.set(60);
    const audio = createAudio({ paused: true, duration: 60, currentTime: 55 });

    await component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(48);
    await component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(28);
    await component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(8);
    expect(component.hasPreviousCue()).toBe(false);
  });

  it('clamps a previous transition near the start to zero', async () => {
    const fixture = await createWaveform();
    fixture.componentRef.setInput('trackMarkers', [{ time: 1, artist: 'A', title: 'B' }]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.duration.set(60);
    const audio = createAudio({ paused: true, duration: 60, currentTime: 5 });

    await component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(0);
    expect(component.currentTime()).toBe(0);
    expect(component.hasPreviousCue()).toBe(false);
  });

  it('shows, hides, and pins cue marker tooltips', async () => {
    const component = (await createWaveform()).componentInstance;
    component.duration.set(60);
    const marker = { ...markers[0], index: 0, x: 200 };

    component.showMarkerTooltip(marker);
    expect(component.activeTooltipMarkers()).toHaveLength(1);
    expect(component.activeTooltipMarkers()[0].marker.title).toBe('Track One');

    component.hideMarkerTooltip();
    expect(component.activeTooltipMarkers()).toEqual([]);

    component.togglePinnedMarker(marker);
    expect(component.activeTooltipMarkers()).toHaveLength(1);
    component.togglePinnedMarker(marker);
    expect(component.activeTooltipMarkers()).toEqual([]);
  });

  it('toggles a cue marker with Enter and Space keys', async () => {
    const component = (await createWaveform()).componentInstance;
    component.duration.set(60);
    const marker = { ...markers[0], index: 0, x: 200 };
    const event = (key: string) =>
      ({
        key,
        preventDefault: vi.fn(),
      }) as unknown as KeyboardEvent;

    const enterEvent = event('Enter');
    component.onMarkerKeydown(enterEvent, marker);
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
    expect(component.activeTooltipMarkers()).toHaveLength(1);

    const spaceEvent = event(' ');
    component.onMarkerKeydown(spaceEvent, marker);
    expect(spaceEvent.preventDefault).toHaveBeenCalledOnce();
    expect(component.activeTooltipMarkers()).toEqual([]);
  });
});
