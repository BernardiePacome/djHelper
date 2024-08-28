<script lang="ts">
  import { onMount, setContext } from "svelte";
  import PlaylistConverter from "../components/playlist-converter.svelte";
  import PlaylistEditor from "../components/playlist-editor.svelte";
  import PlaylistTextFormatter from "../components/playlist-text-formatter.svelte";
  import type { DJSetTrackList } from "../interfaces/module/DjSetTrackList.interface";
  import "../styles/global.scss";
  import {
    Accordion,
    AccordionItem,
    Styles,
    Theme,
  } from "@sveltestrap/sveltestrap";
    import { AppStore } from "../store/playlist-store";

setContext("appStore", new AppStore());

</script>

<!-- svelteStrap import -->
<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
  />
</svelte:head>
<html lang="en" data-bs-theme="dark">
  <Theme theme="dark">
    <Styles />
    <PlaylistConverter></PlaylistConverter>
    <Accordion stayOpen>
      <AccordionItem header="Playlist Editor">
        <PlaylistEditor />
      </AccordionItem>
      <AccordionItem header="Playlist Text">
        <PlaylistTextFormatter />
      </AccordionItem>
    </Accordion>
  </Theme>
</html>

<style lang="scss">
  html {
    height: 100%;
    padding: 0 10% 0 10%;
  }
  body {
    height: 100%;
    
  }
  #svelte {
    height: 100%;
  }
</style>