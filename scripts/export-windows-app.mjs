#!/usr/bin/env node
// Packages djHelper (Angular UI + Fastify API) as a standalone Windows app with Electron.
//
// Usage: node scripts/export-windows-app.mjs [--arch x64|arm64|ia32] [--zip] [--skip-build]
//   --arch        Target CPU (default: this machine's on Windows, otherwise x64).
//   --zip         Also create a .zip next to the app folder, ready to share.
//   --skip-build  Reuse the previous Angular/API builds.
//
// Output: desktop/out/DJ Toolbox-win32-<arch>/DJ Toolbox.exe
//
// It can also be run on macOS or Linux to cross-build the Windows app.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = path.join(ROOT, 'djHelperApp');
const SERVER_DIR = path.join(ROOT, 'server');
const DESKTOP_DIR = path.join(ROOT, 'desktop');
const STAGE_DIR = path.join(DESKTOP_DIR, 'build', 'app');
const OUT_DIR = path.join(DESKTOP_DIR, 'out');
const APP_NAME = 'DJ Toolbox';
const isWindows = process.platform === 'win32';

function parseArgs(argv) {
  const options = {
    arch: isWindows && ['x64', 'arm64', 'ia32'].includes(process.arch) ? process.arch : 'x64',
    zip: false,
    skipBuild: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--arch':
        options.arch = argv[++i];
        break;
      case '--zip':
        options.zip = true;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '-h':
      case '--help':
        console.log(
          fs
            .readFileSync(fileURLToPath(import.meta.url), 'utf8')
            .split('\n')
            .slice(1, 11)
            .map((line) => line.replace(/^\/\/ ?/, ''))
            .join('\n'),
        );
        process.exit(0);
        break;
      default:
        fail(`Unknown option: ${argv[i]}`);
    }
  }
  if (!['x64', 'arm64', 'ia32'].includes(options.arch)) {
    fail('--arch must be x64, arm64 or ia32.');
  }
  return options;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function step(message) {
  console.log(`\n==> ${message}`);
}

// npm is a .cmd file on Windows, which can only be started through a shell.
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) {
    fail(`"${command} ${args.join(' ')}" failed in ${cwd}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const webBuild = path.join(WEB_DIR, 'dist', 'djHelperApp', 'browser');
const serverBuild = path.join(SERVER_DIR, 'dist');

if (Number(process.versions.node.split('.')[0]) < 22) {
  fail('Node.js 22.18 or newer is required to build the app.');
}

if (!options.skipBuild) {
  step('Building the Angular app');
  if (!fs.existsSync(path.join(WEB_DIR, 'node_modules'))) {
    run('npm', ['ci', '--legacy-peer-deps'], WEB_DIR);
  }
  run('npm', ['run', 'build'], WEB_DIR);

  step('Building the API');
  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    run('npm', ['ci'], SERVER_DIR);
  }
  fs.rmSync(serverBuild, { recursive: true, force: true });
  run('npm', ['run', 'build'], SERVER_DIR);
}

for (const required of [path.join(webBuild, 'index.html'), path.join(serverBuild, 'index.js')]) {
  if (!fs.existsSync(required)) {
    fail(`Missing ${required}. Run without --skip-build.`);
  }
}

step('Staging the app');
fs.rmSync(path.join(DESKTOP_DIR, 'build'), { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE_DIR, 'server'), { recursive: true });
for (const file of ['package.json', 'main.cjs']) {
  fs.copyFileSync(path.join(DESKTOP_DIR, 'app', file), path.join(STAGE_DIR, file));
}
fs.cpSync(webBuild, path.join(STAGE_DIR, 'web'), { recursive: true });
fs.cpSync(serverBuild, path.join(STAGE_DIR, 'server', 'dist'), { recursive: true });
for (const file of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(SERVER_DIR, file), path.join(STAGE_DIR, 'server', file));
}
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], path.join(STAGE_DIR, 'server'));

step('Installing Electron tooling');
run('npm', ['install', '--no-audit', '--no-fund'], DESKTOP_DIR);

step(`Packaging ${APP_NAME} for win32-${options.arch}`);
const { packager } = await import(
  pathToFileURL(path.join(DESKTOP_DIR, 'node_modules', '@electron', 'packager', 'dist', 'index.js'))
    .href
);
const [appPath] = await packager({
  dir: STAGE_DIR,
  name: APP_NAME,
  platform: 'win32',
  arch: options.arch,
  out: OUT_DIR,
  overwrite: true,
  prune: false,
  icon: path.join(DESKTOP_DIR, 'icon.ico'),
  win32metadata: {
    CompanyName: APP_NAME,
    FileDescription: APP_NAME,
    ProductName: APP_NAME,
    OriginalFilename: `${APP_NAME}.exe`,
  },
});

if (options.zip) {
  step('Creating the .zip');
  const zipPath = `${appPath}.zip`;
  fs.rmSync(zipPath, { force: true });
  // bsdtar ships with Windows 10+ and macOS, and picks the zip format from the extension.
  run('tar', ['-a', '-c', '-f', zipPath, '-C', path.dirname(appPath), path.basename(appPath)], ROOT);
  console.log(`ZIP: ${zipPath}`);
}

console.log(
  `\nDone: ${path.join(appPath, `${APP_NAME}.exe`)}\nSaved sets are stored in %APPDATA%\\${APP_NAME}`,
);
