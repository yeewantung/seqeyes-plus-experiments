# SeqEyes Web `.seq` Versus `.bseq` Benchmark Plan

Status: initial Node parser/accuracy and standalone Chromium full-load
benchmarks implemented; isolated peak-memory, M1/PNS, controlled cold-cache,
and generated scaling-family phases remain future work.

The implemented runner is documented in `benchmarking/README.md`. It covers
the generated MATLAB demo pairs plus the explicitly bounded
`wave_test_R3x2` extreme arbitrary-gradient pair, reports warm acquisition and
preloaded-byte parser timings separately, and blocks on normalized structure,
decoded waveform, and duration mismatches. It never loads `wave_test.bseq`.
The Chromium runner additionally separates exported load phases, records the
remaining viewer preparation/render cost, validates canvases and browser state,
and captures a diagnostic CPU profile for `wave_test_R3x2` without modifying
the production viewer for benchmark-only instrumentation.

## Goal

Measure whether the current official Pulseq `.bseq` reader improves SeqEyes Web load cost relative to semantically equivalent `.seq` input, while proving that both formats produce equivalent sequence behavior within the binary format's documented numeric precision.

This first benchmark targets the shared TypeScript parser in Node and the standalone Chromium web viewer. VS Code, MATLAB, Python/Jupyter, Safari, and mobile host transport are follow-up matrices after the core comparison is reliable.

## Core hypothesis

The file-format-specific path ends when both readers produce the unified `PulseqSequence` model. Therefore:

- **Expected direct differences:** file size, acquisition/read time, UTF-8 decoding, section parsing, shape ingestion/decompression, allocations, garbage collection, and peak memory during parse.
- **Expected indirect differences:** end-to-first-paint can improve because parsing is part of loading and because parser allocations can affect later garbage collection.
- **Expected equivalence:** block decoding, timing detection, render LOD selection, k-space, M1/PNS, and steady-state interaction should be the same after equivalent parsed data is produced.

The final point must be measured rather than assumed. If downstream timing differs consistently, either the parsed data is not equivalent, memory/GC state differs, or the benchmark is measuring noise.

## Why accuracy still needs testing

Parser choice can affect correctness even when downstream code is shared:

- official binary shapes are stored as `float32`, while text decimal values can retain different precision;
- binary time fields use integer picoseconds that are converted and sometimes rounded into the plugin's microsecond/nanosecond model;
- definitions, version fields, event IDs, library counts, extensions, linked lists, labels, rotations, soft delays, RF shims, and signatures have format-specific decoding paths;
- section order, missing/unknown sections, truncation, unsafe counts, and malformed references have different failure paths;
- the current official fixture pairs declare slightly different revisions and are behavior pairs rather than byte-identical source documents.

Accuracy should therefore mean semantic/numeric equivalence within explicit tolerances—not byte equality and not a blanket claim that format cannot affect results.

## Existing baseline

The repository already has:

- official paired `gre.seq`/`gre.bseq` and `epi_rs.seq`/`epi_rs.bseq` fixtures with pinned upstream provenance;
- structural, decoded waveform, and ADC k-space parity tests in `test/pulseq/binary-reader.test.ts`;
- Node reporting for parse, timing detection, decode, interactive/export k-space, counts, and total pipeline time;
- a standalone Playwright performance test, currently using only `spiral_inout.seq`;
- a weekly/manual performance workflow that uploads JSON artifacts.

The retained two-iteration local report suggests BSEQ parsing is faster for both small official pairs, but downstream k-space dominates total time. This is directional evidence only.

## Benchmark dimensions

### 1. File representation

Record:

- `.seq` and `.bseq` byte size;
- binary/text size ratio;
- block, library-entry, unique-shape, packed-shape, uncompressed-shape, RF, arbitrary-gradient, trapezoid, ADC, extension, and label counts;
- total duration and native-raster sample estimates;
- repeated-event ratio versus unique-event ratio.

These descriptors are required so results can be attributed to sequence structure rather than file size alone.

### 2. Acquisition and parser performance

Measure separate phases:

