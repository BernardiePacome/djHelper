<script lang="ts">
  interface DJSetTrack {
    title: string;
    artist: string;
  }
  // This is the script for the drag and drop box
  // It will be used to handle the drag and drop events
  import Dropzone from "svelte-file-dropzone";

  let files = {
    accepted: [] as any,
    rejected: [] as any,
  };
  
  let playlistResult = "";
  let playlistText = "";
  let totalNumberOfTracks = 0;
  let cueFileError = false;

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
      playlistResult = convertCueToPlaylistText(text);
    });
  }

  function copyToClipboard() {
    const playlistText = document.getElementById(
      "playlistText",
    ) as HTMLTextAreaElement;
    playlistText.select();
    document.execCommand("copy");
  }

  function convertCueToPlaylistText(cueFileText: string): string {
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

    const setTracks: DJSetTrack[] = [];
    const startTimes: string[] = [];

    if (titles.length !== artists.length){
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
        setTracks.push({ title, artist });
        startTimes.push(time);
      }
    }

    setTracks.forEach((track, index) => {
      playlistText += `${index + 1}: ${track.artist} - ${track.title} - ${startTimes[index]}\n`;
    });
    totalNumberOfTracks = setTracks.length;
    
    return playlistText;
  }
</script>

<div class="playlist-converter-container">
  <Dropzone on:drop={handleFileSelect} />
  {#if files.accepted.length > 0}
    <div class="action-row">
      <p class="filename">{files.accepted[0].name}</p>
      <button class="cta-button" on:click={copyToClipboard}
        >Copy to clipboadsfgr\erdgs\gwerETATHRArd</button
      >
    </div>
    <textarea
      rows={totalNumberOfTracks + 1}
      cols="80"
      id="playlistText"
      value={playlistResult}
    ></textarea>
    <div class="action-row">
      <button
        class="cta-button"
        style="align-items: end;"
        on:click={() => {
          files.accepted = [];
          playlistResult = "";
        }}>Clear</button
      >
    </div>
  {/if}
  {#if cueFileError === true}
    <p class="error-message">Please check the cue file for missing field</p>
  {/if}
</div>

<style lang="scss">
  .playlist-converter-container {
    width: 70%;
  }
  .action-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .cta-button {
    background-color: black;
    color: white;
    border: 2px solid white;
    padding: 10px;
    margin-left: 10px;
    &:hover {
      background-color: rgb(29, 29, 29);
      color: grey;
      border: 2px solid grey;
    }
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
