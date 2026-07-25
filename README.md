# SeqEyes-Plus experiment evidence

Markdown-first technical supplement for the SeqEyes-Plus abstract.

The scientific source is `docs/index.md`. `site/index.html` is generated from
that Markdown source and is intended for static hosting.

## Build

```bash
npm install
python3 scripts/sync_evidence.py
npm run build
```

Preview the generated site locally:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
```

The report does not reproduce the submitted abstract or host its PDF.
# seqeyes-plus-experiments
