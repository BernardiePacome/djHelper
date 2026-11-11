# djHelper Angular 21

A rekordBox cue-file helper rebuilt in Angular 21.

## Features

- Drag and drop `.cue`, `.mp3`, and `.wav` files individually or together
- Generate a waveform when an audio file is loaded alongside or separately from a cue file
- Reads `TITLE`, `PERFORMER`, and `INDEX` tags
- Removes duplicate tracks by artist/title
- Displays a copy-ready formatted playlist string
- Supports clipboard copy and a minimal dark UI
- With the API running (see the root `README.md`), **Save Set** stores the cue and audio on the server and **Saved Sets** lists them for reloading

The waveform component decodes browser-supported audio formats such as WAV, MP3, and AIFF. Drop the cue and audio together, or add the audio file separately before or after the cue.

## Development server

```bash
npm install --legacy-peer-deps
npm start
```

Then open `http://localhost:4200/`. Saved sets need the API from `server/`; without it the Saved Sets panel reports that the server is unavailable.

## Mock server

Start the app with the cue and audio fixtures served from `mocks/`:

```bash
npm run mock:server
```

Open `http://localhost:8080/`. Port 8080 automatically enables mock mode; the upload dropzone stays available, and **Load mock cue and audio** fetches the fixture manifest and loads the `.cue` and `.mp3`. The normal Angular development server continues to use manual file uploads, or mock mode can be enabled there with `?mock=1`.

Stop the server with `Ctrl+C`. Fixture files can be replaced in `mocks/` without rebuilding.

## Production build

```bash
npm run build
```

Build artifacts are written to `dist/djHelperApp/`.