1. cold or best-effort cold file/fetch acquisition;
2. conversion to input bytes (`ArrayBuffer`/`Uint8Array`);
3. binary-magic detection;
4. UTF-8 decoding for `.seq` only;
5. section parsing and object-model construction;
6. shape decompression;
7. shared validation and raster extraction;
8. total parse-to-`PulseqSequence` time.

Report latency plus throughput in input MB/s, blocks/s, library records/s, packed shape samples/s, and expanded shape samples/s. Separating acquisition from parsing prevents a smaller file from being credited as a faster parser merely because fewer bytes were read.

### 3. Shared downstream performance

Measure independently after parse:

- timing detection;
- `decodeAllBlocks()`;
- overview/envelope construction;
- k-space cost estimation;
- bounded interactive k-space when allowed;
- exact export k-space on fixtures whose estimated cost is safely below the limit;
- M1/PNS on a small representative subset with a pinned hardware profile;
- first waveform paint, viewer-ready time, fit-all redraw, a fixed zoom batch, a fixed pan batch, and hover response.

These results are primarily non-regression/equivalence checks. They should not be presented as BSEQ parser speedups unless a causal parser/memory effect is demonstrated.

### 4. Memory and responsiveness

Record:

- source bytes retained;
- parsed object-model estimate;
- packed and decompressed shape bytes;
- decoded waveform bytes;
- display LOD/cache bytes;
- k-space and derived-series estimated bytes;
- Node RSS, heap used, external/`ArrayBuffer` memory before load, at parse peak, after decode, and after forced/final GC where supported;
- Chromium JavaScript heap/ArrayBuffer metrics through the DevTools protocol where stable;
- main-thread long tasks, maximum synchronous task duration, and time until the page responds to an input probe.

Peak live memory is more important than final retained heap. Each memory case should run in a fresh process/page to avoid cross-case garbage-collector history.

### 5. Repeat-load behavior

Measure first open and a controlled second open of the same format. Report these separately; do not average them together. This exposes JIT, filesystem cache, browser cache, and allocation-pool effects without confusing them with true cold-load behavior.

## Accuracy matrix

### Layer A: normalized parsed structure

Require exact equality where the formats represent the same semantics:

- raster times after supported unit conversion;
- block count, order, duration, and event references;
- event-library presence, IDs, counts, and discrete fields;
- extension chain topology and type-specific references;
- labels/flags, required extensions, string definitions, and supported version semantics.

Compare floating definitions, event amplitudes/offsets, rotations, and other numeric fields with field-specific absolute-plus-relative tolerances.

### Layer B: decompressed shapes and decoded events

For each paired shape and decoded RF/gradient event, record:

- sample and time-array length;
- maximum absolute and relative error;
- RMS error;
- integrated area error;
- first/last sample and extrema error;
- event start, duration, RF center, ADC dwell/delay, and boundary continuity.

Initial gates should preserve the existing tested tolerances—gradient error at most `5e-6` of maximum magnitude and RF magnitude error below `0.001` for the approved fixtures—then replace or supplement them with format-derived tolerances after the expanded fixture results are reviewed.

### Layer C: derived behavior

Compare:

- total sequence duration and detected TR/TE metadata;
- ADC sample times and counts;
- full and ADC k-space arrays, reset/shot boundaries, and extrema;
- M1 axis arrays and reset/refocusing behavior;
- PNS time arrays, per-axis/combined values, peak value, and threshold crossings;
- render input summaries: row/event counts, LOD level, envelope segment/gap topology, extrema, and canvas operation budgets.

Use maximum/RMS errors and meaningful domain tolerances. Pixel-by-pixel screenshots are unsuitable as the primary accuracy oracle; deterministic render-model summaries should be blocking, with screenshots retained as diagnostics.

### Layer D: invalid-input equivalence

Keep format-specific safety tests for truncation, corrupt counts, bad magic, unknown sections, invalid references, unsafe allocation claims, invalid labels/rotations, and unsupported versions. Measure bounded failure time and memory separately from valid-file speed; a fast parser must not achieve speed by weakening validation.

