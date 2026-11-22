'use strict';

const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

// A fixed origin keeps the web app's browser storage (IndexedDB) between launches.
const PREFERRED_WEB_PORT = 48217;
const QUOTA_BYTES = 10 * 1024 ** 3;
const WEB_ROOT = path.join(__dirname, 'web');
const API_ENTRY = path.join(__dirname, 'server', 'dist', 'index.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let apiProcess = null;
let webServer = null;
let isQuitting = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function fail(message) {
  if (!isQuitting) {
    dialog.showErrorBox('DJ Toolbox', message);
  }
  app.quit();
}

function startApi(port) {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  apiProcess = utilityProcess.fork(API_ENTRY, [], {
    serviceName: 'DJ Toolbox API',
    execArgv: ['--disable-warning=ExperimentalWarning'],
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATA_DIR: dataDir,
      DATA_QUOTA_BYTES: String(QUOTA_BYTES),
    },
  });
  apiProcess.once('exit', (code) => {
    apiProcess = null;
    fail(`The storage service stopped unexpectedly (exit code ${code}).`);
  });
}

async function waitForApi(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!apiProcess) {
      throw new Error('The storage service failed to start.');
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('The storage service did not become ready in time.');
}

function proxyToApi(apiPort, request, response) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: apiPort,
      method: request.method,
      path: request.url,
      headers: request.headers,
    },
    (apiResponse) => {
      response.writeHead(apiResponse.statusCode ?? 502, apiResponse.headers);
      apiResponse.pipe(response);
    },
  );
  upstream.once('error', () => {
    if (!response.headersSent) {
      response.writeHead(502);
    }
    response.end();
  });
  request.pipe(upstream);
}

function serveStatic(request, response) {
  const { pathname } = new URL(request.url, 'http://localhost');
  let filePath;
  try {
    filePath = path.join(WEB_ROOT, decodeURIComponent(pathname));
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + path.sep)) {
    response.writeHead(403).end();
    return;
  }

  // Unknown paths fall back to index.html so the single-page app can handle them.
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(WEB_ROOT, 'index.html');
  }

  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  };
  if (path.basename(filePath) === 'index.html') {
    headers['Cache-Control'] = 'no-store';
  }
  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

async function startWebServer(apiPort) {
  webServer = http.createServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      proxyToApi(apiPort, request, response);
    } else {
      serveStatic(request, response);
    }
  });

  try {
    return await listen(webServer, PREFERRED_WEB_PORT);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') {
      throw error;
    }
    return listen(webServer, 0);
  }
}

function openWindow(webPort) {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#0f141e',
    title: 'DJ Toolbox',
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${webPort}/`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void window.loadURL(`http://127.0.0.1:${webPort}/`);
}

async function start() {
  const apiPort = await freePort();
  startApi(apiPort);
  await waitForApi(apiPort);
  openWindow(await startWebServer(apiPort));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    apiProcess?.kill();
    webServer?.close();
  });
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(start).catch((error) => fail(error.message));
}
