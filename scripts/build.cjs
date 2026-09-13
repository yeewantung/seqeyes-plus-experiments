#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
// Resolve markdown-it from this repository when its dependencies are installed,
// and otherwise from the sibling plugin checkout, so the report can be built
// without a network install.
function loadMarkdownIt() {
  const candidates = [
    "markdown-it",
    path.join(__dirname, "..", "..", "seqeyes_plugin", "node_modules", "markdown-it"),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) { /* try the next */ }
  }
  throw new Error(
    "markdown-it not found. Run npm install here, or check out seqeyes_plugin alongside "
    + "this repository with its dependencies installed.",
  );
}
const MarkdownIt = loadMarkdownIt();

const root = path.resolve(__dirname, "..");
// Every docs/*.md becomes its own page, so the appendix can hold the material
// a reader consults rather than reads.
const PAGES = [
  { source: "index.md", output: "index.html", label: "Report" },
  { source: "appendix.md", output: "appendix.html", label: "Appendix" },
];
const outputRoot = path.join(root, "site");


const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

function render(page) {
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

  const sourcePath = path.join(root, "docs", page.source);
  if (!fs.existsSync(sourcePath)) return null;
  const tokens = md.parse(fs.readFileSync(sourcePath, "utf8"), {});
  const toc = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const level = Number(token.tag.slice(1));
    const label = tokens[index + 1]?.content || "Section";
    const id = slugify(label);
    token.attrSet("id", id);
    if (level >= 2 && level <= 4) toc.push({ level, label, id });
  }
  const article = md.renderer.render(tokens, md.options, {});
  const contents = toc
    .map(({ level, label, id }) =>
      `<li class="toc-level-${level}"><a href="#${id}">${md.utils.escapeHtml(label)}</a></li>`)
    .join("\n");

  const siteNav = PAGES
    .filter(candidate => fs.existsSync(path.join(root, "docs", candidate.source)))
    .map(candidate => candidate.output === page.output
      ? `<span aria-current="page">${candidate.label}</span>`
      : `<a href="${candidate.output}">${candidate.label}</a>`)
    .join("\n      ");

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
      <span>Technical supplement</span>
    </div>
    <nav class="site-nav" aria-label="Pages">
      ${siteNav}
    </nav>
  </header>
  <div class="layout">
    <aside>
      <div class="toc-title">Contents</div>
      <nav aria-label="Page contents"><ol>${contents}</ol></nav>
    </aside>
    <main id="report"><article>${article}</article></main>
  </div>
</body>
</html>
`;
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, page.output), html);
  return page.output;
}

const built = PAGES.map(render).filter(Boolean);
console.log(`Built ${built.join(", ")} from docs/`);
