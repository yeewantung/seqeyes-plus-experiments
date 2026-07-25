# SeqEyes standalone browser `.seq` vs `.bseq` full-load benchmark

Generated: 2026-07-24T07:10:38.283Z

Browser state parity: **12/12 pairs passed**

Geometric-mean file-input-to-ready speedup: **1.031x**

Geometric-mean k-space speedup: **1.004x** (12/12 pairs)

Aggregate paired storage: SEQ **9.38 MiB**; BSEQ **6.30 MiB**; BSEQ saves **32.9%**.

## File storage

| Pair | SEQ size | BSEQ size | BSEQ/SEQ ratio | Storage saved |
|---|---:|---:|---:|---:|
| writeEpi | 50.4 KiB | 24.9 KiB | 0.494 | 50.6% |
| writeEpiRS | 129.1 KiB | 42.7 KiB | 0.330 | 67.0% |
| writeEpiSpinEchoRS | 133.2 KiB | 46.6 KiB | 0.350 | 65.0% |
| writeGradientEcho | 65.1 KiB | 43.3 KiB | 0.665 | 33.5% |
| writeHASTE | 73.2 KiB | 36.0 KiB | 0.493 | 50.7% |
| writeRadialGradientEcho | 119.3 KiB | 94.0 KiB | 0.788 | 21.2% |
| writeSpiral | 225.7 KiB | 77.2 KiB | 0.342 | 65.8% |
| writeTSE | 109.3 KiB | 74.6 KiB | 0.683 | 31.7% |
| writeTrufi | 39.4 KiB | 38.2 KiB | 0.969 | 3.1% |
| writeUTE | 52.4 KiB | 46.9 KiB | 0.895 | 10.5% |
| writeZTE_Petra | 5.49 MiB | 4.35 MiB | 0.792 | 20.8% |
| wave_test_R3x2 | 2.92 MiB | 1.43 MiB | 0.492 | 50.8% |

## Load performance

| Pair | Arb blocks | SEQ ready ms | BSEQ ready ms | Parse speedup | K-space SEQ ms | K-space BSEQ ms | K-space speedup | Residual SEQ ms | Residual BSEQ ms | Ready speedup | Parity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| writeEpi | 0 | 28.300 | 27.600 | 1.714x | 9.600 | 9.600 | 1.000x | 13.900 | 14.000 | 1.025x | PASS |
| writeEpiRS | 64 | 23.200 | 21.500 | 2.188x | 5.100 | 5.100 | 1.000x | 12.300 | 12.400 | 1.079x | PASS |
| writeEpiSpinEchoRS | 171 | 31.100 | 29.900 | 2.111x | 10.900 | 10.900 | 1.000x | 14.000 | 14.100 | 1.040x | PASS |
| writeGradientEcho | 0 | 47.200 | 46.000 | 1.500x | 18.300 | 18.700 | 0.979x | 19.700 | 19.600 | 1.026x | PASS |
| writeHASTE | 293 | 79.800 | 78.700 | 1.765x | 54.600 | 54.900 | 0.995x | 18.100 | 17.900 | 1.014x | PASS |
| writeRadialGradientEcho | 0 | 99.300 | 98.400 | 1.469x | 55.900 | 56.300 | 0.993x | 29.100 | 29.400 | 1.009x | PASS |
| writeSpiral | 88 | 432.700 | 431.100 | 2.389x | 385.000 | 384.300 | 1.002x | 38.000 | 37.700 | 1.004x | PASS |
| writeTSE | 1173 | 278.100 | 276.800 | 1.586x | 237.000 | 238.400 | 0.994x | 27.200 | 27.300 | 1.005x | PASS |
| writeTrufi | 515 | 58.100 | 57.200 | 1.318x | 26.800 | 26.400 | 1.015x | 23.400 | 23.600 | 1.016x | PASS |
| writeUTE | 0 | 81.800 | 80.400 | 1.364x | 46.400 | 46.500 | 0.998x | 26.300 | 26.400 | 1.017x | PASS |
| writeZTE_Petra | 22782 | 1110.500 | 1011.400 | 2.349x | 842.500 | 822.000 | 1.025x | 143.700 | 128.400 | 1.098x | PASS |
| wave_test_R3x2 | 12728 | 3075.100 | 2940.600 | 2.804x | 2729.800 | 2589.200 | 1.054x | 252.900 | 272.600 | 1.046x | PASS |

