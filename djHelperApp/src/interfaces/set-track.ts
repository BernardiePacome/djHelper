export interface SetTrack {
  title: string;
  artist: string;
  playTime: string;
}

export interface CueMarker {
  time: number;
  title: string;
  artist: string;
}

export interface PositionedCueMarker extends CueMarker {
  index: number;
  x: number;
}

export interface IndexedCueMarker extends CueMarker {
  index: number;
}
