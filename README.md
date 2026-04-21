# HubHop

Jump to any GitHub repo from your browser address bar.

Type `hh <repo>` → land directly on the repo. Works with GitHub.com and GitHub Enterprise Server (GHES) instances.

## Usage

1. Type `hh` + space/tab in the address bar to activate
2. Type a repo name (e.g. `hubhop`, `StevenWolfe/hubhop`, or just `wolfe hub`)
3. Press Enter to navigate

## Features

- **Omnibox navigation** — `hh <repo>` goes straight to the repo
- **Org support** — add an org and HubHop periodically fetches the full repo list
- **Individual repo pinning** — add specific repos manually
- **GHES support** — add multiple GitHub Enterprise Server instances
- **Private repos** — add a GitHub token to access private repos and avoid rate limits

## Development

### Prerequisites

- Node.js 18+
- `npm install`

### Build

```bash
npm run build          # Build both Chrome and Firefox
npm run build:chrome   # Chrome only → dist/chrome/
npm run build:firefox  # Firefox only → dist/firefox/
```

### Dev mode (watch)

```bash
npm run dev:chrome
npm run dev:firefox
```

### Load unpacked in Chrome

1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `dist/chrome/`

### Load in Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on" → select any file in `dist/firefox/`

### Package for stores

```bash
npm run package:chrome   # → releases/hubhop-chrome-<version>.zip
npm run package:firefox  # → releases/hubhop-<version>.zip (web-ext)
```

### Lint

```bash
npm run lint   # web-ext lint against Firefox build
```

## Architecture

```
src/
  background.js     # Omnibox handler, repo cache, API fetching
  options/
    options.html    # Settings page
    options.js      # Settings logic
    options.css     # Styles
  icons/            # Extension icons (16, 32, 48, 128px PNG + SVG source)
manifests/
  chrome.json       # Chrome MV3 manifest
  firefox.json      # Firefox MV3 manifest
scripts/
  build.js          # Build script: merge manifests, copy assets
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome — use the PR template.
