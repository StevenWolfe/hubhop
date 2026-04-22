# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What HubHop is

A browser extension (Firefox + Chrome, MV3) that registers the `hh` omnibox keyword. Users type `hh <query>` in the address bar to fuzzy-match against a cache of GitHub repos and navigate straight to the repo page. Supports github.com and multiple GitHub Enterprise Server (GHES) instances.

## MVP scope (decided, do not re-litigate)

- **Trigger**: `hh <query>` in the omnibox. Fuzzy match on cached repos. Enter navigates to `https://<instance>/owner/repo`. No match → fall through to GitHub search.
- **"Pinning" is the configuration semantic** — users *pin* orgs (all repos in the org become candidates) and *pin* individual repos. "Pinned orgs" and "pinned repos" are the user-facing terms; code fields may be `orgs` / `pinnedRepos` for now but UI copy says "pin".
- **Auth = PAT (personal access token)** — per-instance tokens pasted into the options page. Works uniformly across github.com and arbitrary GHES. OAuth Web Flow / Device Flow are V2+ (require per-instance OAuth App registration, which isn't always feasible for GHES admins).
- **No token → public-only mode works** — users can still pin public orgs and public repos. API calls go unauthenticated (60 req/hr limit — show a warning in options when hitting it).
- **No browser history integration for MVP** — it muddied the UX. Cache = pinned orgs (fetched hourly) + pinned repos.
- **Firefox-first, Chrome still in-scope** — both are supported and both build targets must stay green. If a feature can only ship on one, ship Firefox.
- **Storage security**: `chrome.storage.sync` is **not encrypted**. Document this in the token UI. Recommend a dedicated scoped PAT (`repo`, `read:org`) — not the user's general-purpose token.

## Commands

```bash
npm install              # First-time setup

npm run build            # Build both targets
npm run build:chrome     # → dist/chrome/
npm run build:firefox    # → dist/firefox/

npm run dev:chrome       # Watch mode (rebuilds on src/ or manifest changes)
npm run dev:firefox

npm run package:chrome   # → releases/hubhop-chrome-<version>.zip
npm run package:firefox  # → releases/hubhop-<version>.zip (via web-ext)
npm run package          # Both

npm run lint             # web-ext lint against Firefox build (must pass on CI)
npm run clean            # rm -rf dist releases
```

### Loading for local testing

- **Chrome**: `chrome://extensions` → Developer Mode → Load unpacked → select `dist/chrome/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `dist/firefox/manifest.json`

Firefox temporary add-ons are wiped on browser restart — reload after each session.

### Smoke test

Without cached repos, suggestions are empty. Minimum viable smoke test:
1. Load unpacked
2. Open options page, pin a public org (e.g. `anthropics` or your own)
3. Wait for refresh or click "Refresh Now"
4. Type `hh <query>` — expect suggestions

## Architecture

### Build model — one codebase, two manifests

`src/` is browser-agnostic. Per-browser differences live in two manifest files:

- `manifests/chrome.json` — MV3, `background.service_worker`, PNG icons
- `manifests/firefox.json` — MV3, `background.scripts`, SVG icons, `browser_specific_settings.gecko`

`scripts/build.js` copies `src/` → `dist/<browser>/` then drops the right manifest in as `manifest.json`. No bundler; `src/` is vanilla JS loaded directly. Add a bundler only if you introduce npm deps that must run in the extension runtime.

### Runtime components

- **`src/background.js`** — the brains. Handles omnibox events, the repo cache in `chrome.storage.local`, and hourly org refresh via `chrome.alarms`. Exposes a message bus (`chrome.runtime.onMessage`) for the options page: `{ type: 'refresh' }` and `{ type: 'get-cache-status' }`.
- **`src/options/`** — settings UI. Token, GHES instances, pinned orgs, pinned repos, cache status + manual refresh.
- **Storage split**:
  - `storage.sync` → user config (token, instances, orgs, pinnedRepos). Syncs across devices where supported.
  - `storage.local` → repo cache + `lastRefresh` timestamp. Machine-local.

### `chrome.*` vs `browser.*`

Code uses `chrome.*` throughout. Firefox aliases `chrome` to `browser` for WebExtensions compatibility, so this works on both without a polyfill. Don't introduce `webextension-polyfill` unless an API appears that genuinely differs.

### Fuzzy matching

`scoreRepo()` in `background.js` ranks candidates: exact full_name (3) > repo name exact (2) > substring (1) > in-order char match (0.5). Top 6 shown in the omnibox. If you change this, keep the top tier fast — omnibox handlers must return within milliseconds.

### Icons

- **Source of truth**: `src/icons/icon.svg`
- **Firefox**: references the SVG directly (MV3 allows SVG icons)
- **Chrome**: requires PNGs. Current `icon16/32/48/128.png` are placeholder solid-blue squares generated via the Python snippet that lives in git history. Proper PNGs are generated by `scripts/generate-icons.js` which uses `sharp` (install with `npm install sharp` — intentionally not in devDeps to keep installs fast for contributors who don't regenerate icons).

## Release flow

Tag a commit `vX.Y.Z` on `main` → `.github/workflows/release.yml` builds both targets, lints, packages, and creates a GitHub Release with the zips attached.

Store submission (Chrome Web Store, Firefox AMO) is currently manual — upload the zips from the GitHub Release. Automation requires store credentials as repo secrets (see open issues).

## Conventions

- **Commits**: Conventional style (`feat:`, `fix:`, `chore:`, `docs:`). Commit often and push often — self-approve PRs for solo work.
- **Issues track scope**: All significant work lives as a GitHub Issue. Link PRs to issues with `Closes #N`.
- **MV3 only**: Don't add MV2 compatibility. Both Chrome and modern Firefox (109+) support MV3.
