# SeqEyes Web `.seq` vs `.bseq` benchmark

Generated: 2026-07-24T07:07:56.019Z

Accuracy: **12/12 pairs passed**

Geometric-mean parser speedup (text median / binary median): **5.762x**

Aggregate paired storage: SEQ **9.38 MiB**; BSEQ **6.30 MiB**; BSEQ saves **32.9%**.

Aggregate BSEQ/SEQ size ratio: **0.671**

| Pair | Category | SEQ bytes | BSEQ bytes | Arb events | Arb blocks | Arb refs | SEQ parse ms | BSEQ parse ms | Speedup | Accuracy |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| writeEpi | demoSeq | 51653 | 25502 | 0 | 0 | 0 | 0.530 | 0.070 | 7.564x | PASS |
| writeEpiRS | demoSeq | 132167 | 43674 | 3 | 64 | 64 | 1.162 | 0.118 | 9.830x | PASS |
| writeEpiSpinEchoRS | demoSeq | 136363 | 47726 | 4 | 171 | 171 | 1.155 | 0.103 | 11.190x | PASS |
| writeGradientEcho | demoSeq | 66689 | 44338 | 0 | 0 | 0 | 0.762 | 0.180 | 4.238x | PASS |
| writeHASTE | demoSeq | 74922 | 36910 | 9 | 293 | 437 | 0.694 | 0.110 | 6.329x | PASS |
| writeRadialGradientEcho | demoSeq | 122142 | 96243 | 0 | 0 | 0 | 1.195 | 0.385 | 3.099x | PASS |
| writeSpiral | demoSeq | 231138 | 79031 | 8 | 88 | 176 | 1.920 | 0.126 | 15.274x | PASS |
| writeTSE | demoSeq | 111896 | 76420 | 9 | 1173 | 1717 | 1.140 | 0.248 | 4.607x | PASS |
| writeTrufi | demoSeq | 40381 | 39119 | 5 | 515 | 1028 | 0.495 | 0.163 | 3.036x | PASS |
| writeUTE | demoSeq | 53680 | 48031 | 0 | 0 | 0 | 0.579 | 0.167 | 3.471x | PASS |
| writeZTE_Petra | demoSeq | 5757607 | 4559988 | 67067 | 22782 | 68274 | 65.813 | 20.827 | 3.160x | PASS |
| wave_test_R3x2 | extreme-arbitrary-gradient | 3059434 | 1504068 | 566 | 12728 | 31820 | 35.512 | 4.302 | 8.254x | PASS |

> Performance values are reporting-first. Warm filesystem acquisition and preloaded-byte parsing are reported separately; this run does not measure browser rendering or k-space.

## Appended benchmark: `pypulseq_3dmrf`

This pair was benchmarked separately with the same 3-warm-up/15-measured-iteration parser protocol and then appended to the JSON report.

| Pair | SEQ size | BSEQ size | Blocks | Arb blocks | SEQ parse ms | BSEQ parse ms | Speedup | Accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| pypulseq_3dmrf | 7.12 MiB | 6.47 MiB | 156447 | 30240 | 586.113 | 515.919 | 1.136x | PASS |

- BSEQ storage reduction: **9.2%**.
- Total duration agrees exactly at **857.71248 s**.
- Updated aggregate after the append: **13/13 accuracy passed**, **5.085x** geometric-mean parser speedup, and **22.7%** aggregate BSEQ storage reduction.

## Bounded 4D-flow parser attempt

The normal paired accuracy runner did not complete because retaining both parsed formats and decoded comparison state exceeded the available process resources. Each format was therefore parsed once in an isolated Node process with no block decoding or k-space calculation:

| Format | File size | Read ms | Parse ms | RSS after parse | Blocks | Arb-gradient events |
|---|---:|---:|---:|---:|---:|---:|
| SEQ | 458.68 MiB | 52.028 | 4783.322 | 1.46 GiB | 512768 | 179648 |
| BSEQ | 168.04 MiB | 18.018 | 570.294 | 805.36 MiB | 512768 | 179648 |

- Isolated parser speedup: **8.387x** in favor of BSEQ.
- BSEQ storage reduction: **63.4%**.
- Both parsers reported the same core structure: 512768 blocks, 24 RF events, 179648 arbitrary-gradient events, 87507 trapezoids, 24 ADC events, and 179651 shapes.
- These isolated measurements are diagnostic single samples and are not included in the 13-pair aggregate.
