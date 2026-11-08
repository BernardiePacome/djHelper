import { TestBed } from '@angular/core/testing';
import type { CueMarker } from '../set-track';
import { Waveform } from './waveform';

class MockAudioContext {
  public state: AudioContextState = 'running';
  public close = vi.fn(async () => {
    this.state = 'closed';
  });
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
    vi.stubGlobal('AudioContext', MockAudioContext);

    await TestBed.configureTestingModule({
      imports: [Waveform],
    }).compileComponents();
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
    await fixture.whenStable();
    return fixture;
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

  it('skips to the nearest previous or next cue', async () => {
    const component = (await createWaveform()).componentInstance;
    component.duration.set(60);
    const audio = createAudio({ paused: true, duration: 60, currentTime: 20 });

    component.skipToCue(audio, 'next');
    expect(audio.currentTime).toBe(30);

    component.skipToCue(audio, 'previous');
    expect(audio.currentTime).toBe(10);
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
