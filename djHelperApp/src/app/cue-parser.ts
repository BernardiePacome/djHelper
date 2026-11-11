import type { SetTrack } from './set-track';

export function parseCueTracks(cueText: string): SetTrack[] {
  const tracks: SetTrack[] = [];
  let currentTrack: Partial<SetTrack> | undefined;

  const flush = (): void => {
    if (currentTrack?.title && currentTrack.playTime) {
      tracks.push({
        title: currentTrack.title,
        artist: currentTrack.artist ?? 'Unknown',
        playTime: currentTrack.playTime
      });
    }
  };

  for (const line of cueText.split(/\r?\n/)) {
    if (/^\s*TRACK\s+\d+\s+/i.test(line)) {
      flush();
      currentTrack = {};
      continue;
    }

    if (!currentTrack) {
      continue;
    }

    const title = line.match(/^\s*TITLE\s+"(.*)"/i);
    const artist = line.match(/^\s*PERFORMER\s+"(.*)"/i);
    const index = line.match(/^\s*INDEX\s+01\s+(\S+)/i);

    if (title) {
      currentTrack.title = title[1];
    } else if (artist) {
      currentTrack.artist = artist[1];
    } else if (index) {
      currentTrack.playTime = index[1];
    }
  }

  flush();
  return tracks;
}