## Fixture strategy

### Separate fixture roles

Do not make one corpus serve every purpose:

- **Broad parser compatibility:** many small demo fixtures are valuable because they cover different event and extension combinations. Runtime is secondary.
- **Numeric `.seq`/`.bseq` equivalence:** use a curated feature-covering subset of independently generated pairs.
- **Performance and memory scaling:** use a few deliberately constructed medium/large families with known scaling parameters.
- **Rendering stress:** use bounded sequences selected for waveform density and topology, with derived calculations controlled separately.

This mirrors the useful part of the SeqEyes Qt strategy. `seqeyes_qt/matlab/gen_seq_file.m` runs all Pulseq MATLAB `demoSeq` scripts and collects their `.seq` outputs. SeqEyes Qt currently has 33 checked-in `.seq` fixtures and broadly load-smokes them, while trajectory regression, visual regression, zoom/pan, and other jobs use smaller curated subsets. SeqEyes Web copied 31 of these files for broad parser/decode/k-space smoke coverage; they are not all exact numeric baselines and do not yet have paired `.bseq` files.

### Reuse the SeqEyes MATLAB generator

Use `seqeyes_qt/matlab/gen_seq_file.m` as the starting point for paired demo generation. The official Pulseq MATLAB API is `writeBinary(obj, filename, create_signature)`, so for a demo that leaves its sequence object in `seq`, the essential additional operation is:

```matlab
seq.writeBinary(fullfile(outputDir, [scriptName '.bseq']));
```

This produces the binary file from the same in-memory object that the demo used to write the text file, which is the preferred benchmark provenance. Pin a Pulseq commit that includes `matlab/+mr/@Sequence/writeBinary.m`.

Do not apply the line blindly to every upstream demo. The current helper assumes that each script emits a `.seq` file, but it neither requires the live object to be named `seq` nor distinguishes scripts that create multiple outputs. It also sweeps every `.seq` left in `inputDir` and renames those files to one script-derived name. Adapt it into a benchmark-specific paired generator that:

- runs only the curated demo list;
- clears per-demo workspace state before each run;
- snapshots outputs so stale files cannot be attributed to the next demo;
- requires and validates the expected live sequence object before calling `writeBinary`;
- gives each output pair an explicit stable basename, including multiple-output demos;
- fails that fixture rather than silently pairing unrelated files; and
- records the demo, Pulseq commit, writer, file hashes, sizes, and semantic counts in the manifest.

For the initial curated set, prefer demos already verified to retain one `mr.Sequence` object named `seq`; this keeps the modification close to the proposed one-line change. If a selected demo uses another variable name or multiple objects, describe that mapping explicitly in the generator configuration. Converting an already written `.seq` by reading it back and then calling `writeBinary` may be retained as a separately labelled compatibility test, but it is not the primary same-object accuracy/performance fixture path.

### Tier 1: official approved pairs

Retain `gre` and `epi_rs` as small correctness anchors. Add more official upstream pairs when available, especially extensions, rotations, arbitrary gradients, RF-heavy, ADC-heavy, and long-shape cases.

Every fixture must record upstream repository, commit, original path, license, declared version, converter/writer revision, and SHA-256.

### Tier 2: curated demoSeq correctness pairs

Generate `.seq` and `.bseq` from the **same in-memory sequence object in the same generation run**. Use one pinned producer per pair. Do not generate the `.seq` with MATLAB and the `.bseq` with Python for the primary format comparison, because producer differences would be mixed with format differences.

Start with a feature-covering subset rather than all 31 copied demos. The exact set depends on which demos the official binary writer supports, but target approximately 6-10 pairs covering:

- ordinary GRE/trapezoid baseline;
- EPI or EPI-RS with ADC and arbitrary gradients;
- spiral or another long arbitrary-gradient waveform;
- labels and soft delays;
- rotation extensions;
- RF-heavy or multichannel/RF-shim behavior;
- a refocusing/TSE-style sequence for RF reset and M1 behavior;
- a sequence with less-common definitions/extensions if not already covered.

