<script lang="ts">
  import { Card } from "@sveltestrap/sveltestrap";
  import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";
    import { getContext } from "svelte";
    import type { AppStore } from "../store/playlist-store";
  let playlist: DJSetTrackList | null;
  let formattedText = "";
  let appStore: AppStore;
  appStore = getContext("appStore");

  appStore.playlistStoreData.subscribe((value) => {
    playlist = value;
    convertTrackListToText();
    console.log(formattedText,'from Subscribe');
    
  });

  function convertTrackListToText(): void {
    if (playlist && playlist?.tracks.length !== 0) {
      playlist.tracks.forEach((track, index) => {
        formattedText += `${index + 1}: ${track.artist} - ${track.title} - ${track.playTime}\n`;
      });
    }
  }
</script>

<Card>
  {#if playlist}
    <textarea
      rows={playlist.tracks.length + 1}
      cols="80"
      id="playlistText"
      bind:value={formattedText}
    ></textarea>
  {/if}
</Card>
