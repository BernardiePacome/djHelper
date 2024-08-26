import { writable } from "svelte/store";
import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";

//Encapsulate Store in a Class
export class AppStore {
  public playlistStoreData = writable<DJSetTrackList>({ tracks: [] });
  public playlistEvent = writable<PlayListEvent>();
  constructor() {
    this.playlistEvent.subscribe((event) => {
      if (event === undefined) return;
      switch (event.eventName) {
        case SET_PLAYLIST:
          this.playlistStoreData.set(event.payload);
          break;
        case CLEAR_PLAYLIST:
          this.playlistStoreData.set({ tracks: [] });
          break;
        case UPDATE_PLAYLIST:
          this.playlistStoreData.update((storeData) => {
            return {
              tracks: [...storeData!.tracks, ...event!.payload!.tracks],
            };
          });
          break;
      }
    });

    $: this.playlistStoreData.subscribe((data) => {
      // console.log(data, "playlist Data has changed");
    });
  }
  setPlaylist(payload: DJSetTrackList) {
    this.playlistEvent.set(new PlaylistSet(payload));
  }
  clearPlaylist() {
    this.playlistEvent.set(new PlaylistClear());
  }
  updatePlaylist(payload: DJSetTrackList) {
    this.playlistEvent.set(new PlaylistUpdate(payload));
  }
}

const UPDATE_PLAYLIST = "updatePlaylist";
const CLEAR_PLAYLIST = "clearPlaylist";
const SET_PLAYLIST = "setPlaylist";

export interface PlayListEvent {
  eventName: string;
  payload: DJSetTrackList;
}

export class PlaylistSet implements PlayListEvent {
  constructor(payload: DJSetTrackList) {
    this.eventName = SET_PLAYLIST;
    this.payload = payload;
  }
  eventName: string;
  payload: DJSetTrackList;
}

export class PlaylistClear implements PlayListEvent {
  constructor() {
    this.eventName = CLEAR_PLAYLIST;
    this.payload = null;
  }
  eventName: string;
  payload: DJSetTrackList;
}

export class PlaylistUpdate implements PlayListEvent {
  eventName: string;
  payload: DJSetTrackList;

  constructor(payload: DJSetTrackList) {
    this.eventName = UPDATE_PLAYLIST;
    this.payload = payload;
  }
}
