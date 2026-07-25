# SeqEyes-Plus Abstract — Frozen E1–E8 Experimental Protocol

Status: protocol frozen for the core experiments on 2026-07-18, with the
post-failure software-snapshot amendment below. Endpoints and tolerances were
not changed after viewing results.

Post-abstract note (2026-07-23): this frozen protocol and its 24-case/four-case
results remain immutable. A separately versioned follow-up expands the
comprehensive cohort to 37 and the representative subset to 11; see
`expanded_37_sequence_protocol.json`,
`figure2bd_37_sequence_cross_tool_protocol.json`, and
`eleven_sequence_reference_protocol.json`. The expansion does not
retroactively modify the submitted abstract.

## 1. Purpose

This protocol supplies the evidence placeholders in `abstracts/publication/sources/i2i_2026_seqeyes_draft_v3_source.md`. It distinguishes:

- software capabilities reported in Methods (`.seq`/`.bseq` import, seven channels, four workflow integrations, M1, and advisory PNS); and
- objectively evaluated outcomes eligible for Results (accuracy, pass counts, timing, and reference agreement).

The core protocol covers E1–E8 from `seqeyes_abstract_work_plan.md`. E9 sustained frame-time measurement and E10 SAFE/PNS agreement are retired; PNS remains an advisory Methods capability. Usability E11 remains optional and is not part of the frozen core.

## 2. Frozen software and machine snapshot

### Source snapshot

| Field | Frozen value |
|---|---|
| Workspace repository branch | `main` |
| Workspace protocol commit | `f93e462104b6380206beac6069897af8d290be01` |
| Relevant source worktree status at freeze | Clean |
| Baseline `seqeyes_plugin` commit | `462884e64e4c7a7cc3c73c752494104cf625aed3` (`v0.2.8`) |
| Corrective `seqeyes_plugin` commit | `8d6641cbc9d417cd237a90b7196adb6d1b0a513f` (`0.2.8` package metadata; EPI-RS trajectory and M1-refocusing fix) |
| Corrective bundle SHA-256 | `0e5fdeedc00779e3023ab21b2222828e862b1c25c9e3453706298572c4ee022c` |
| Subsequent public release | `v0.2.9`, merge commit `73abe1e99cae3f5c96a081cdaf9253c9f7efe3a1` |

Only documentation changes under `abstracts/` may occur after the freeze without invalidating the code snapshot. Any implementation change requires a new protocol revision and rerun of all affected experiments.

### Post-failure software-snapshot amendment

The original final E1/E2/E6/E7 reports were collected at plugin commit
`462884e` and explicitly record package version `0.2.8`. After the prespecified
E3 and E8 gates exposed EPI-RS boundary and M1-refocusing defects, the affected
reference comparisons and four-host validation were rerun from corrective
commit `8d6641c`. The package metadata was still `0.2.8`; the shared bundle hash
recorded in the E1–E8 evidence summary exactly matches that commit. Fixtures,
references, B0, endpoints, tolerances, and pass/fail rules were unchanged.

The corrective code was subsequently incorporated into public release
`v0.2.9` together with RF-centered M1 display/default refinements. The frozen
reports retain their actual `0.2.8`/commit provenance and are not retroactively
relabeled as `0.2.9` measurements. The release establishes availability of the
validated fixes, not a replacement timing dataset.

### Machine and runtime

| Field | Frozen or observed value |
|---|---|
| Computer | MacBook Pro, model `Mac15,6` |
| Processor | Apple M3 Pro, 11 logical cores |
| Memory | 18 GB |
| Operating system | macOS 15.7.1, build 24G231, arm64 |
| Node.js | 20.20.2 in Conda environment `seqeyes-plugin` |
| npm | 10.8.2 in Conda environment `seqeyes-plugin` |
| Python | 3.12.13 in Conda environment `seqeyes-plugin` |
| PyPulseq | 1.5.0.post1 |
| NumPy | 2.5.1 |
| VS Code | 1.127.0, arm64 |
| MATLAB | `24.2.0.2712019 (R2024b)`; user-verified batch launch and license checkout on 2026-07-18 |
| MATLAB invocation | `${MATLAB_EXECUTABLE} -batch "disp(version)"`; bare `matlab -batch ...` is unavailable because MATLAB is not on `PATH` |
| Pulseq MATLAB | `${PULSEQ_MATLAB_PATH}`; `mr.Sequence` resolved to `${PULSEQ_MATLAB_PATH}/+mr/@Sequence/Sequence.m` |
| Notebook host | VS Code notebooks; standalone JupyterLab/classic Notebook installation is not required for the primary Python/Jupyter workflow test |
| MATLAB SeqEyes desktop smoke | Text `.seq` and binary `.bseq` GUI launches user-verified on 2026-07-18 with the `writeSpiral` pair; both viewers opened successfully using the full MATLAB executable path and `-desktop -r` |
| Browser | Bundled Playwright Chromium `149.0.7827.55`; reconfirm in each final report |
| Browser viewport | 1280 × 900 pixels |
| Browser mode | Headless Chromium for reproducible timing; headed screenshots are figure-generation artifacts, not timing measurements |

