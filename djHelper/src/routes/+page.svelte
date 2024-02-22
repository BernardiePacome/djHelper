
<div class="page">
    <div class="drag-and-drop-box">
        <Dropzone on:drop={handleFileSelect} />
    </div>
    <ol>
        {#each files.accepted as item}
          <li>{item.name}</li>
        {/each}
    </ol>
    <div>
        {#if files.accepted.length > 0}
            <textarea rows="100" cols="80" id="playlistText" value={playlistResult}></textarea>
        {/if}
    </div>
</div>

<style lang="scss">
  /* drag and drop box is a 500px square with a 5px border black border, it becomes a 10px blue border when hovered over */
    .drag-and-drop-box {
        border: 5px solid black;
        border-radius: 10px;
        &:hover {
            border-color: rgb(46, 46, 46);
        }
        background-color: rgb(22, 22, 22) !important;
        background: rgb(22, 22, 22);
    }
    /* The page is a 100% width and height container with a 10px padding dark grey */
    :global(body) {
        width: 100%;
        height: 100%;
        padding: 10px;
        background: rgb(22, 22, 22);
    }

    .dropzone{
        width: 500px;
        background: black !important;
    }

    // box sizing is border-box so that the padding is included in the width and height
    * {
        box-sizing: border-box;
    }
</style>

<script lang="ts">
    interface DJSetTrack {
        title: string;
        artist: string;   
    }
    // This is the script for the drag and drop box
    // It will be used to handle the drag and drop events
    import Dropzone from "svelte-file-dropzone";

    let playlistResult = "";
    let files = {
        accepted: [] as any,
        rejected: [] as any
    };

    function getCueFileTextContent(file: File): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                resolve(text);
            }
            reader.onerror = (e) => {
                reject(e);
            }
            reader.readAsText(file);
        });
    }

    function handleFileSelect(e:any) {;
        const {acceptedFiles, fileRejections } = e.detail;
        files.accepted = [...files.accepted, ...acceptedFiles];
        files.rejected = [...files.rejected , ...fileRejections ];
        getCueFileTextContent(files.accepted[0]).then((text) => {
           playlistResult = convertCueToPlaylistText(text);
        });
    }

    function convertCueToPlaylistText(cueFileText: string) : string{  
            const artist_re = /[\t\t| +]PERFORMER "(.*)"/g;
            const title_re = /[\t\t| +]TITLE "(.*)"/g;
            const index_re = /[\t\t| +]INDEX \d\d (.*)/g;

            const artists = [...cueFileText.matchAll(artist_re)];
            const titles = [...cueFileText.matchAll(title_re)];
            const indices = [...cueFileText.matchAll(index_re)];

            const setTracks : DJSetTrack[] = [];
            const startTimes: string[] = [];

            let playlistText = "";

            for (let i = 0; i < titles.length; i++) {
                const title = titles[i][1];
                const artist = artists[i][1] ?? "Unknown";
                const time = indices[i][1];
                // There are possibly duplicates in the cue file since the cue button
                // reinserts a track every time it is pressed, we need to conserve only the first time the track is played
                if (setTracks.find((track) => track.title === title && track.artist === artist) === undefined) {
                    setTracks.push({title, artist});
                    startTimes.push(time);
                    playlistText += `${i+1}: ${artist} - ${title} - ${time}\n`;
                }
            }

            return playlistText;
    }
</script>
