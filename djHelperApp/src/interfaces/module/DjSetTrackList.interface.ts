interface TrackList {
  tracks: SetTrack[];
}

export interface SetTrack {
  title: string;
  artist: string;
  playTime: string;
}

export type DJSetTrackList = TrackList | null;