Do not report machine serial number, hardware UUID, or other device identifiers in results or metadata copied into the abstract.

## 3. Prior reports are pilot evidence, not final results

The existing `latest.json` and `latest-browser.json` reports were generated from earlier commits and, for the current `latest.json`, quick settings of one warm-up and three measured parser iterations. Their current SHA-256 hashes are:

- parser report: `77aec84ec080f4f64fc25f5bb2bff6d327923f0e491fd69fcdf5a9a5de7e6af0`;
- browser report: `2148517848265ffbd13aafa4f1d43e668dcfec1495eefe4156be5fa4d5c644b5`.

These reports establish feasibility and inform the protocol but must not supply final draft-v3 timing numbers. E1, E2, E6, and E7 will be rerun at the frozen commit. This resolves the discrepancy between the parser speedups quoted in draft v3 and the values in the latest local report.

## 4. Frozen fixture groups

### Paired-format cohort for E1, E2, and E7

Use all 23 paired Pulseq MATLAB demo cases in `bseq/benchmark_data/demo_seq_pairs`, plus the bounded large fixture `wave_test_R3x2`, for 24 pairs total.

The full `wave_test.bseq` has no matched `.seq` input in the current workspace and is therefore excluded from paired-format E1, E2, and E7. It is considered only in the explicitly supervised E6 stability/performance procedure below and must not be added to automatic fixture discovery or CI.

### Current representative eleven-sequence subset

The submitted abstract used a six-sequence Figure 2B-D subset. A separately
versioned post-abstract evidence expansion adds five cases, producing this
current eleven-sequence subset:

| Case | Public label | Reason for inclusion |
|---|---|---|
| `writeEpi` | EPI | Conventional Cartesian EPI |
| `writeEpiRS` | EPI-RS | EPI with arbitrary-gradient behavior |
| `writeGradientEcho_label` | Labelled GRE | Cartesian GRE with label metadata |
| `writeFastRadialGradientEcho_rot3D` | 3D radial GRE | Radial/rotated 3D-gradient behavior |
| `writeSpiral` | Spiral | Non-Cartesian spiral trajectory |
| `writeUTE` | UTE | Non-Cartesian ultrashort-echo trajectory |
| `writeEpiSpinEchoRS` | EPI spin echo RS | Refocused EPI with ramp sampling |
| `writeHASTE` | HASTE | Single-shot turbo spin echo |
| `writeTrufi` | Trufi | Balanced steady-state free precession |
| `writeTSE` | TSE | Multi-echo turbo spin echo |
| `writeZTE_Petra` | ZTE PETRA | Large hybrid radial/Cartesian zero-echo-time case |

The historical four-case and passed 6/6 reference results remain immutable.
The supplementary `eleven_sequence_reference_protocol.json` reruns all eleven
under one v0.2.9-equivalent software snapshot, retaining every result against
the unchanged tolerances.

If a selected host or reference tool cannot invoke one of these cases because
of a genuine integration defect, record a failure; do not silently replace the
case.

### Independent k-space reference cases for E3

Use the committed, hash-pinned SeqEyes Qt trajectory baselines:

| Case | ADC samples | Max absolute/RMSE tolerance | Absolute mean-error tolerance |
|---|---:|---:|---:|
| `v151_gre` | 16,384 | `1e-5` | `5e-6` |
| `v151_spiral` | 52,000 | `1e-5` | `5e-6` |

Fixture definitions and hashes are frozen in `seqeyes_plugin/test/kspace_baselines/cases.json` (SHA-256 `400c20fff83d9fc68de262d5a870d108da24ae1333480ab96e1151d2c729538f`). These baselines validate k-space, not all waveform channels.

