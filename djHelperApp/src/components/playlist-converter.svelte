<script lang="ts">
  // import type { DJSetTrackList } from "src/interfaces/module/DjSetTrackList.interface";
  // This is the script for the drag and drop box
  // It will be used to handle the drag and drop events
  import Dropzone from "svelte-file-dropzone";
  import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";
  import { AppStore } from "../store/playlist-store";
  import { getContext, onMount } from "svelte";

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

    const setTracks: { title: string; artist: string }[] = [];

    if (titles.length !== artists.length) {
      cueFileError = true;
    }

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i][1];
      const artist = artists[i][1] ?? "Unknown";
      const time = indices[i][1];

      // There are possibly duplicates in the cue file since the cue button
      // reinserts a track every time it is pressed, we need to conserve only the first time the track is played
      if (
        setTracks.find(
          (track) => track.title === title && track.artist === artist,
        ) === undefined
      ) {
        newPlaylist.tracks.push({ title, artist, playTime: time });
      }
    }
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
  .playlist-converter-container {
    width: 80%;
    margin: 0 auto;
  }
  /* The page is a 100% width and height container with a 10px padding dark grey */
  :global(body) {
    width: 100%;
    height: 100%;
    padding: 10px;
    background: rgb(22, 22, 22);
  }
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
    color: white;
  }

  .error-message {
    color: red;
  }
</style>
