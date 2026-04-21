#!/usr/bin/env node
// Build HubHop for a given browser target.
// Usage: node scripts/build.js chrome|firefox [--watch]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..');

const [,, browser, flag] = process.argv;
const watch = flag === '--watch';

if (!['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node scripts/build.js chrome|firefox [--watch]');
  process.exit(1);
}

const src = path.join(root, 'src');
const dist = path.join(root, 'dist', browser);
const manifest = path.join(root, 'manifests', `${browser}.json`);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  copyDir(src, dist);
  fs.copyFileSync(manifest, path.join(dist, 'manifest.json'));

  // Chrome needs PNG icons; skip SVG-only icon for Chrome
  if (browser === 'chrome') {
    const svgPath = path.join(dist, 'icons', 'icon.svg');
    if (fs.existsSync(svgPath)) {
      // Keep SVG as source reference; PNGs must be generated separately
      // Run: node scripts/generate-icons.js (requires sharp)
    }
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  console.log(`✓ Built HubHop v${pkg.version} → dist/${browser}/`);
}

build();

if (watch) {
  // Lazy import chokidar only in watch mode
  const { default: chokidar } = await import('chokidar');
  console.log(`Watching src/ and manifests/ for changes…`);
  chokidar.watch([src, manifest], { ignoreInitial: true }).on('all', (event, filePath) => {
    console.log(`${event}: ${path.relative(root, filePath)} → rebuilding…`);
    try {
      build();
    } catch (e) {
      console.error('Build failed:', e.message);
    }
  });
}
