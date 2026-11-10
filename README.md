# djHelper
A DJ helper app for converting rekordBox cue files into clean playlist text.

This project has been migrated to Angular 21 and provides a drag-and-drop importer for `.cue` files, deduplication, and copy-ready playlist output.

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

