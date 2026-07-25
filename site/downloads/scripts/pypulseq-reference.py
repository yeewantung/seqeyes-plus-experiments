#!/usr/bin/env python3
"""Export deterministic PyPulseq waveform/k-space checkpoints for Group B.

This reference tool imports PyPulseq but never imports SeqEyes. It accepts text
.seq files only; official binary validation is handled separately by the paired
format experiment.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import warnings

import numpy as np
from pypulseq import Opts, Sequence
import pypulseq


FROZEN_B0_TESLA = 3.0
RF_PHASE_MIN_RELATIVE_MAGNITUDE = 1e-6


def selected_indices(values: np.ndarray) -> list[int]:
    n = int(values.size)
    if n == 0:
        return []
    candidates = {0, (n - 1) // 2, n - 1}
    finite = np.flatnonzero(np.isfinite(values))
    if finite.size:
        candidates.add(int(finite[np.argmin(values[finite])]))
        candidates.add(int(finite[np.argmax(values[finite])]))
    return sorted(candidates)


def real_checkpoints(series: np.ndarray) -> list[dict[str, float | int]]:
    if series.shape[0] != 2:
        raise ValueError(f"Expected 2xN waveform, received {series.shape}")
    times = np.asarray(series[0]).real.astype(float)
    values = np.asarray(series[1], dtype=float)
    return [
        {"index": i, "timeSec": float(times[i]), "value": float(values[i])}
        for i in selected_indices(values)
    ]


def rf_checkpoints(series: np.ndarray) -> tuple[list[dict], list[dict], dict]:
    times = np.asarray(series[0]).real.astype(float)
    values = np.asarray(series[1], dtype=complex)
    magnitude = np.abs(values)
    phase = np.angle(values)
    indices = sorted(set(selected_indices(magnitude)) | set(selected_indices(phase)))
    mag = [{"index": i, "timeSec": float(times[i]), "value": float(magnitude[i])} for i in indices]
    threshold = RF_PHASE_MIN_RELATIVE_MAGNITUDE * float(np.max(magnitude, initial=0.0))
    eligible = np.flatnonzero(magnitude >= threshold)
    phase_indices: list[int] = []
    if eligible.size:
        local = sorted(
            set(selected_indices(magnitude[eligible]))
            | set(selected_indices(phase[eligible]))
        )
        phase_indices = [int(eligible[index]) for index in local]
    pha = [{"index": i, "timeSec": float(times[i]), "value": float(phase[i])} for i in phase_indices]
    selection = {
        "totalSampleCount": int(magnitude.size),
        "eligibleSampleCount": int(eligible.size),
        "excludedSampleCount": int(magnitude.size - eligible.size),
        "magnitudeThreshold": threshold,
    }
    return mag, pha, selection


def assert_frozen_b0(sequence: Sequence) -> None:
    explicit = sequence.definitions.get("B0")
    if explicit is None:
        return
    values = np.asarray(explicit, dtype=float).reshape(-1)
    if values.size != 1 or not np.isclose(values[0], FROZEN_B0_TESLA, rtol=0, atol=1e-12):
        raise ValueError(
            f"Fixture B0 must be absent or equal to the frozen {FROZEN_B0_TESLA:.1f} T field strength"
        )


def vec(values: np.ndarray, index: int) -> list[float]:
    return [float(values[axis, index]) for axis in range(3)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.input.suffix.lower() != ".seq":
        raise SystemExit("PyPulseq reference export accepts text .seq input only")

    source = args.input.read_bytes()
    sequence = Sequence(Opts(B0=FROZEN_B0_TESLA))
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        sequence.read(str(args.input), remove_duplicates=False)
    assert_frozen_b0(sequence)

    waveforms, _, _, adc_times, _ = sequence.waveforms_and_times(append_RF=True)
    if len(waveforms) != 4:
        raise RuntimeError(f"Expected Gx/Gy/Gz/RF waveforms, received {len(waveforms)}")
    rf_magnitude, rf_phase, rf_phase_selection = rf_checkpoints(np.asarray(waveforms[3]))
    k_adc, _, _, _, t_adc = sequence.calculate_kspace()
    duration_sec, block_count, event_counts = sequence.duration()
    n_adc = int(k_adc.shape[1])
    middle = (n_adc - 1) // 2 if n_adc else 0

    payload = {
        "schemaVersion": 1,
        "reference": "PyPulseq",
        "referenceVersion": getattr(pypulseq, "__version__", "unknown"),
        "inputPath": str(args.input),
        "inputSha256": hashlib.sha256(source).hexdigest(),
        "b0Tesla": FROZEN_B0_TESLA,
        "rfPhaseMinRelativeMagnitude": RF_PHASE_MIN_RELATIVE_MAGNITUDE,
        "rfPhaseSelection": rf_phase_selection,
        "warnings": [str(item.message) for item in captured],
        "sequence": {
            "durationSec": float(duration_sec),
            "blockCount": int(block_count),
            "eventCounts": [int(value) for value in np.asarray(event_counts).tolist()],
            "adcSampleCount": int(np.asarray(adc_times).size),
        },
        "checkpoints": {
            "selectionRule": "first-middle-last plus extrema, native PyPulseq arrays",
            "rfMagnitude": rf_magnitude,
            "rfPhaseRad": rf_phase,
            "gxHzPerM": real_checkpoints(np.asarray(waveforms[0])),
            "gyHzPerM": real_checkpoints(np.asarray(waveforms[1])),
            "gzHzPerM": real_checkpoints(np.asarray(waveforms[2])),
            "adcTimesSec": [
                {"index": i, "timeSec": float(adc_times[i])}
                for i in sorted({0, middle, max(0, n_adc - 1)}) if n_adc
            ],
        },
        "kspace": {
            "units": "1/m",
            "adcCount": n_adc,
            "first": vec(k_adc, 0) if n_adc else [0.0, 0.0, 0.0],
            "middle": vec(k_adc, middle) if n_adc else [0.0, 0.0, 0.0],
            "last": vec(k_adc, n_adc - 1) if n_adc else [0.0, 0.0, 0.0],
            "min": [float(np.nanmin(k_adc[axis])) for axis in range(3)] if n_adc else [0.0] * 3,
            "max": [float(np.nanmax(k_adc[axis])) for axis in range(3)] if n_adc else [0.0] * 3,
            "adcTimeFirstSec": float(t_adc[0]) if len(t_adc) else None,
            "adcTimeLastSec": float(t_adc[-1]) if len(t_adc) else None,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