For waveform reference checks on representative sequence subset, use Pulseq MATLAB R2024b as the primary reference and PyPulseq 1.5.0.post1 as a secondary cross-check. Use a simple official-Pulseq numerical export rather than reproducing the full SeqEyes Qt procedure. The Qt procedure and committed Qt k-space baselines provide methodological guidance and trajectory cross-checks, but they should not be the sole waveform reference because Qt SeqEyes also uses the official Pulseq reader. Reproducible exporters are implemented in `abstracts/experiments/scripts/core/export_pulseq_matlab_reference.m` and `abstracts/experiments/scripts/core/export_pypulseq_reference.py`.

### Wave-MPRAGE performance cases for E6

The user explicitly authorized a supervised attempt of both the reduced and full Wave-MPRAGE cases on 2026-07-18. The reduced case remains the completing baseline; the full case may be promoted to the primary abstract result only if it satisfies the predeclared stability gate.

#### D1 — Reduced high-workload baseline

| Input | SHA-256 |
|---|---|
| `wave_test_R3x2.seq` | `156e72727997584d504a4c6a25d645019cae51117011f1c513fca917c6dfad8c` |
| `wave_test_R3x2.bseq` | `adde36fa0e01e59ff23f6459a1e23bdeb1052c53356da6dad6f059da5eea4262` |

Report that this is a reduced, R6-accelerated Wave-MPRAGE stress case rather than a fully sampled acquisition. Report its input size, 12,839 blocks, estimated raster/ADC/trajectory scale from the new run, and the selected timing endpoints below.

#### D2 — Full Wave-MPRAGE candidate

| Input | Size | SHA-256 |
|---|---:|---|
| `wave_test.bseq` | 3.9 MiB | `5b45b206359340e04410da726472509b7e678eb101c9148a0769c16a91e87a04` |

This is the fully sampled 3D Wave-encoding MPRAGE case with a nominal 192 × 256 × 256 matrix. The current workspace does not contain a paired full `.seq` file, so D2 measures binary full-sequence stability/performance only and must not be used in a `.seq`/`.bseq` speedup calculation.

Historical project notes describe D2 as crash-prone under older rendering behavior. It therefore requires an explicit, isolated stability preflight before repeated measurements. It remains excluded from CI, ordinary test discovery, and unattended benchmark suites.

### M1 validation cases for E8

Use an independent Python/NumPy or MATLAB reference implementation that directly evaluates the documented integrals rather than importing SeqEyes code.

