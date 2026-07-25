# `.seq` versus `.bseq` benchmark findings

Status: initial local Node and standalone Chromium baseline completed on
2026-07-16. Performance thresholds remain reporting-first.

## Scope

The benchmark covers 23 same-run Pulseq MATLAB `demoSeq` pairs plus the bounded
`wave_test_R3x2` extreme arbitrary-gradient pair. The full `wave_test.bseq` is
prohibited and was not loaded.

The Node test compares acquisition, preloaded-byte parsing, normalized
structure, decompressed shapes, decoded waveforms, and duration. The Chromium
test uses the actual standalone HTML file-input path and measures local file
transport, parsing, timing detection, block decoding, automatic k-space,
viewer preparation/rendering, fixed interactions, long tasks, heap use, and
browser-state parity. Chromium values below are medians of three fresh-page
runs per format at 1280×900 in headless Chromium.

## Main results

- Node accuracy: 24/24 pairs passed within the documented text-versus-binary
  precision tolerances.
- Node preloaded-byte parser speedup: 5.303× geometric mean and 4.786× median
  across the 24 pairs (15 measured iterations per format).
- Browser state/canvas parity: 24/24 pairs passed.
- Browser file-input-to-ready geometric-mean speedup: 1.014×; median paired
  speedup: 1.016×.
- Browser k-space geometric-mean speedup: 0.990×; median paired speedup:
  0.992×. K-space is effectively format-neutral after parsing.
- Parsing is consistently faster for BSEQ, but parsing is too small a fraction
  of the complete browser pipeline to materially change ordinary ready time.

The MATLAB text writer labels these generated `.seq` files as Pulseq 1.5.1,
while `writeBinary` emits the official 1.5.2 binary layout. Event scalars in
text are rounded to roughly six significant digits while binary preserves
float64 values. The accuracy gate treats these as known representation
differences and checks normalized structure and decoded behavior with explicit
tolerances rather than requiring byte or scalar identity.

## `wave_test_R3x2` breakdown

The fixture contains 12,839 blocks, including 12,728 blocks with arbitrary
gradients, 31,820 axis-level arbitrary-gradient references, and 566 arbitrary
gradient library events.

| Phase | `.seq` | `.bseq` |
|---|---:|---:|
| Local file read | 2.3 ms | 2.0 ms |
| Parse | 37.1 ms | 13.9 ms |
| TR/TE detection | 1.9 ms | 1.8 ms |
| Block decode | 47.4 ms | 59.9 ms |
| Automatic k-space | 2618.7 ms | 2655.5 ms |
| Viewer preparation/render residual | 277.4 ms | 261.0 ms |
| File input to ready | 2964.0 ms | 2998.3 ms |
| Longest synchronous load task | 2961 ms | 2996 ms |
| Opening the populated k-space panel | 1511.5 ms | 1508.3 ms |

BSEQ parsing is about 2.67× faster inside the instrumented browser run, but the
complete load ratio is 0.989× in this run. Automatic k-space consumes roughly
2.6 seconds and is the dominant reason this pair takes seconds to open. The
small format-to-format k-space and complete-load differences change direction
between repeated runs and should be treated as timing noise, not a causal
format speedup.
The CPU profile is dominated by `calculateKspace`, `interp`, `gradVal`, garbage
collection, block lookup, and GPU trajectory upload. Waveform downsampling,
overview construction, and initial waveform drawing are secondary costs.

## K-space resource pressure

For both formats, the viewer estimates:

- 9,250,001 regular raster samples;
- 6,428,672 ADC samples;
- 15,774,320 grid candidates;
- approximately 2.54 GiB conservative peak memory; and
- a calculated result containing 15,691,401 trajectory times plus 6,428,672
  ADC times and their corresponding axis arrays.

All three sample counts remain below the current interactive count limits, so
the standalone viewer calculates k-space automatically even though the
conservative memory estimate exceeds 1 GiB. This is the important policy gap
revealed by the benchmark: count-only admission can permit a multi-second,
multi-gigabyte-estimate calculation on a memory-limited device.

Median JavaScript heap immediately after the benchmark interactions was about
452.1 MiB for `.seq` and 565.1 MiB for `.bseq`, but after an explicit diagnostic
garbage collection both retained about 105.2 MiB. The pre-GC difference is
therefore transient allocation/collection timing, not a persistent BSEQ model
twice the size. Peak live memory still matters for crashes and mobile refreshes;
forced GC is only a diagnostic and is not a production mitigation.

## Conclusions and next measurements

1. BSEQ substantially improves parsing, but parser optimization alone cannot
   solve the observed seconds-long browser load.
2. Automatic full k-space is the first optimization/policy target for this
   workload. The existing conservative peak-memory estimate should be
   evaluated as an independent admission gate in addition to sample counts.
3. K-space panel upload/rendering is another major interaction cost once the
   trajectory exists.
4. Viewer serialization and overview work are measurable but not the leading
   bottleneck for this extreme case.
5. M1/PNS are not part of the default file-open path because they require a
   user toggle/profile. Benchmark them independently with a pinned hardware
   profile so their cost is not conflated with ordinary loading.
6. Controlled cold-cache acquisition, worker/off-main-thread prototypes,
   isolated peak-memory sampling, mobile-device CI, and generated scaling
   families remain future phases.

## Visualizations

`benchmark_results/speedup-comparison.svg` plots parser, complete-ready, and
k-space speedup for all pairs on a log₂ axis with a 1× break-even line.
`benchmark_results/wave-test-r3x2-breakdown.svg` plots the extreme fixture's
load-time phases, transient/retained JavaScript heap, and k-space workload.
They are generated from the machine-specific JSON reports and therefore remain
ignored by Git. Regenerate them with `benchmarking/generate_plots.sh`.

The reproducible commands and report schema are documented in
`benchmarking/README.md`. Machine-specific `latest*.json` and `latest*.md`
reports remain ignored by Git.
