<script lang="ts">
  import { Button, Card } from "@sveltestrap/sveltestrap";
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
  });

  function convertTrackListToText(): void {
    if (playlist && playlist?.tracks.length !== 0) {
      playlist.tracks.forEach((track, index) => {
        formattedText += `${index + 1}: ${track.artist} - ${track.title} - ${track.playTime}\n`;
      });
    }
  }

  function copyToClipboard() {
    const playlistText = document.getElementById(
      "playlistText",
    ) as HTMLTextAreaElement;
    playlistText.select();
    document.execCommand("copy");
  }
</script>

<Card>
  {#if playlist && playlist.tracks.length > 0}
    <textarea
      rows={playlist.tracks.length + 1}
      cols="80"
      id="playlistText"
      bind:value={formattedText}
    ></textarea>
    <span class="mt-2">
      <Button color="primary" on:click={copyToClipboard}>Copy to Clipboard</Button>
      <Button on:click={() => appStore.clearPlaylist()}>Clear Playlist</Button>
    </span>
  {/if}
</Card>
