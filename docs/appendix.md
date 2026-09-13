# Appendix

Material a reader consults rather than reads: what was measured on, how to
repeat it, what is deliberately not claimed, and the findings that belong on
record without belonging in the results.

## Sequence sets

Three sets, drawn from one source. Every experiment names the set it used, so a
denominator is never ambiguous.

**The official set** is 36 paired `.seq` and `.bseq` files, each written from the
same in-memory sequence object by a Pulseq MATLAB demo script. Every file is
bound by SHA-256 in the evidence manifest; all 74 verify.

**The reference subset** is eleven of those 36, chosen to span Cartesian and
non-Cartesian, labelled, rotated, single-shot and multi-echo acquisition: EPI,
EPI-RS, labelled GRE, 3D radial GRE, spiral, UTE, EPI spin echo RS, HASTE,
Trufi, TSE, ZTE PETRA. It is used where an experiment needs a licensed tool or
several minutes per case.

**The large group** carries the size range: `writeZTE_Petra_sodium` (11.7 MB),
`writeZTE_Petra` (5.8 MB) and `writeGradientEcho3D` (809 KB) from the official
set, plus `pypulseq_3dmrf`, `wave_test_R3x2`, and a 458.7 MiB production 4D-flow
acquisition. Three of the six are official files, so most of the large-sequence
evidence rests on distributable, hash-bound inputs.

Two fixtures are measured but excluded from every denominator.
`wave_test_R3x2` is not an official Pulseq-derived file. The 4D-flow
acquisition is a production sequence and is not distributed - it is too large
for a repository, and its k-space is not calculated at all: the estimated cost
is far above the viewer's 1 GiB interactive safety ceiling, which was left
untouched for the experiments.

## Reproduction

The experiments run against a built plugin checkout. Clone
`bughht/seqeyes_plugin` at the commit a result records, then:

```bash
npm run compile      # cleans out/, then builds the esbuild bundles
npx tsc -p ./        # emits the module tree the runners import
npm run build:web    # standalone web bundles
```

The order matters and reversed silently produces nothing: since v0.3.8 the
extension build clears `out/` before writing, so running `tsc` first deletes
exactly the modules the runners need. Verify by requiring one of them rather
than by trusting the command sequence.

MATLAB experiments need a licensed R2024b and an official Pulseq MATLAB
checkout, located by argument or by `PULSEQ_MATLAB_PATH`. They are not ordinary
hosted CI and should not be described as such.

One thing a reader will meet: k-space calculation runs synchronously on the VS
Code extension host and takes several seconds on a large sequence, which trips
the editor's unresponsiveness watchdog. The calculation completes.

## Text versus binary fidelity

The `.seq` and `.bseq` members of a pair produce k-space trajectories differing
by up to **2.8e-3 1/m**, about 2e-5 of the trajectory extent. Per sequence:

| Sequence | Difference (1/m) | | Sequence | Difference (1/m) |
|---|---:|---|---|---:|
| Trufi | 2.782e-3 | | TSE | 7.100e-4 |
| 3D radial GRE | 2.361e-3 | | Spiral | 6.800e-4 |
| EPI spin echo RS | 1.874e-3 | | Labelled GRE | 5.477e-4 |
| EPI | 1.820e-3 | | UTE | 2.206e-4 |
| EPI-RS | 1.500e-3 | | ZTE PETRA | 1.768e-4 |
| HASTE | 7.887e-4 | | | |

### What is measured

1. Both files are written from **one in-memory sequence object** by
   `gen_seq_file.m`, which runs each Pulseq demo and writes the result through
   both `write()` and `writeBinary()`. No conversion step sits between them.
2. The difference is already in the **decoded gradients**, before any
   integration. For Trufi, 4,610 of 7,703 gradient samples differ, by at most
   5.0 Hz/m against a 1.28 MHz/m peak - inside the frozen gradient limit - with
   sample times identical to the bit.
3. The text stores shapes **run-length compressed** at about nine significant
   digits: one shape declares 600 samples in 396 stored lines.
4. The binary writer stores **float64** with no quantization.
5. The binary's distance from Pulseq MATLAB **equals** its distance from the
   text, case for case, while the text agrees with MATLAB to about 1e-9 1/m.

### Hypothesis

Text decimal rounding, accumulated through run-length decompression, is what
makes the two files differ - which would mean the binary file is the more
faithful record of the sequence object and the text file is the lossy one.

It fits every measurement, and point 5 is what points at it: a difference living
in the text would be shared by every reader of the text and absent only from the
binary, which is the pattern observed. It also explains why E3 never sees it -
SeqEyes-Plus and Pulseq MATLAB both read the same `.seq` and inherit the same
rounding.