Select the smallest fixture that adds each capability. Generate additional demo pairs only when they cover a parser feature absent from the current subset. Broad `.seq`-only demo smoke coverage can remain unchanged.

For the first generator, prefer the pinned MATLAB Pulseq demo scripts/writer because this matches the provenance of the SeqEyes Qt corpus and the official binary layout investigated for SeqEyes Web. A Python generator is equally fair if its Pulseq version can write the same official `.bseq` format; record it as a distinct producer lane. Cross-producer MATLAB-versus-Python compatibility is a valuable later accuracy test, but it is not the primary parser-speed comparison.

### Tier 3: generated performance families

Create deterministic sequences at several safe scales using a pinned official Pulseq writer/converter, not a SeqEyes-produced binary writer. Generate `.seq` and `.bseq` from the same in-memory sequence in one environment and store a manifest of semantic counts and hashes.

If the official converter cannot generate a required scaling case, a test-only writer may be used for performance load generation but must not serve as the independent accuracy oracle.

Required families:

- **Repeated-library/block scaling:** many blocks with heavy event reuse. This isolates block-table parsing from unique waveform-library growth.
- **Unique arbitrary-gradient scaling:** many unique shapes/events and both well-compressed and poorly compressed waveforms. This is the closest synthetic analogue to the reported `wave_test_R3x2` workload.
- **RF/ADC/extension scaling:** enough RF, ADC, labels/soft delays/rotations, and refocusing events to exercise non-gradient libraries and derived semantics.
- Optionally, one **mixed representative sequence** containing moderate amounts of each category.

Each generator should expose small, medium, and safely bounded large scale factors. This gives scaling curves and prevents a conclusion based on one file's event composition.

### Tier 4: user-provided `wave_test_R3x2` pair

`wave_test.bseq` remains prohibited for agents, local automation, and CI.

A user-generated `wave_test_R3x2.seq`/`wave_test_R3x2.bseq` pair would be highly useful as the **realistic large arbitrary-gradient case**, provided both are emitted from the same sequence object/writer run and the user confirms fixture provenance and permission to retain or use them. Record the generation script, Pulseq version/commit, writer, parameters, hashes, counts, and sizes.

Use this pair in stages:

1. parser-only in a fresh process with timeout and memory ceilings;
2. parse plus decode, with k-space/M1/PNS disabled;
3. browser first-paint with the normal preflight budget and expensive derived calculations skipped by default;
4. full approved calculations only when their estimates are within configured safety limits or an explicitly supervised run authorizes them.

Do not make this the only performance case. It represents unique arbitrary-gradient pressure well, but it cannot reveal how the formats scale for repeated blocks, RF/ADC-heavy data, extensions, or differently compressed shapes. Keep it manual/reporting-first until its resource behavior and redistribution status are established; a smaller generated analogue should remain the CI guard.

## Execution methodology

### Node parser benchmark

- Run cases in randomized pair order to reduce systematic warm-up bias.
- Warm the JIT separately, then record enough iterations for median, p90/p95, minimum, maximum, median absolute deviation, and confidence intervals where practical.
- Use fewer iterations for safely bounded large cases and more for small cases.
- Use fresh worker/process isolation for peak-memory samples.
- Keep acquisition-included and bytes-already-loaded parser measurements separate.
- Record Node version, OS, architecture, CPU, CI status, commit, package version, and benchmark schema version.

### Standalone Chromium benchmark

- Add paired input cases at a fixed viewport, device scale, theme, visible rows, and initial k-space policy.
- Add internal performance marks for bytes available, parse start/end, shapes complete, validation complete, decode complete, derived decision, first waveform paint, and ready.
- Measure a fixed deterministic interaction script after readiness.
- Capture console/page errors, crash/refresh, long tasks, operation counts, LOD selection, and nonblank render assertions.
- Use a fresh page or browser context per case; explicitly label cold and warm variants.

### Accuracy execution

- Run correctness in ordinary fast CI, independent of performance timing.
- Produce a machine-readable pair report with counts, tolerances, maximum/RMS errors, and the location of any first mismatch.
- Fail immediately on structural/topology mismatch; accumulate numeric error summaries before applying tolerances so regressions remain diagnosable.

