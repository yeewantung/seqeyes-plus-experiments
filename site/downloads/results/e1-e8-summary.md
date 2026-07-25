# SeqEyes abstract E1–E8 evidence results

Status: experiments complete; all frozen E3 and E8 reference-accuracy gates passed.

## Principal results

- E1 paired `.seq`/`.bseq` structural and numerical gate: **24/24 passed**.
- E2 production Chromium state/canvas parity: **24/24 passed**.
- E4 representative workflow invocation: **4/4 environments passed** (Web, VS Code, MATLAB in-memory `seqeyes(seq)`, and Python/IPython `seq.plot()`); this is capability validation.
- E6 reduced Wave-MPRAGE `.bseq`: 12,839 blocks and 6,428,672 ADC samples; input-to-ready median **2.909 s** (IQR 0.262 s), k-space calculation median **2.544 s** (IQR 0.090 s), and panel opening median **1.549 s** (IQR 0.016 s), five runs.
- E7 binary parsing: geometric-mean speedup **5.194×**, median paired speedup **4.583×**, and aggregate storage reduction **41.0%**. End-to-end readiness was only 1.021× and must not be conflated with parser speed.

## Reference-accuracy validation

- E3 gradients, RF magnitude, eligible RF phase, and k-space passed 4/4 frozen cases against Pulseq MATLAB at explicit 3 T. EPI-RS maximum k-space error was **2.689e-11 1/m**.
- E5 independent cross-host numerical consistency is not reportable because every wrapper does not expose the canonical checkpoint artifact. Identical/shared engine assets support architectural consistency only.
- E8 M1 passed 4/4 analytic cases in both RF-center and observation-time conventions, including continuous bipolar and refocusing fixtures.

## Abstract selection

Use E1, E2, E3, E4, E6, E7, and E8 as space permits. Exclude full Wave, E9 FPS, and independent E5 numerical agreement.