It is **not established**. Two things would settle it, neither done: decompress
the text's stored shape values independently and compare them against the
binary's stored samples at file level; and confirm that the two decompressors
agree bit for bit on the same compressed input, ruling out a decoder difference
that would produce the same signature.

## A defect these experiments found

At v0.3.6 the VS Code lane refused waveform detail for any window spanning more
than 20,000 blocks, before choosing how to draw it. The standalone lane had no
such limit - the constant was not even exported to its bundle.

Only one of the three possible replies carries a per-block payload. The limit
was tested before that branch, so it also refused replies whose size does not
depend on block count. Sample count, which does govern cost, is not monotonic in
blocks: one sequence was allowed at 179 blocks and 950,224 samples while another
was refused at 24,876 blocks and 132,272.

The limit dated from the earliest VS Code work, before hierarchy rendering
existed, when downsampling was the only way to make the extension usable. The
constraint it encoded no longer applied. It was moved inside the branch it
protects and both lanes were given one shared dispatch; released as v0.3.7.

Two corrections to how this was first reported, from the session that fixed it.
It was not reachable through the interface at a whole-sequence view, because the
dense overview is active there and neither lane requests detail - the divergence
was reachable through the API and through a narrower interaction case. And the
fix changed both lanes, not only VS Code: the standalone lane gained the ceiling
on its samples path, unreachable across the official set but now shared by
decision rather than absent.

## Two experiments planned and not run

**E5 — cross-host numerical equivalence.** An experiment was planned to compare
one canonical numerical checkpoint from all four host wrappers. The wrappers do
not all export that artifact, and adding it was not attempted. Shared code is
architectural consistency, not an independent cross-host numerical result, and
no such result is reported.

**E12 — k-space view geometry.** The plugin's browser suite already asserts that
rotation pivots on the origin regardless of panning, that panning tracks the
cursor within a pixel, and that the settled cloud contains every uploaded point.
The one remaining claim - that autofit brings the whole trajectory into frame -
was measured directly and had nothing to report.

## The suite that runs on every change

The experiments in the results are an audit: they ask whether the software is
right, by comparing it against implementations that are not SeqEyes-Plus, and
they take hours and a licensed MATLAB to run. Underneath them is a test suite
that asks whether a change broke something, by comparing the software against
its own past behaviour, and runs in minutes on every commit with nothing beyond
the repository.

It covers the parser, decoder, k-space, M1 and PNS, the gradient spectrogram, RF
response and the display transport as unit tests; the standalone viewer,
spectrogram panel and VS Code webview under Chromium; the extension host end to
end; the packaged VSIX; and the Python renderer. It excludes licensed MATLAB
runtime work and long benchmarks, which do not belong in a pull-request gate.

## Version history

The plugin moved during this work, and each result records the build that
produced it.

| Version | What changed | Effect on results |
|---|---|---|
| 0.3.4 | the pin when Phase 0 froze | superseded before any measurement |
| 0.3.6 | k-space render performance, rotation centre | E1, E2, E7, E8, Figure 2B-C measured here |
| 0.3.7 | the detail dispatch fix these experiments found | E9, E10, E11 measured here; E11 re-run because the fix changed its subject |
| 0.3.8 | VS Code k-space delivery | E3, E4, Figure 2B-D measured here; nothing earlier affected, since no file under `src/pulseq` changed |

E11 was re-measured rather than edited. Every value was identical across the two
versions; only the route by which oversized windows decline changed.

Stated forward, the mixed versions are the record of a test suite finding a
defect, the defect being fixed, and the experiment being re-run to confirm.

## Scope of the claims

- Timings describe one Apple M3 Pro and the recorded software versions.
- Parser speedup is not viewer speedup: both formats share everything after
  parsing.
- Browser parity is a state and canvas comparison, not a pixel comparison.
- Figure 2B-C's fit is descriptive. ADC count is not a complete workload model.
- E4 establishes that each host can invoke inspection and reach a ready viewer,
  not that the hosts agree numerically.
- Mobile results are emulated viewports, not a physical device.
- PyPulseq 1.5.0.post1 cannot read four extension-bearing sequences in the
  cross-tool set; they are reported as failures rather than dropped.
- SAFE-based PNS estimation is advisory and was not externally validated here.
- M1 validation establishes the implemented mathematical convention, not a
  complete physical signal-pathway model.

## License and attribution

Original code and documentation in this repository are under the MIT License.
That does not relicense Pulseq, PyPulseq, MATLAB, or other third-party material,
each of which retains its own terms. Sequence fixtures are not redistributed
here; the official examples are regenerated from a pinned upstream commit and
verified by hash.

SeqEyes-Plus extends the SeqEyes lineage and was designed from experience with
SeqEyes Qt. The Qt work is unpublished and is not distributed by this report.
