<script lang="ts">
  // import type { DJSetTrackList } from "src/interfaces/module/DjSetTrackList.interface";
  // This is the script for the drag and drop box
  // It will be used to handle the drag and drop events
  import Dropzone from "svelte-file-dropzone";
  import type { DJSetTrackList, SetTrack } from "../interfaces/module/DjSetTrackList.interface";
  import { AppStore } from "../store/playlist-store";
  import { getContext, onMount } from "svelte";
  import _ from "lodash/fp";

  let files = {
    accepted: [] as any,
    rejected: [] as any,
  };

  let cueFileError = false;

  let appStore: AppStore;
  appStore = getContext("appStore");

  function getCueFileTextContent(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve(text);
      };
      reader.onerror = (e) => {
        reject(e);
      };
      reader.readAsText(file);
    });
  }

  function handleFileSelect(e: any) {
    const { acceptedFiles, fileRejections } = e.detail;
    files.accepted = [...files.accepted, ...acceptedFiles];
    files.rejected = [...files.rejected, ...fileRejections];
    getCueFileTextContent(files.accepted[0]).then((text) => {
      handleConvertCueFile(text);
    });
  }

  /**
   * This function will compare two tracks and return true if they are the same
   * a track is the same if both their title and artist are the same
  */
  function trackComparatorFunction(track1: SetTrack, track2: SetTrack) : boolean {
    return track1.title === track2.title && track1.artist === track2.artist;
  }
    

  function handleConvertCueFile(cueFileText: string): void {
    // reinitialize the playlist
    let newPlaylist: DJSetTrackList = { tracks: [] };

    const artist_re = /[\t\t| +]PERFORMER "(.*)"/g;
    const title_re = /[\t\t| +]TITLE "(.*)"/g;
    const index_re = /[\t\t| +]INDEX \d\d (.*)/g;

    const artists = [...cueFileText.matchAll(artist_re)];
    const titles = [...cueFileText.matchAll(title_re)];
    const indices = [...cueFileText.matchAll(index_re)];

    // Time indices is in time format that looks like 00:00:00,
    // if the set is longer than 1 hour, it will be 00:00:00,
    // if the set is shorter than 1 hour, it will be 00:00,
    // so if the last song was started at hour 00 we can remove the hour part
    if (indices[indices.length - 1][1].split(":")[0] === "00") {
      indices.forEach((index) => {
        index[1] = index[1].substring(3);
      });
    }

    if (titles.length !== artists.length) {
      cueFileError = true;
    }

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i][1];
      const artist = artists[i][1] ?? "Unknown";
      const playTime = indices[i][1];

      newPlaylist.tracks.push({ title, artist, playTime });
    }
    newPlaylist.tracks = _.uniqWith(trackComparatorFunction, newPlaylist.tracks);
    appStore.setPlaylist(newPlaylist);
  }
    // dispatch event to other components
</script>

<div class="playlist-converter-container">
  <Dropzone on:drop={handleFileSelect} />
</div>

{#if files.accepted.length > 0}
  <p class="filename">{files.accepted[0].name}</p>
{/if}

{#if cueFileError === true}
  <p class="error-message">Please check the cue file for missing field</p>
{/if}

<style lang="scss">

  /* The page is a 100% width and height container with a 10px padding dark grey */
  
  :global(.dropzone) {
    background: black !important;
  }
  textarea {
    padding: 5px;
    background: black;
    color: white;
    border: 2px solid black;
    border-radius: 10px;
    width: 100%;
  }

  .filename {
    display: flex;
    justify-content: center;
    color: white;
    margin-top: 12px;
  }

  .error-message {
    color: red;
  }
</style>
