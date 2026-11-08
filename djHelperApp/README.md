# djHelper Angular 21

A rekordBox cue-file helper rebuilt in Angular 21.

## Features

- Drag and drop `.cue`, `.mp3`, and `.wav` files individually or together
- Generate a waveform when an audio file is loaded alongside or separately from a cue file
- Reads `TITLE`, `PERFORMER`, and `INDEX` tags
- Removes duplicate tracks by artist/title
- Displays a copy-ready formatted playlist string
- Supports clipboard copy and a minimal dark UI

The waveform component decodes browser-supported audio formats such as WAV, MP3, and AIFF. Drop the cue and audio together, or add the audio file separately before or after the cue.

## Development server

```bash
npm install --legacy-peer-deps
npm start
```

Then open `http://localhost:4200/`.

## Mock server

Start the app behind nginx with the cue and audio fixtures mounted from `mocks/`:

```bash
npm run mock:server
```

Open `http://localhost:8080/`. The mock build starts MSW in the browser, loads the fixture manifest through MSW, then fetches the `.cue` and `.mp3` files from nginx and processes them automatically. The normal Angular development server continues to use manual file uploads.

Stop the server with `Ctrl+C`. Fixture files can be replaced in `mocks/` without rebuilding the image.

## Production build

```bash
npm run build
```

Build artifacts are written to `dist/djHelperApp/`.
