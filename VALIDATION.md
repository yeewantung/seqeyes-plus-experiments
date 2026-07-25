# Validation record

Date: **2026-07-24**

Completed checks:

- Markdown source builds successfully to `site/index.html`.
- All 48 internal links and embedded assets resolve to files in `site/`.
- All 34 copied/transformed evidence files match
  `site/downloads/manifest.json`.
- The Figure 2B-C public table contains 36 official rows and only the
  recomputed official-cohort regression fields (`n = 36`, slope `0.556924`,
  R² `0.599992`).
- The Figure 2B-D public table contains 540 observations:
  36 official cases × 3 tools × 5 runs.
- The Figure 2B-D public summary and protocol contain 36 official cases and
  exclude the local stress case.
- The requested supplementary `speedup-comparison.svg` is copied verbatim
  from the 24 July benchmark results and is explicitly labelled as a separate
  13-row engineering cohort in the report.
- The report contains individual E1–E8 sections, experiment methods, related
  code/evidence links, results, limitations, blank non-data figure
  placeholders, the real speedup figure, and the bounded 4D-flow parser
  diagnostic.
- `git diff --check` reports no whitespace errors in the new site.

Not yet completed:

- coauthor scientific/content review;
- replacement of blank abstract-figure placeholders with reviewed figures;
- production deployment;
- a final browser screenshot pass. Static responsive styles are present, but
  the temporary local-browser validation service was unavailable during this
  build turn.
