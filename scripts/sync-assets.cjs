#!/usr/bin/env node
"use strict";

/**
 * Copy the published figures and demo captures out of the experiment results.
 *
 * The list is explicit rather than a directory sweep: the results directory
 * holds captures that are deliberately not published, and a sweep would publish
 * them the next time one appeared.
 *
 * `build.cjs` does not call this - the copies are committed, so the site builds
 * from this repository alone. Run this after re-running a capture or a figure.
 *
 * Usage:
 *   node scripts/sync-assets.cjs [--workspace PATH] [--check]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let workspace = path.resolve(root, "..");
let checkOnly = false;
for (let i = 2; i < process.argv.length; i += 1) {
  const argument = process.argv[i];
  if (argument === "--workspace") workspace = path.resolve(process.argv[i += 1]);
  else if (argument === "--check") checkOnly = true;
  else throw new Error(`Unknown argument: ${argument}`);
}

const resultsRoot = path.join(
  workspace, "abstracts/experiments/results/rerun_2026-09/figures",
);

const PUBLISHED = {
  "downloads/figures": [
    "results-scaling.svg",
    "results-cross-tool-components.svg",
    "results-parser-speedup.svg",
  ],
  // demo-large-sequence.png is captured but not published: a 695-second
  // acquisition fitted to one screen shows nothing a reader can use.
  "downloads/demos": [
    "demos/demo-zoom.webm",
    "demos/demo-zoom-whole.png",
    "demos/demo-zoom-many-tr.png",
    "demos/demo-zoom-tr.png",
    "demos/demo-kspace.webm",
    "demos/demo-kspace.png",
    "demos/demo-spectrogram.png",
  ],
};

let stale = 0;
for (const [destination, sources] of Object.entries(PUBLISHED)) {
  const destinationRoot = path.join(root, "site", destination);
  fs.mkdirSync(destinationRoot, { recursive: true });
  for (const source of sources) {
    const from = path.join(resultsRoot, source);
    const to = path.join(destinationRoot, path.basename(source));
    if (!fs.existsSync(from)) throw new Error(`Missing capture: ${from}`);
    const current = fs.existsSync(to) && fs.readFileSync(to).equals(fs.readFileSync(from));
    if (current) continue;
    stale += 1;
    if (checkOnly) console.log(`  stale: ${destination}/${path.basename(source)}`);
    else {
      fs.copyFileSync(from, to);
      console.log(`  copied ${destination}/${path.basename(source)}`);
    }
  }
}

if (checkOnly && stale) {
  console.error(`${stale} published asset(s) differ from the experiment results.`);
  process.exit(1);
}
console.log(stale ? `Synced ${stale} asset(s).` : "Published assets are current.");
