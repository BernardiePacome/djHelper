import { SavedSet } from './saved-set';
import { SetTrack } from './set-track';

export interface TextSegment {
  text: string;
  match: boolean;
}

export interface ResultRow {
  set: SavedSet;
  name: TextSegment[];
  tracks: { artist: TextSegment[]; title: TextSegment[]; playTime: string }[];
  hiddenTrackCount: number;
}

export interface SetSearchResult {
  set: SavedSet;
  nameMatch: boolean;
  tracks: SetTrack[];
}
