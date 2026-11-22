# djHelper
A DJ helper app for converting rekordBox cue files into clean playlist text.

This project has been migrated to Angular 21 and provides a drag-and-drop importer for `.cue` files, deduplication, and copy-ready playlist output.

MP3 waveforms are analyzed locally in small chunks to reduce memory use on mobile devices. Long recordings may take some time to analyze. For saved sets, the server caches the waveform after the first analysis, so reloading a saved set skips it.

## Full stack with Docker

```bash
docker compose up --build
```

Open `http://localhost:8081/` (change it with `WEB_PORT`). nginx serves the Angular app and proxies `/api` to a Node.js (Fastify) API in `server/`.

- Click **Save Set** in the Playlist panel to store the cue file and its audio on the server. Saved sets are listed in **Saved Sets** at the bottom of the page, where they can be loaded again or deleted.
- Everything the API writes (SQLite database and uploaded files) lives in the `djhelper-data` named volume, so it survives `docker compose down`. Use `docker compose down -v` to wipe it.
- Docker volumes have no built-in size limit, so the API enforces a 2 GiB quota itself (`DATA_QUOTA_BYTES` in `docker-compose.yml`). Uploads that would exceed it are rejected with `413`. If you change it, update `client_max_body_size` in `djHelperApp/nginx.conf` too.

### Running the API without Docker

```bash
cd server
npm install
npm run dev      # http://localhost:3000, data in ./data
npm test
```

`npm start` in `djHelperApp/` proxies `/api` to it (see `djHelperApp/proxy.conf.json`). It needs Node 22.18 or newer, because the API runs TypeScript directly and uses the built-in `node:sqlite`.

## macOS app

```bash
npm run export:mac                 # from the repository root
npm run export:mac -- --dmg        # also create a .dmg installer
npm run export:mac -- --arch x64   # build for Intel (default: this Mac's CPU)
```

The script builds the Angular app and the API, then packages them with Electron into `desktop/out/DJ Toolbox-darwin-<arch>/DJ Toolbox.app`. The app starts the API in the background and serves the UI on `http://127.0.0.1:48217` (or a free port if that one is taken). Saved sets live in `~/Library/Application Support/DJ Toolbox/data`, with a 10 GiB quota.

The app is signed ad hoc, so it runs on the Mac that built it. To share it, replace the `codesign` step in `scripts/export-mac-app.sh` with a Developer ID signature and notarize it.

## Windows app

```bash
npm run export:win                  # from the repository root, on Windows, macOS or Linux
npm run export:win -- --zip         # also create a .zip to share
npm run export:win -- --arch arm64  # x64 (default), arm64 or ia32
```

It does the same as the macOS script and writes `desktop/out/DJ Toolbox-win32-<arch>/DJ Toolbox.exe`. Run it where you build, then copy the folder (or the `.zip`) to the Windows machine and start `DJ Toolbox.exe`; no installer is needed. Saved sets live in `%APPDATA%\DJ Toolbox\data`. The `.exe` is unsigned, so Windows SmartScreen shows a warning the first time ("More info" → "Run anyway") unless you sign it with a code-signing certificate.

## Changing the logo

Edit `desktop/generate-icons.mjs` and run `npm run icons` in `desktop/` (macOS only). It regenerates the app icons (`desktop/icon.icns`, `desktop/icon.ico`) and the web favicons in `djHelperApp/public/`.

