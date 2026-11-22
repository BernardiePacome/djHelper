import { CueMarker, SetTrack } from './set-track';

export interface ParsedCue {
  playlist: SetTrack[];
  trackMarkers: CueMarker[];
}
