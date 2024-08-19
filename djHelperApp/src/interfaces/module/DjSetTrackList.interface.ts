interface TrackList {
  tracks: SetTrack[];
}

interface SetTrack {
  title: string;
  artist: string;
  playTime: string;
}

export type DJSetTrackList = TrackList | null;
