#!/usr/bin/env bash
# Packages djHelper (Angular UI + Fastify API) as a standalone macOS app with Electron.
#
# Usage: scripts/export-mac-app.sh [--arch arm64|x64] [--dmg] [--skip-build]
#   --arch        Target CPU (default: this machine's).
#   --dmg         Also create a .dmg installer next to the .app.
#   --skip-build  Reuse the previous Angular/API builds.
#
# Output: desktop/out/DJ Toolbox-darwin-<arch>/DJ Toolbox.app
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/djHelperApp"
SERVER_DIR="$ROOT/server"
DESKTOP_DIR="$ROOT/desktop"
STAGE_DIR="$DESKTOP_DIR/build/app"
OUT_DIR="$DESKTOP_DIR/out"
APP_NAME="DJ Toolbox"

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac
MAKE_DMG=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) ARCH="${2:?--arch needs a value}"; shift 2 ;;
    --dmg) MAKE_DMG=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    -h | --help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
  echo "--arch must be arm64 or x64." >&2
  exit 1
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Node.js 22.18 or newer is required to build the app." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$1"; }

if [[ "$SKIP_BUILD" == false ]]; then
  step "Building the Angular app"
  [[ -d "$WEB_DIR/node_modules" ]] || (cd "$WEB_DIR" && npm ci --legacy-peer-deps)
  (cd "$WEB_DIR" && npm run build)

  step "Building the API"
  [[ -d "$SERVER_DIR/node_modules" ]] || (cd "$SERVER_DIR" && npm ci)
  (cd "$SERVER_DIR" && rm -rf dist && npm run build)
fi

for required in "$WEB_DIR/dist/djHelperApp/browser/index.html" "$SERVER_DIR/dist/index.js"; do
  [[ -f "$required" ]] || { echo "Missing $required. Run without --skip-build." >&2; exit 1; }
done

step "Staging the app"
rm -rf "$DESKTOP_DIR/build"
mkdir -p "$STAGE_DIR/server"
cp "$DESKTOP_DIR/app/package.json" "$DESKTOP_DIR/app/main.cjs" "$STAGE_DIR/"
cp -R "$WEB_DIR/dist/djHelperApp/browser" "$STAGE_DIR/web"
cp -R "$SERVER_DIR/dist" "$STAGE_DIR/server/dist"
cp "$SERVER_DIR/package.json" "$SERVER_DIR/package-lock.json" "$STAGE_DIR/server/"
(cd "$STAGE_DIR/server" && npm ci --omit=dev --no-audit --no-fund)

step "Installing Electron tooling"
(cd "$DESKTOP_DIR" && npm install --no-audit --no-fund)

step "Packaging $APP_NAME for darwin-$ARCH"
PACKAGER_ARGS=(
  "$STAGE_DIR" "$APP_NAME"
  --platform=darwin "--arch=$ARCH"
  --out="$OUT_DIR" --overwrite
  --app-bundle-id=com.djhelper.toolbox
  --app-category-type=public.app-category.music
  --no-prune
)
[[ -f "$DESKTOP_DIR/icon.icns" ]] && PACKAGER_ARGS+=("--icon=$DESKTOP_DIR/icon.icns")
(cd "$DESKTOP_DIR" && npx electron-packager "${PACKAGER_ARGS[@]}")

APP_PATH="$OUT_DIR/$APP_NAME-darwin-$ARCH/$APP_NAME.app"

step "Signing ad hoc"
# Apple Silicon refuses to run unsigned code. Replace this with a Developer ID to distribute the app.
codesign --force --deep --sign - "$APP_PATH"

if [[ "$MAKE_DMG" == true ]]; then
  step "Creating the .dmg"
  DMG_PATH="$OUT_DIR/$APP_NAME-darwin-$ARCH.dmg"
  rm -f "$DMG_PATH"
  hdiutil create -volname "$APP_NAME" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH" >/dev/null
  echo "DMG: $DMG_PATH"
fi

printf '\nDone: %s\nSaved sets are stored in ~/Library/Application Support/%s\n' "$APP_PATH" "$APP_NAME"
