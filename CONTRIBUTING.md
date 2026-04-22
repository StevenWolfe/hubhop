# Contributing

## Dev setup

```bash
git clone git@github.com:StevenWolfe/hubhop.git
cd hubhop
npm install
```

Node 18+ required. Uses nvm — run `nvm use` if you have a `.nvmrc`-aware shell.

## Build

```bash
npm run build          # both targets → dist/chrome/ and dist/firefox/
npm run build:chrome
npm run build:firefox

npm run dev:chrome     # watch mode — rebuilds on src/ or manifest changes
npm run dev:firefox
```

## Load for testing

**Firefox**
1. `npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`
3. Load Temporary Add-on → select `dist/firefox/manifest.json`
4. Click the HubHop icon in the toolbar to open Settings

Temporary add-ons clear on browser restart — reload after each session.

**Chrome**
1. `npm run build:chrome`
2. Go to `chrome://extensions`, enable Developer Mode
3. Load unpacked → select `dist/chrome/`
4. Click the HubHop icon to open Settings

## First-time smoke test

1. Open Settings (click the toolbar icon)
2. Pin a public org (e.g. your GitHub username)
3. Click **Refresh Now**
4. Type `hh ` in the address bar — suggestions should appear

## Lint

```bash
npm run lint    # builds Firefox, runs web-ext lint
```

CI runs this on every push. Known false-positive: `omnibox` triggers a warning
in web-ext's permission database despite being a valid Firefox API.

## Icons

Source: `src/icons/icon.svg`. Firefox uses the SVG directly. Chrome needs PNGs.

To regenerate PNGs after updating the SVG:
```bash
npm install sharp   # not in devDeps — install separately
node scripts/generate-icons.js
```

Commit the resulting `src/icons/icon*.png` files.

## Release process

1. Bump version in `package.json`, `manifests/chrome.json`, `manifests/firefox.json`
2. Commit: `chore: bump version to X.Y.Z`
3. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. CI builds, packages, and creates a GitHub Release with both store zips attached

Store submission is currently manual — download the zips from the GitHub Release
and upload to Chrome Web Store / Firefox AMO. See issues #7 and #8.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the full architecture reference.
