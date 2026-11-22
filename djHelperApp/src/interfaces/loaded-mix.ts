import { CueMarker, SetTrack } from './set-track';

// One recording on the page: its audio player and, once a cue file is paired, its tracklist.
export interface LoadedMix {
  id: number;
  audioFile: File | null;
  cueFile: File | null;
  playlist: SetTrack[];
  trackMarkers: CueMarker[];
  savedSetId: string | null;
  isSaving: boolean;
}