1. Constant single-axis gradient after an excitation: analytic M0/M1 solution.
2. Continuous triangular bipolar gradient `[0, +100, 0, -100, 0] Hz/m` at `[0, 5, 10, 15, 20] ms, with exact zero final M0 and non-zero M1.
3. Excitation followed by refocusing and gradients: verify RF-center reset/sign bookkeeping.
4. One representative Pulseq case from representative sequence subset: compare complete M1x/y/z checkpoint arrays.

The primary reported convention is `rfCenter`, matching the default SeqEyes behavior. `observationTime` is a secondary diagnostic result but receives the same numerical regression coverage. Report M1 in `s/m` and time in seconds. No external M1 package is required: a standalone analytic Python Decimal script evaluates constant-gradient, continuous bipolar-gradient, and RF reset/refocusing cases without importing SeqEyes. M1 availability remains a Methods capability; M1 accuracy is included in Results only if this analytic validation is completed.

## 5. Frozen endpoints and tolerances

### E1 — `.seq`/`.bseq` paired accuracy

Use the existing benchmark runner without weakening its gates:

- structure/library membership and array lengths: exact;
- sequence duration and decoded time: absolute difference ≤ `1e-9 s`;
- gradient waveform: absolute difference ≤ `max(1e-9, 5e-6 × maximum gradient magnitude)`;
- RF magnitude: absolute difference < `1e-3`;
- RF phase: absolute difference < `1e-3 rad`;
- shape values: runner tolerance `2e-6` absolute plus `2e-6` relative;
- metadata: runner tolerance `1e-9` absolute plus `5e-6` relative;
- all 24 pairs must pass for a `24/24` result.

Do not interpret permitted text/binary rounding differences as physical disagreement.

### E2 — Browser state/canvas parity

Use the existing browser runner's predeclared parity gate. Record the exact compared state fields and mismatch output in the final report. Report `N/N` pass count, not “identical rendering,” unless pixel-level image comparison is separately implemented.

### E3 — Reference waveform and k-space accuracy

All SeqEyes, Pulseq MATLAB, and PyPulseq reference paths use a frozen `B0 = 3.0 T`. A fixture with an explicit conflicting B0 fails preflight; a missing B0 uses 3.0 T. RF phase is compared only where complex RF magnitude is at least `1e-6` of the sequence-wide RF peak, and excluded points are counted in the comparison output.

- k-space independent k-space reference cohort: use the committed per-axis maximum absolute error, RMSE, and absolute mean-error thresholds above;
- integer event counts and array lengths: exact;
- waveform timing: ≤ `1e-9 s` where the references use the same raster representation;
- gradient/RF comparisons: initially use the E1 tolerances above;
- if MATLAB/PyPulseq sampling grids differ, resample both references onto predefined physical event/raster checkpoints before comparison and record the interpolation rule.

No tolerance may be relaxed after inspecting errors. A representational mismatch must be explained and handled through a protocol amendment or reported as a limitation.

### E4/E5 — Four-host workflow operation and output consistency

For each of the eight representative sequence subset format cases in each of four hosts, record:

- invocation completed and viewer became ready: pass/fail;
- duration in seconds;
- block count;
- ADC sample count;
- selected RF/Gx/Gy/Gz/ADC checkpoints defined by the reference-export table;
- k-space ADC count, first/center/last coordinates, and per-axis bounds.

Counts must agree exactly. Time, waveform, and k-space comparisons use the E3 tolerances. The desired result format is `N/N host-format-case combinations passed`; with four hosts and eight cases, the planned denominator is 32.

Host definitions:

1. standalone browser local file input;
2. VS Code custom editor file open;
3. MATLAB `seqeyes(seq)` for text-derived in-memory input plus `seqeyes(file)` for binary input;
4. Python/Jupyter: `seq.plot()` integration in a VS Code notebook for text-derived in-memory input plus the documented file-loading API for binary input. VS Code notebooks are the user's normal environment and therefore the primary notebook host; JupyterLab/classic Notebook are not required.

The browser/script fallback of the Python package may be smoke-tested but is not a fifth host.

### E6 — Wave-MPRAGE stability and browser performance

Primary endpoints:

1. local file-input-to-ready time;
2. automatic k-space calculation time;
3. k-space panel opening latency.

Secondary diagnostic endpoints include longest synchronous task, retained heap after diagnostic GC, and conservative peak-memory estimate; these should not displace the primary endpoints in the abstract.

#### D1 baseline procedure

Run five fresh pages per format in headless Chromium at 1280 × 900. Alternate `.seq` and `.bseq` order. Report median and interquartile range for each primary endpoint. Record all raw samples. Do not report frame rate from this experiment.

#### D2 full-sequence procedure — retired after preflight

1. Run D2 alone in a fresh browser process with no other benchmark cases queued.
2. Use an explicit input path and a dedicated supervised opt-in; do not remove the existing safeguards that reject accidental `wave_test` discovery.
3. During the first stability preflight, record whether:
   - the file-input operation completes within the benchmark timeout;
   - the page/browser process remains alive;
   - the viewer reaches its ready state without a fatal error;
   - waveform rendering is non-empty and controls remain responsive;
   - the k-space panel opens without page/process termination.
4. If the first attempt crashes, terminates the renderer, produces an out-of-memory condition, or fails the readiness/functionality gate, stop D2 testing and record one failed preflight. Do not retry it repeatedly in the same session.
5. If the first attempt passes, run four additional fresh-browser repetitions for five total runs. Report median and interquartile range using the same primary endpoints as D1.

Promotion rule:

- Use D2 as the principal abstract performance result only if all five independent runs complete the stability/functionality gate and produce usable timing records.
- If D2 fails preflight or any repeated run, report it internally as a stability boundary and use D1 for the abstract's quantitative performance result.
- Always retain D1 results so that a completing benchmark is available and so the effect of the full case can be interpreted against a documented reduced workload.

The completed preflight produced two passes followed by a 120-second k-space timeout. D2 failed its promotion rule and is now excluded from further testing and abstract results. The procedure above is retained only as an audit record; do not rerun full `wave_test.bseq`.

### E7 — Binary parser performance

- three warm-up iterations;
- 15 measured iterations per format;
- alternate format order;
- parse preloaded bytes so filesystem acquisition is reported separately;
- report per-pair medians, geometric mean of paired speedups, median paired speedup, and aggregate storage difference;
- do not present parser speedup as end-to-end browser speedup.

The final number replaces, rather than selectively confirms, the speedup currently bracketed in draft v3.

### E8 — M1 reference agreement

For each M1 validation cohort case, compare M1x/y/z at all shared raster/checkpoint times and report:

- maximum absolute error;
- RMSE;
- final M1 per axis;
- reset values at excitation centers and sign behavior at refocusing centers.

Frozen tolerance: `1e-9 s/m + 1e-8 × reference magnitude` at each checkpoint. Validate the exact calculation path in both `rfCenter` and `observationTime` modes and require exact/coarse agreement at analytical checkpoints. If the independent reference exposes a convention disagreement, do not change conventions after observing results—report both conventions and revise the abstract claim accordingly.

Reference validity: `abstracts/experiments/scripts/core/m1_analytic_reference.py` evaluates the closed-form integral of each piecewise-linear segment with 50-digit decimal arithmetic and hard-coded analytical expectations. It also verifies amplitude and time-scaling identities. This establishes mathematical ground truth for the defined segment representation; it does not claim that the simplified RF pathway bookkeeping is an exact physical model for arbitrary coherent steady-state sequences.

### E9 — Retired WebGL k-space frame-time preflight

Purpose of the completed preflight was to assess an unmeasured “millions of points at 60 fps” claim. The method was found not to represent ordinary inspection and is retired. The following original design is retained for auditability only and must not be run as a E1–E8 evidence experiment.

#### Cases and order

1. `writeSpiral.bseq` from representative sequence subset validates the benchmark harness on a representative non-Cartesian trajectory.
2. `wave_test_R3x2.bseq` measures the reduced high-workload case.
3. Full `wave_test.bseq` is measured only after it independently passes the D2 stability gate. E9 must not be the first operation that opens D2.

#### Rendering action

After the sequence reaches ready state and the k-space panel is open and fitted:

1. wait for two animation frames and complete a 60-frame warm-up;
2. execute a deterministic free-3D camera rotation for 300 `requestAnimationFrame` callbacks;
3. on each callback, increment both camera angles by fixed values and call the existing fast k-space draw path without resizing the canvas;
4. record callback timestamps and synchronous draw-call start/end timestamps;
5. do not alter point size, viewport, device-pixel ratio, theme, or trajectory data during a run.

The harness may be injected by Playwright or exposed through a test-only `SeqEyesDev` hook. It must exercise the production `drawKsFast`/WebGL path and must not replace the renderer with benchmark-specific drawing code.

#### Repetitions and environment

- five fresh-browser runs per eligible case;
- headless Chromium `149.0.7827.55` at 1280 × 900 for the frozen protocol;
- record device-pixel ratio, k-space canvas dimensions, ADC point count, uploaded point count, WebGL vendor/renderer strings when available, and raw frame timestamps;
- keep the browser foreground/unthrottled and run no other benchmark case concurrently.

#### Reported metrics

- achieved frames per second: `(measured frames - 1) / elapsed timestamp interval`;
- median, 95th-percentile, and 99th-percentile inter-frame interval;
- percentage of intervals >25 ms and >50 ms;
- median and 95th-percentile synchronous draw-call duration;
- across-run median and IQR for achieved FPS and principal frame-time metrics.

This is a descriptive performance result, not a pass/fail accuracy gate. Report “60 fps” only if the measured result supports that wording; otherwise report the observed FPS/frame-time values without rounding them into a marketing claim. Headless results must be labeled as such.

#### Preflight amendment (2026-07-18)

The sustained 60-warm-up/300-measured-frame design is retained above for auditability but is not suitable as the large-case stability test. A corrected smoke run showed that it repeatedly redraws the entire trajectory: `writeSpiral.bseq` produced 1,535,600 ADC points and only 2.29–2.36 headless rAF FPS across five browsers, while synchronous JavaScript submission was 0.1–0.2 ms. The reduced Wave case contains 6,428,672 ADC points and did not finish the sustained loop in 40 minutes, despite the existing production benchmark showing normal load and interaction timings (3.110 s input-to-ready, 2.783 s k-space calculation, and 1.523 s k-space-panel opening for `.bseq`). This discrepancy reflects different workloads, not a reduced-Wave load regression.

Final decision:

- do not use the sustained E9 loop as the D1/D2 stability gate or as an application-level FPS claim;
- retain the five spiral runs as audit-only renderer stress characterization;
- use only the established production interaction benchmark for reduced Wave;
- exclude full Wave from further execution and from the abstract;
- retire and remove the dedicated E9/D2 Playwright runner and its benchmark-only viewer hook;
- do not include “60 fps” or sustained-rotation claims in the abstract unless a future user-paced interaction protocol is separately validated.

Validation of the amended method: a fresh three-iteration-per-format run of the established production benchmark measured reduced Wave `.bseq` input-to-ready at median 2.733 s (range 2.732–2.735 s), k-space calculation at median 2.465 s, and panel opening at median 1.518 s (range 1.515–1.532 s), with `.seq`/`.bseq` state parity passing. The separately gated full-Wave series completed mandatory k-space and panel opening twice (47.790 s and 56.024 s), then timed out during k-space on the third fresh browser at the frozen 120 s limit. Stop-after-first-failure prevented attempts 4–5. Full Wave therefore fails the promotion rule; reduced Wave remains the formal large case.

## 6. Benchmark execution and reporting rules

- Use the Conda environment `seqeyes-plugin` for Node/browser experiments.
- Close unrelated compute-heavy applications where practical and record exceptions.
- Record start time, end time, command, exit status, report path, and report SHA-256.
- Preserve JSON/raw results; generate Markdown/SVG summaries from those raw reports.
- Do not average across incompatible endpoints or different software commits.
- Use medians for runner timing and geometric means only for multiplicative paired speedups.
- Report spread for principal timing results; with five browser runs use IQR.
- Accuracy gates are pass/fail and must not be discarded as timing outliers.
- A failed or incomplete case remains in the denominator.
- The full `wave_test.bseq` is excluded from all further abstract, local automation, and CI execution.

## 7. Evidence preflight items

The following preflight requirements are complete. Representative in-memory MATLAB and VS Code-notebook invocations move into E4 as formal workflow measurements.

- [x] Confirm MATLAB R2024b launches in batch mode and record exact version/license availability. User-verified command: `${MATLAB_EXECUTABLE} -batch "disp(version)"`; result `24.2.0.2712019 (R2024b)`. The bare `matlab` command is not available on `PATH`.
- [x] Complete/review the independent MATLAB/PyPulseq waveform-export procedure for representative sequence subset. Both exporters are implemented; all four official Pulseq MATLAB exports completed with k-space enabled.
- [x] Create/review the host-neutral checkpoint schema used by Web, VS Code, MATLAB, and Python/Jupyter. See `abstracts/experiments/protocols/host_checkpoint_schema.md`.
- [x] Create/review the independent analytical M1 reference script. `abstracts/experiments/scripts/core/m1_analytic_reference.py` imports no SeqEyes code and passes its closed-form and metamorphic checks.
- [x] Confirm representative host viability before collecting formal results; the complete predefined E4 matrix remains a E1–E8 evidence measurement and does not permit fixture substitution.
  - [x] MATLAB desktop text-input viability: `writeSpiral.seq` opened successfully.
  - [x] MATLAB desktop binary-input viability: `writeSpiral.bseq` opened successfully.
  - [x] Full representative sequence subset GUI execution is not required for MATLAB preflight; official numerical exports completed for all four text cases. MATLAB `seqeyes(seq)` remains an E4 measurement.
  - [x] Standalone Web preflight: four pairs loaded and browser parity passed 4/4.
  - [x] Python viewer packaging preflight: all eight inputs generated valid embedded HTML. Actual VS Code-notebook `seq.plot()` remains an E4 measurement.
  - [x] VS Code Extension Host: all eight representative sequence subset inputs opened/exported under installed VS Code 1.127.0; exit code 0.
- [x] Confirm bundled Chromium version for protocol freeze: `149.0.7827.55`. Reconfirm automatically in the final report.
- [x] Retire the dedicated E9/D2 runner after preserving its manifest and raw audit results. Full Wave is excluded from further execution.
- [x] Retire E9 frame-time measurement. Use production load/readiness/k-space/panel-opening endpoints only.
- [x] Retire E10 SAFE/PNS reference agreement. PNS remains an advisory Methods capability and no PNS accuracy claim will appear in Results.

## 8. Planned abstract result selection

Select no more than four principal findings after the frozen analyses:

1. waveform/k-space reference accuracy or pass count;
2. four-host workflow/output consistency pass count;
3. large-sequence responsiveness;
4. M1 reference agreement.

Binary parser speedup is a candidate secondary finding and should replace a principal finding only if more compelling and the page permits it. E9 rendering FPS is excluded. PNS remains an advisory Methods capability and is not an experimental Result.
