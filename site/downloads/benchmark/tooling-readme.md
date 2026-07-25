# BSEQ/SEQ benchmark tooling

This standalone benchmark uses the current SeqEyes Web parser to compare the
paired Pulseq files in `bseq/benchmark_data/demo_seq_pairs`. It does not modify
the `seqeyes_qt` or `seqeyes_plugin` source trees.

When present, `demo_files/wave_test_R3x2.seq` and `.bseq` are included by
default as a separately labelled extreme arbitrary-gradient case. The full
`wave_test.bseq` is explicitly prohibited and is never discovered or loaded by
the runner.

The initial benchmark measures:

- `.seq` and `.bseq` file sizes and SHA-256 hashes;
- warm filesystem acquisition time, reported separately from parsing;
- parsing from preloaded bytes, including text UTF-8 decoding and each
  format's validation and shape decompression;
- normalized sequence structure equivalence;
- decompressed shape and decoded RF/gradient/ADC equivalence; and
- total sequence-duration equivalence.

Every result also reports the number of unique arbitrary-gradient library
events, blocks containing at least one arbitrary gradient, total axis-level
arbitrary-gradient block references, per-axis reference counts, and the
fraction of blocks containing arbitrary gradients.

Performance is reporting-first and does not fail on a timing ratio. Accuracy
failures produce a nonzero exit status.

## Generate paired fixtures from Pulseq MATLAB demos

`matlab/gen_seq_file.m` runs each official Pulseq MATLAB demo and writes its
final in-memory `seq` object as a same-run `.seq`/`.bseq` pair:

```matlab
addpath('/path/to/pulseq/matlab')
addpath('/path/to/seqeyes_dev/bseq/benchmarking/matlab')

gen_seq_file('/path/to/pulseq/matlab/demoSeq')
```

The default output is `bseq/benchmark_data/demo_seq_pairs`. An optional second
argument selects a different output directory.

Hardware-limit and Pulseq diagnostic warnings are reported but do not
automatically reject an otherwise complete sequence. Dependency-gated demos
that warn and return with an empty `seq` object are still skipped. Before an
existing fixture is replaced, the generator writes temporary files, reads both
formats back, and requires their block and core event-library counts to match
the source sequence.

## Convert an existing `.seq` file with Python

The preferred large-file converter uses the official PyPulseq text reader and
the local, attributed Pulseq 1.5.2 binary serializer in `python/`. The
serializer writes explicitly little-endian records, calculates the MD5 while
streaming the output, and validates the signature without loading the complete
binary file into memory.

Activate the environment that contains official PyPulseq:

```bash
conda activate seqeyes-plugin
python bseq/benchmarking/python/seq2bseq.py \
    /path/to/input.seq \
    /path/to/output.bseq \
    --json-report /path/to/conversion-report.json
```

The output defaults to the same directory and stem as the input. Existing
outputs are protected unless `--force` is supplied. The default output is
signed and signature-verified; `--no-signature` produces an unsigned file and
automatically performs header verification instead.

This writer is not an official PyPulseq API. It was adapted from the
MIT-licensed `pypulseq-matlab-like` writer and changed to target the exact
Pulseq 1.5.2 wire format accepted by SeqEyes. Provenance and license text are in
`python/THIRD_PARTY_NOTICES.md`.

The 459 MiB `4Dflow_3dradial_brain_iso1.seq` fixture was converted locally as a
bounded validation:

- text read and legacy normalization: 22.97 s;
- streamed binary write: 3.16 s;
- streamed signature verification: 0.27 s;
- total: 26.76 s with 1.22 GiB peak RSS;
- signed output: 176,198,996 bytes (168.0 MiB).

The SeqEyes TypeScript binary parser then loaded that output once in 0.69 s and
reported the expected 512,768 blocks, 179,648 arbitrary gradients, 87,507
trapezoids, and 179,651 shapes. This is parser validation only; rendering this
large sequence remains separate future work.

Official PyPulseq 1.5.0 can read ordinary events, triggers, labels, and soft
delays used by this converter. Text sequences containing newer rotation or RF
shim extensions that official PyPulseq cannot read should continue to use the
MATLAB converter.

Run unit, signature, legacy-1.4, and SeqEyes semantic-parity tests with:

```bash
./bseq/benchmarking/python/test_converter.sh
```

The parity matrix covers a basic FID, labels and soft delays, an arbitrary
spiral, and `wave_test_R3x2`. A separate unit fixture checks Pulseq 1.4.2 RF
upgrades and MATLAB-compatible gradient-edge reconstruction. It does not load
the prohibited full `wave_test` sequence.

## Convert an existing `.seq` file with MATLAB

The MATLAB helper `matlab/seq2bseq.m` converts one existing Pulseq text file
through the official `mr.Sequence.read()` API. Normal files use the official
signed `writeBinary()` path and are fully verified with `readBinary()` before
replacing the destination.

