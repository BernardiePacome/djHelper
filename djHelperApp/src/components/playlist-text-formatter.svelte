<script lang="ts">
    import { Card } from "@sveltestrap/sveltestrap";
    import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";
    export let playlist: DJSetTrackList = null;

    function convertTrackListToText(): string {
    let formattedText = "";
    if(playlist){
    playlist.tracks.forEach((track, index) => {
      formattedText += `${index + 1}: ${track.artist} - ${track.title} - ${track.playTime}\n`;
    });
    
    return formattedText;
  }
  return "";
}
</script>

<Card>
    {#if playlist}
    <textarea
    rows={playlist.tracks.length + 1}
    cols="80"
    id="playlistText"
    value={convertTrackListToText()}
  ></textarea>
  {/if}

</Card>