## Reporting

Produce versioned JSON plus a concise Markdown/HTML summary containing:

- environment and fixture provenance;
- raw measurements and paired `.bseq`/`.seq` ratios;
- parser-only and acquisition-included results;
- end-to-first-paint and interaction results;
- peak/retained memory;
- correctness errors and pass/fail tolerances;
- skipped calculations and the exact reason/budget estimate;
- generated SVG comparisons for per-pair parser, k-space, and complete-ready
  speedup plus an extreme-case time/memory breakdown;
- no unsupported extrapolation from small fixtures to large sequences.

Do not combine parse, two k-space modes, and rendering into one unlabeled “total” number. A total user-visible load metric is useful, but every component must remain available.

## CI policy

- Structural, decoded-waveform, timing, derived-accuracy, and invalid-input tests are blocking.
- Deterministic memory/sample/operation ceilings are blocking once defined.
- Wall-clock performance remains reporting-first in the scheduled/manual workflow until at least 10-20 comparable runner observations establish variance.
- Prefer paired ratios from the same job over absolute time thresholds, but retain absolute non-completion caps.
- Promote a regression threshold only when it is larger than ordinary runner variance and has a documented response procedure.

## Implementation phases

### Phase 0: fixture and metric contract

- Define the versioned report schema and phase boundaries.
- Pin the primary MATLAB or Python official writer/converter provenance.
- Generate a curated 6-10-case demoSeq correctness set rather than converting the entire copied corpus by default.
- Generate three scaling families: repeated blocks, unique arbitrary gradients, and RF/ADC/extensions.
- Accept a same-run user-generated `wave_test_R3x2` pair as a supervised realistic stress case after provenance and safety review.
- Add fixture manifests and safety ceilings.

### Phase 1: expanded accuracy

- Generalize pair comparison helpers.
- Add normalized structure, shape/error statistics, timing, k-space, M1/PNS, render-summary, and invalid-input coverage.
- Keep these tests in normal blocking CI.

### Phase 2: Node speed and memory

- Split UTF-8 decode, parse, shape decompression, validation, and shared downstream timings.
- Add paired ratios, throughput, randomized execution, adequate repetitions, and isolated memory samples.

### Phase 3: standalone web load and render

- Instrument internal phase marks and add paired browser cases.
- Record first paint, ready, interactions, long tasks, operation budgets, and browser memory where stable.

### Phase 4: trend and decision report

- Collect scheduled artifacts across enough runs.
- Publish a baseline report explaining where BSEQ helps, where it does not, accuracy tolerances, and which cost center should be optimized next.
- Only then decide whether scalar reader optimization, lazy shape expansion, workers, alternative transport, or a new binary representation is justified.

## Acceptance criteria

- Every benchmark pair has independent, documented provenance and identical intended sequence semantics.
- No structural, timing, extension-topology, or discrete-field mismatch is accepted.
- Numeric differences remain within reviewed field/domain tolerances and are reported, not hidden by a single boolean.
- Parser-only, acquisition, shared downstream, first-paint, interaction, and memory results are separately visible.
- Results are reproducible locally and as reporting-first CI artifacts.
- The benchmark never loads `wave_test.bseq` and respects deterministic memory/sample ceilings.
- No production parser or renderer optimization is included in the benchmark implementation branch; measurement lands before optimization.

## Decisions to resolve before implementation

1. Which pinned official Pulseq writer/converter—MATLAB first or a verified Python writer—will generate the primary pairs, and can it cover all v1.5.2 extension types?
2. Which 6-10 demo scripts form the minimal feature-covering correctness set after generation capability is checked?
3. What generated medium/large ceilings are safe for ordinary CI runners?
4. Whether the user-generated `wave_test_R3x2` pair may be retained in the repository or only used in supervised local reporting.
5. Which PNS hardware profile becomes the pinned derived-accuracy reference?
6. Whether Chromium DevTools heap metrics are stable enough to block, or should remain diagnostic beside deterministic byte estimates.