```matlab
addpath('/path/to/pulseq/matlab')
addpath('/path/to/seqeyes_dev/bseq/benchmarking/matlab')

seq2bseq('/path/to/gre.seq');
seq2bseq('/path/to/gre.seq', '/path/to/output/gre.bseq');
```

Inputs of 256 MiB or larger automatically use large-file mode. This disables
Pulseq's whole-output-in-memory signature step, releases the source sequence
before verification, and performs lightweight binary header verification rather
than constructing a second complete sequence object:

```matlab
seq2bseq('/path/to/large.seq');

% Equivalent explicit invocation:
seq2bseq('/path/to/large.seq', [], 'LargeFileMode', true);
```

The behavior can be overridden when resources and runtime permit:

```matlab
seq2bseq('/path/to/large.seq', [], ...
    'LargeFileMode', true, ...
    'CreateSignature', true, ...
    'Verification', 'full');
```

`Verification` accepts `full`, `header`, `none`, or `auto`. Header verification
checks the Pulseq magic value, writer version, first section code, and nontrivial
output size; it does not establish full semantic equivalence. Full verification
now releases the source object before loading the binary object, reducing peak
memory even for normal files.

Large-file mode uses `matlab/writeBinaryUnsigned.m`, a local copy of the
official writer's section serialization with only the whole-file signature
phase omitted. Keep it aligned with the Pulseq version used by the benchmark;
small-fixture parity should compare its bytes with the signed writer's payload
before the signature section.

PyPulseq 1.5.0 does not currently expose an official binary writer. The Python
helper above therefore keeps the official reader but supplies a separately
tested local serializer; this MATLAB helper remains useful for extension
coverage and comparison with the reference implementation.

## Run

From the workspace base folder:

```bash
./bseq/benchmarking/run_benchmark.sh
```

The wrapper compiles the current `seqeyes_plugin` TypeScript into its ignored
`out` directory, then runs Node from the `seqeyes-plugin` Conda environment.
Reports are written to:

- `bseq/benchmark_results/latest.json`
- `bseq/benchmark_results/latest.md`

Useful options:

```bash
./bseq/benchmarking/run_benchmark.sh --quick
./bseq/benchmarking/run_benchmark.sh --filter 'Epi|Spiral'
./bseq/benchmarking/run_benchmark.sh --no-extreme
./bseq/benchmarking/run_benchmark.sh --iterations 30 --warmup 5
./bseq/benchmarking/run_benchmark.sh --output /tmp/seqeyes-benchmark.json
```

The default run uses three warm-up iterations and 15 measured iterations per
format. Format order alternates each iteration to reduce ordering bias.

## Interpretation

`speedupTextOverBinary` is the `.seq` median divided by the `.bseq` median. A
value greater than 1 means BSEQ was faster. Acquisition numbers are warm
filesystem measurements and must not be presented as controlled cold-load
results. Parser measurements start with bytes already resident in memory.

The JSON report contains all raw timing samples, tolerances, mismatch details,
environment metadata, file hashes, parser/package version, and Git revisions.

## Full standalone-browser benchmark

Run the parser/accuracy benchmark followed by the real standalone Chromium
load and interaction benchmark:

```bash
./bseq/benchmarking/run_full_benchmark.sh
```

Use `--quick` for one browser iteration per format:

```bash
./bseq/benchmarking/run_full_benchmark.sh --quick
```

The browser phase measures local file-to-ready time, `File.arrayBuffer`, parse,
timing detection, block decoding, k-space estimation/calculation, unattributed
viewer preparation and initial rendering, long tasks, initial draw duration,
fit/zoom/k-space interactions, Chromium heap metrics, canvas validity, and
`.seq`/`.bseq` browser-state parity. Heap use is recorded both before and after
an explicit diagnostic garbage collection so transient allocation pressure can
be distinguished from retained data. A separate diagnostic CPU profile for
`wave_test_R3x2` reports the functions with the highest self time.

Browser reports are written to:

- `bseq/benchmark_results/latest-browser.json`
- `bseq/benchmark_results/latest-browser.md`

The browser report includes per-pair and aggregate k-space speedups in addition
to parser and complete file-input-to-ready speedups. Both Markdown reports show
aggregate and per-pair `.seq`/`.bseq` storage, the BSEQ/SEQ size ratio, and the
percentage of storage saved. The full workflow also
generates two local SVG visualizations:

- `speedup-comparison.svg` compares parser, k-space, and complete-ready speedup
  plus file-storage reduction for every sequence against a clear 1× break-even
  line;
- `wave-test-r3x2-breakdown.svg` shows the extreme case's load-time phases,
  transient/retained JavaScript heap, k-space workload, and estimated peak
  memory.

Regenerate only the plots from existing JSON reports with:

```bash
./bseq/benchmarking/generate_plots.sh
```

The plot generator accepts `--parser`, `--browser`, and `--output-dir` for
comparing deliberately named baseline reports.

The full `wave_test.bseq` remains prohibited. M1/PNS require a selected hardware
profile or user toggle and are not part of the default file-open path. A future
derived-calculation phase can benchmark them independently without conflating
them with ordinary loading.
