#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "docs", "index.md");
const outputRoot = path.join(root, "site");
const outputPath = path.join(outputRoot, "index.html");

const slugCounts = new Map();
function slugify(value) {
  const base = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";
  const count = slugCounts.get(base) || 0;
  slugCounts.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const source = fs.readFileSync(sourcePath, "utf8");
const tokens = md.parse(source, {});
const toc = [];

for (let index = 0; index < tokens.length; index += 1) {
  const token = tokens[index];
  if (token.type !== "heading_open") continue;
  const level = Number(token.tag.slice(1));
  const inline = tokens[index + 1];
  const label = inline?.content || "Section";
  const id = slugify(label);
  token.attrSet("id", id);
  if (level === 2 || level === 3) toc.push({ level, label, id });
}

const article = md.renderer.render(tokens, md.options, {});
const navigation = toc
  .map(
    ({ level, label, id }) =>
      `<li class="toc-level-${level}"><a href="#${id}">${md.utils.escapeHtml(label)}</a></li>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="SeqEyes-Plus experiment design, implementation, results, and reproducibility report.">
  <title>SeqEyes-Plus experiment evidence</title>
  <link rel="stylesheet" href="assets/report.css">
</head>
<body>
  <a class="skip-link" href="#report">Skip to report</a>
  <header class="topbar">
    <div>
      <strong>SeqEyes-Plus experiment evidence</strong>
      <span>Technical supplement · draft</span>
    </div>
    <a href="downloads/manifest.json">Evidence manifest</a>
  </header>
  <div class="layout">
    <aside>
      <div class="toc-title">Contents</div>
      <nav aria-label="Report contents"><ol>${navigation}</ol></nav>
    </aside>
    <main id="report"><article>${article}</article></main>
  </div>
</body>
</html>
`;

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Built ${path.relative(root, outputPath)} from ${path.relative(root, sourcePath)}`);
