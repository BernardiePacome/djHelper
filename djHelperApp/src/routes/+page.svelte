<script lang="ts">
  import PlaylistConverter from "../components/playlist-converter.svelte";
  import PlaylistEditor from "../components/playlist-editor.svelte";
  import PlaylistTextFormatter from "../components/playlist-text-formatter.svelte";
  import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";
  import '../styles/global.scss';
  import { Accordion, AccordionItem, Styles, Theme } from '@sveltestrap/sveltestrap';

  let playlist: DJSetTrackList | null = null;
</script>


<!-- svelteStrap import -->
<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
</svelte:head>
<html lang="en"
data-bs-theme="dark">
<Theme theme="dark" >
<Styles />

<PlaylistConverter bind:playlist/>
<Accordion>
  <AccordionItem header="Playlist Editor">
    <PlaylistEditor bind:playlist />
  </AccordionItem>
  <AccordionItem header="Playlist Text">
    <PlaylistTextFormatter bind:playlist />
    </AccordionItem> 
</Accordion>
</Theme>  

</html>