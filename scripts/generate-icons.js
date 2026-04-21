#!/usr/bin/env node
// Generate PNG icons from src/icons/icon.svg using sharp.
// Run once after updating the SVG, or as part of CI.
// Requires: npm install sharp (not in devDeps by default — install separately)
//
// Usage: node scripts/generate-icons.js

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..');
const svgPath = path.join(root, 'src', 'icons', 'icon.svg');
const outDir = path.join(root, 'src', 'icons');

const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is not installed. Run: npm install sharp');
  process.exit(1);
}

const sizes = [16, 32, 48, 128];
const svg = fs.readFileSync(svgPath);

for (const size of sizes) {
  const outPath = path.join(outDir, `icon${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`✓ icon${size}.png`);
}

console.log('Icons generated. Commit src/icons/icon*.png.');
