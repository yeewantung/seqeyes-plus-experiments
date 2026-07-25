# Host-neutral SeqEyes checkpoint schema

## Purpose

This schema defines the numerical state collected from standalone Web, VS Code, MATLAB, and Python/Jupyter for each representative sequence subset input. It compares scientific content rather than screenshots or host-specific UI layout.

All hosts use the shared browser engine. Each host must expose or download the same canonical JSON artifact after the viewer reaches ready state. Host wrappers may transport the artifact differently, but they must not independently recalculate its fields.

## Canonical artifact

```json
{
  "schemaVersion": 1,
  "caseId": "writeSpiral",
  "inputFormat": "seq",
  "inputSha256": "...",
  "host": "web|vscode|matlab|python_jupyter",
  "hostVersion": "...",
  "engineVersion": "0.2.8",
  "engineBundleSha256": "...",
  "b0Tesla": 3.0,
  "rfPhaseMinRelativeMagnitude": 0.000001,
  "sequence": {
    "pulseqVersion": "1.5.1",
    "durationSec": 0.0,
    "blockCount": 0,
    "adcEventCount": 0,
    "adcSampleCount": 0
  },
  "checkpoints": {
    "selectionRule": "first-middle-last native samples per non-empty channel plus all extrema indices",
    "rfMagnitude": [{ "index": 0, "timeSec": 0.0, "value": 0.0 }],
    "rfPhaseRad": [{ "index": 0, "timeSec": 0.0, "value": 0.0 }],
    "gxHzPerM": [{ "index": 0, "timeSec": 0.0, "value": 0.0 }],
    "gyHzPerM": [{ "index": 0, "timeSec": 0.0, "value": 0.0 }],
    "gzHzPerM": [{ "index": 0, "timeSec": 0.0, "value": 0.0 }],
    "adcTimesSec": [{ "index": 0, "timeSec": 0.0 }]
  },
  "kspace": {
    "units": "1/m",
    "adcCount": 0,
    "first": [0.0, 0.0, 0.0],
    "middle": [0.0, 0.0, 0.0],
    "last": [0.0, 0.0, 0.0],
    "min": [0.0, 0.0, 0.0],
    "max": [0.0, 0.0, 0.0]
  },
  "viewer": {
    "ready": true,
    "waveformCanvasNonEmpty": true,
    "kspacePanelOpened": true,
    "fatalErrors": []
  }
}
```

## Deterministic checkpoint selection

For every non-empty native channel array, include:

1. first sample;
2. middle sample at `floor((n-1)/2)`;
3. last sample;
4. global minimum sample;
5. global maximum sample.

Deduplicate repeated indices and preserve ascending index order. Store native indices, seconds, and canonical units. Do not select checkpoints from display-downsampled arrays.

ADC timing uses the first, middle, and last ADC samples plus total count. K-space uses the corresponding ADC trajectory coordinates and per-axis bounds.

## Pass rules

- input hash, block count, ADC event/sample counts, checkpoint indices, and array lengths: exact;
- duration and checkpoint times: absolute difference ≤ `1e-9 s`;
- gradient values: absolute difference ≤ `max(1e-9, 5e-6 × reference maximum magnitude)`;
- RF magnitude: absolute difference < `1e-3`;
- RF phase: wrapped angular difference < `1e-3 rad`, evaluated only where complex RF magnitude is at least `1e-6` of the sequence-wide RF peak;
- k-space coordinates/bounds: maximum absolute difference ≤ `1e-5 1/m`;
- viewer readiness/functionality fields: all required booleans true and no fatal errors.

The comparison report must retain every failure. A shared engine-bundle hash supports provenance but does not replace numerical checkpoint comparison.

All formal hosts and independent references use `B0 = 3.0 T`. A fixture with an explicit conflicting B0 fails preflight; a fixture without B0 uses the frozen 3.0 T value. Every exported artifact records `b0Tesla` and the RF-phase magnitude threshold.

## Reference export decision

- Primary waveform reference: a simple batch script using the official Pulseq MATLAB reader and waveform APIs.
- Secondary waveform cross-check: PyPulseq 1.5.0.post1.
- K-space reference: the committed SeqEyes Qt trajectory baselines for GRE and spiral, supplemented by Pulseq/PyPulseq for representative sequence subset where practical.

The Qt manuscript's validation procedure is useful methodological guidance, but the Qt application should not be the only waveform reference because it also depends on the official Pulseq reader. Numerical Pulseq exports are simpler and more independent than screenshots.

## M1 decision

No external M1 package is required. Validate the exact SeqEyes M1 path against analytic constant-gradient, bipolar-gradient, and RF reset/refocusing cases implemented in a standalone NumPy or MATLAB script that does not import SeqEyes. This establishes the numerical integral and sign/reset conventions.

M1 availability remains a Methods capability. M1 accuracy enters the abstract Results only if these analytic comparisons are completed and concise enough to report. A full independent reimplementation on complex sequences is optional, not required for the abstract.
