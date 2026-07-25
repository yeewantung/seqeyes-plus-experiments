#!/usr/bin/env python3
"""Compare every SeqEyes/Pulseq MATLAB ADC k-space sample and plot error zooms."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


AXES = ("kx", "ky", "kz")
ABSOLUTE_THRESHOLDS = (1e-5, 2.5e-5, 1e-4, 2.5e-4)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_array(directory: Path, name: str, count: int) -> np.memmap:
    path = directory / name
    expected_bytes = count * np.dtype("<f8").itemsize
    if path.stat().st_size != expected_bytes:
        raise ValueError(
            f"{path} has {path.stat().st_size} bytes; expected {expected_bytes}"
        )
    return np.memmap(path, dtype="<f8", mode="r", shape=(count,))


def nearest_event(time_sec: float, events: list[float]) -> dict[str, Any] | None:
    if events is None:
        return None
    values = np.atleast_1d(np.asarray(events, dtype=float))
    if values.size == 0:
        return None
    index = int(np.argmin(np.abs(values - time_sec)))
    return {
        "timeSec": float(values[index]),
        "deltaSec": float(time_sec - values[index]),
    }


def contiguous_runs(mask: np.ndarray, times: np.ndarray) -> dict[str, Any]:
    padded = np.concatenate(([False], mask, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    starts = edges[0::2]
    ends = edges[1::2] - 1
    if starts.size == 0:
        return {"count": 0, "longestSamples": 0, "longest": None}
    lengths = ends - starts + 1
    longest_index = int(np.argmax(lengths))
    start = int(starts[longest_index])
    end = int(ends[longest_index])
    return {
        "count": int(starts.size),
        "longestSamples": int(lengths[longest_index]),
        "longest": {
            "startIndex": start,
            "endIndex": end,
            "startTimeSec": float(times[start]),
            "endTimeSec": float(times[end]),
        },
    }


def context_rows(
    index: int,
    times: np.ndarray,
    seqeyes: np.ndarray,
    matlab: np.ndarray,
    radius: int = 8,
) -> list[dict[str, Any]]:
    start = max(0, index - radius)
    end = min(len(times), index + radius + 1)
    return [
        {
            "index": item,
            "timeSec": float(times[item]),
            "seqeyesPerM": float(seqeyes[item]),
            "pulseqMatlabPerM": float(matlab[item]),
            "errorPerM": float(seqeyes[item] - matlab[item]),
        }
        for item in range(start, end)
    ]


def axis_metrics(
    name: str,
    seqeyes: np.ndarray,
    matlab: np.ndarray,
    times: np.ndarray,
    excitation_times: list[float],
    refocusing_times: list[float],
) -> tuple[dict[str, Any], np.ndarray]:
    error = np.asarray(seqeyes - matlab)
    absolute = np.abs(error)
    if not np.all(np.isfinite(absolute)):
        raise ValueError(f"Non-finite error in {name}")
    max_index = int(np.argmax(absolute))
    max_error = float(absolute[max_index])
    reference_scale = float(np.max(np.abs(matlab)))
    thresholds = {}
    for threshold in ABSOLUTE_THRESHOLDS:
        mask = absolute > threshold
        thresholds[f"{threshold:.1e}"] = {
            "count": int(np.count_nonzero(mask)),
            "fraction": float(np.mean(mask)),
            "runs": contiguous_runs(mask, times),
        }
    metrics = {
        "sampleCount": int(error.size),
        "maxAbsoluteErrorPerM": max_error,
        "maxErrorIndex": max_index,
        "maxErrorTimeSec": float(times[max_index]),
        "signedErrorAtMaximumPerM": float(error[max_index]),
        "seqeyesAtMaximumPerM": float(seqeyes[max_index]),
        "pulseqMatlabAtMaximumPerM": float(matlab[max_index]),
        "referenceMaximumMagnitudePerM": reference_scale,
        "maxErrorRelativeToReferenceScale": (
            max_error / reference_scale if reference_scale else None
        ),
        "meanAbsoluteErrorPerM": float(np.mean(absolute)),
        "rmsePerM": float(math.sqrt(np.mean(error * error))),
        "absoluteErrorQuantilesPerM": {
            "p50": float(np.quantile(absolute, 0.50)),
            "p95": float(np.quantile(absolute, 0.95)),
            "p99": float(np.quantile(absolute, 0.99)),
            "p99_9": float(np.quantile(absolute, 0.999)),
        },
        "nearestExcitationToMaximum": nearest_event(
            float(times[max_index]), excitation_times
        ),
        "nearestRefocusingToMaximum": nearest_event(
            float(times[max_index]), refocusing_times
        ),
        "thresholdExceedance": thresholds,
        "maximumContext": context_rows(max_index, times, seqeyes, matlab),
    }
    return metrics, error


def max_envelope(times: np.ndarray, values: np.ndarray, bins: int = 6000):
    if len(values) <= bins:
        return times, values
    edges = np.linspace(0, len(values), bins + 1, dtype=int)
    output_times = np.empty(bins)
    output_values = np.empty(bins)
    for index in range(bins):
        start, end = edges[index], edges[index + 1]
        local = values[start:end]
        local_index = int(np.argmax(local))
        output_times[index] = times[start + local_index]
        output_values[index] = local[local_index]
    return output_times, output_values


def render_plot(
    case_id: str,
    times: np.ndarray,
    arrays: dict[str, tuple[np.ndarray, np.ndarray]],
    errors: dict[str, np.ndarray],
    overall_axis: str,
    overall_index: int,
    output: Path,
) -> None:
    colors = {"kx": "#2a9d72", "ky": "#4e91c5", "kz": "#d96b27"}
    figure, axes = plt.subplots(2, 1, figsize=(10.5, 6.5), constrained_layout=True)
    for name in AXES:
        x, y = max_envelope(times, np.abs(errors[name]))
        axes[0].plot(x, y, linewidth=0.9, label=name, color=colors[name])
    axes[0].axhline(1e-5, color="#222222", linestyle="--", linewidth=0.9, label="1e-5 gate")
    axes[0].set_yscale("log")
    axes[0].set_xlabel("ADC time (s)")
    axes[0].set_ylabel("Absolute error (1/m)")
    axes[0].set_title(f"{case_id}: full-array ADC k-space error")
    axes[0].grid(True, which="both", alpha=0.2)
    axes[0].legend(ncol=4, fontsize=8)

    start = max(0, overall_index - 20)
    end = min(len(times), overall_index + 21)
    local_time = times[start:end]
    seqeyes, matlab = arrays[overall_axis]
    axes[1].plot(
        local_time,
        seqeyes[start:end],
        marker="o",
        markersize=2.5,
        linewidth=1,
        label=f"SeqEyes {overall_axis}",
        color="#2a9d72",
    )
    axes[1].plot(
        local_time,
        matlab[start:end],
        marker="x",
        markersize=3,
        linewidth=1,
        label=f"Pulseq MATLAB {overall_axis}",
        color="#4e91c5",
    )
    axes[1].set_xlabel("ADC time (s)")
    axes[1].set_ylabel("K-space coordinate (1/m)")
    axes[1].grid(True, alpha=0.2)
    error_axis = axes[1].twinx()
    error_axis.plot(
        local_time,
        errors[overall_axis][start:end],
        linewidth=1.1,
        label="Signed error",
        color="#d96b27",
    )
    error_axis.set_ylabel("SeqEyes − MATLAB (1/m)", color="#d96b27")
    lines = axes[1].get_lines() + error_axis.get_lines()
    axes[1].legend(lines, [line.get_label() for line in lines], fontsize=8)
    axes[1].set_title(
        f"Zoom around maximum error: {overall_axis}, sample {overall_index}"
    )
    figure.savefig(output, dpi=180)
    plt.close(figure)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("seqeyes_directory", type=Path)
    parser.add_argument("matlab_directory", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--plot", type=Path, required=True)
    args = parser.parse_args()

    seqeyes_metadata = json.loads(
        (args.seqeyes_directory / "metadata.json").read_text(encoding="utf-8")
    )
    matlab_metadata = json.loads(
        (args.matlab_directory / "metadata.json").read_text(encoding="utf-8")
    )
    if seqeyes_metadata["caseId"] != matlab_metadata["caseId"]:
        raise ValueError("Case ID mismatch")
    count = int(seqeyes_metadata["adcCount"])
    if count != int(matlab_metadata["adcCount"]):
        raise ValueError("ADC count mismatch")

    seqeyes_time = load_array(args.seqeyes_directory, "t_adc.f64le", count)
    matlab_time = load_array(args.matlab_directory, "t_adc.f64le", count)
    time_error = np.asarray(seqeyes_time - matlab_time)
    if not np.all(np.isfinite(time_error)):
        raise ValueError("Non-finite ADC time error")
    canonical_time = np.asarray(matlab_time)
    excitation_times = matlab_metadata.get("excitationTimesSec", [])
    refocusing_times = matlab_metadata.get("refocusingTimesSec", [])

    axis_results = {}
    arrays = {}
    errors = {}
    for name in AXES:
        seqeyes = load_array(args.seqeyes_directory, f"{name}.f64le", count)
        matlab = load_array(args.matlab_directory, f"{name}.f64le", count)
        result, error = axis_metrics(
            name,
            seqeyes,
            matlab,
            canonical_time,
            excitation_times,
            refocusing_times,
        )
        axis_results[name] = result
        arrays[name] = (seqeyes, matlab)
        errors[name] = error

    overall_axis = max(
        AXES, key=lambda name: axis_results[name]["maxAbsoluteErrorPerM"]
    )
    overall_index = axis_results[overall_axis]["maxErrorIndex"]
    vector_squared = sum(errors[name] * errors[name] for name in AXES)
    vector_error = np.sqrt(vector_squared)
    payload = {
        "schemaVersion": "1.0.0",
        "diagnostic": "Complete ADC k-space array comparison",
        "caseId": seqeyes_metadata["caseId"],
        "inputSha256": seqeyes_metadata["inputSha256"],
        "seqeyesEngineVersion": seqeyes_metadata.get("engineVersion"),
        "b0Tesla": seqeyes_metadata["b0Tesla"],
        "adcCount": count,
        "safetyCapsApplied": seqeyes_metadata["safetyCapsApplied"],
        "integrationRasterScale": seqeyes_metadata.get("integrationRasterScale", 1),
        "integrationRasterSec": seqeyes_metadata.get(
            "integrationRasterSec", seqeyes_metadata["gradientRasterSec"]
        ),
        "extendedGradientEndpointMode": seqeyes_metadata.get(
            "extendedGradientEndpointMode", "shape"
        ),
        "overriddenExtendedGradientWaveformCount": seqeyes_metadata.get(
            "overriddenExtendedGradientWaveformCount", 0
        ),
        "extendedGradientEndpointDiagnostic": seqeyes_metadata.get(
            "extendedGradientEndpointDiagnostic"
        ),
        "comparison": "SeqEyes-Plus minus official Pulseq MATLAB",
        "adcTime": {
            "maxAbsoluteErrorSec": float(np.max(np.abs(time_error))),
            "rmseSec": float(math.sqrt(np.mean(time_error * time_error))),
            "exactMatchCount": int(np.count_nonzero(time_error == 0)),
        },
        "axes": axis_results,
        "vectorError": {
            "maxEuclideanErrorPerM": float(np.max(vector_error)),
            "maxIndex": int(np.argmax(vector_error)),
            "rmseEuclideanPerM": float(math.sqrt(np.mean(vector_squared))),
            "quantilesPerM": {
                "p50": float(np.quantile(vector_error, 0.50)),
                "p95": float(np.quantile(vector_error, 0.95)),
                "p99": float(np.quantile(vector_error, 0.99)),
                "p99_9": float(np.quantile(vector_error, 0.999)),
            },
        },
        "overallMaximum": {
            "axis": overall_axis,
            **{
                key: axis_results[overall_axis][key]
                for key in (
                    "maxAbsoluteErrorPerM",
                    "maxErrorIndex",
                    "maxErrorTimeSec",
                    "signedErrorAtMaximumPerM",
                    "maxErrorRelativeToReferenceScale",
                    "nearestExcitationToMaximum",
                    "nearestRefocusingToMaximum",
                )
            },
        },
        "rawArrayHashes": {
            "seqeyes": {
                name: sha256(args.seqeyes_directory / filename)
                for name, filename in {
                    "kx": "kx.f64le",
                    "ky": "ky.f64le",
                    "kz": "kz.f64le",
                    "tAdc": "t_adc.f64le",
                    "metadata": "metadata.json",
                }.items()
            },
            "pulseqMatlab": {
                name: sha256(args.matlab_directory / filename)
                for name, filename in {
                    "kx": "kx.f64le",
                    "ky": "ky.f64le",
                    "kz": "kz.f64le",
                    "tAdc": "t_adc.f64le",
                    "metadata": "metadata.json",
                }.items()
            },
        },
        "temporaryRawArraysRetained": False,
        "plot": args.plot.name,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    args.plot.parent.mkdir(parents=True, exist_ok=True)
    render_plot(
        payload["caseId"],
        canonical_time,
        arrays,
        errors,
        overall_axis,
        overall_index,
        args.plot,
    )
    print(
        json.dumps(
            {
                "caseId": payload["caseId"],
                "adcCount": count,
                "overallMaximum": payload["overallMaximum"],
                "vectorError": payload["vectorError"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