## wave_test_R3x2 resource breakdown

- K-space estimate: 9,250,001 raster samples, 6,428,672 ADC samples, and 15,774,320 grid candidates.
- Conservative peak-memory estimate: 2.54 GiB.
- Calculated result: 15,691,401 trajectory samples and 6,428,672 ADC samples.
- Median pre-GC JavaScript heap: SEQ 1.08 GiB; BSEQ 1.08 GiB.
- Median retained JavaScript heap after forced GC: SEQ 106.09 MiB; BSEQ 106.09 MiB.
- Median longest load task: SEQ 3072.000 ms; BSEQ 2938.000 ms.
- Median k-space panel opening: SEQ 1856.400 ms; BSEQ 1812.900 ms.

## wave_test_R3x2 CPU profile

### SEQ

| Function | Self time ms | Samples |
|---|---:|---:|
| interp | 965.805 | 752 |
| calculateKspace | 936.312 | 762 |
| (garbage collector) | 202.983 | 155 |
| physicalGradientPiece | 196.276 | 157 |
| sampleSeries | 179.970 | 145 |
| uploadKSpaceGPU | 139.500 | 118 |
| (program) | 75.107 | 53 |
| pushC | 60.867 | 49 |
| (anonymous) | 51.270 | 41 |
| downsampleWaveform | 48.217 | 39 |
| appendGradientPiece | 46.508 | 37 |
| decodeArb | 30.910 | 26 |
| includeOverviewGradient | 21.805 | 18 |
| (idle) | 12.704 | 10 |
| serializeGrad | 12.570 | 10 |

### BSEQ

| Function | Self time ms | Samples |
|---|---:|---:|
| interp | 823.144 | 660 |
| calculateKspace | 771.017 | 630 |
| (garbage collector) | 389.507 | 312 |
| physicalGradientPiece | 206.929 | 165 |
| sampleSeries | 189.388 | 153 |
| uploadKSpaceGPU | 100.226 | 84 |
| (program) | 68.542 | 48 |
| pushC | 63.779 | 52 |
| (anonymous) | 57.772 | 46 |
| appendGradientPiece | 48.863 | 39 |
| downsampleWaveform | 46.787 | 38 |
| decodeArb | 31.303 | 25 |
| includeOverviewGradient | 22.233 | 18 |
| serializeGrad | 13.598 | 11 |
| instrumentedPulseq.<computed> | 9.992 | 9 |

> The browser-ready metric includes local File.arrayBuffer transport, parsing, timing detection, block decoding, display serialization/overview construction, bounded k-space policy/calculation, and initial drawing. It excludes the progress overlay’s intentional 500 ms fade delay.

## Appended browser benchmark: `pypulseq_3dmrf`

The pair completed three fresh-page iterations per format and passed browser-state parity.

| Pair | SEQ ready ms | BSEQ ready ms | Browser parse speedup | Decode speedup | K-space speedup | Ready speedup | Parity |
|---|---:|---:|---:|---:|---:|---:|:---:|
| pypulseq_3dmrf | 2809.900 | 2650.400 | 1.350x | 1.068x | n/a | 1.060x | PASS |

- K-space was deliberately not calculated: the safety estimate was 85.8 million raster samples, 226.6 million ADC samples, 312.8 million grid candidates, and approximately **62.4 GiB** peak memory.
- Median retained JavaScript heap after forced garbage collection was approximately **825 MiB** for both formats.
- Updated aggregate after the append: **13/13 browser parity passed**, **1.033x** geometric-mean file-to-ready speedup, and **22.7%** aggregate BSEQ storage reduction.
- K-space remains a **12/13-pair** aggregate because `pypulseq_3dmrf` has no safe k-space measurement.

## Bounded 4D-flow browser attempt

A single fresh-page iteration per format was attempted without forcing k-space. The browser process terminated before it could produce a report, so no browser-ready, rendering, or k-space timing is reported. The failure occurred after the individual parsers had already succeeded and should be interpreted as full-viewer resource exhaustion, not as a parser-format failure.
