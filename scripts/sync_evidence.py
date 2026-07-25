#!/usr/bin/env python3
"""Copy the reviewed evidence inputs used by the technical-report site."""

from __future__ import annotations

import hashlib
import csv
import json
import math
import shutil
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
WORKSPACE = REPOSITORY.parent
OUTPUT = REPOSITORY / "site" / "downloads"

COPY_MAP = {
    "benchmark/latest.json": "bseq/benchmark_results/latest.json",
    "benchmark/latest.md": "bseq/benchmark_results/latest.md",
    "benchmark/latest-browser.json": "bseq/benchmark_results/latest-browser.json",
    "benchmark/latest-browser.md": "bseq/benchmark_results/latest-browser.md",
    "benchmark/speedup-comparison.svg": "bseq/benchmark_results/speedup-comparison.svg",
    "benchmark/tooling-readme.md": "bseq/benchmarking/README.md",
    "benchmark/plan.md": "bseq/BSEQ_SEQ_BENCHMARK_PLAN.md",
    "benchmark/findings.md": "bseq/BSEQ_SEQ_BENCHMARK_FINDINGS.md",
    "protocols/e1-e8-frozen.md":
        "abstracts/experiments/public_protocols/seqeyes_plus_e1-e8_frozen_protocol.md",
    "protocols/eleven-sequence-reference.json":
        "abstracts/experiments/public_protocols/eleven_sequence_reference_protocol.json",
    "protocols/host-checkpoint-schema.md":
        "abstracts/experiments/public_protocols/host_checkpoint_schema.md",
    "results/e1-e8-summary.json":
        "abstracts/experiments/public_results/core/e1-e8_results_summary.json",
    "results/e1-e8-summary.md":
        "abstracts/experiments/public_results/core/e1-e8_results_summary.md",
    "results/e3-eleven-sequence-summary.json":
        "abstracts/experiments/public_results/core/e3_eleven_sequence_reference/summary.json",
    "results/e4-matlab.json":
        "abstracts/experiments/public_results/core/e4_matlab_inmemory_result.json",
    "results/e4-python-jupyter.json":
        "abstracts/experiments/public_results/core/e4_python_notebook_result.json",
    "results/e8-m1-reference.json":
        "abstracts/experiments/public_results/core/e8_m1_reference.json",
    "results/e8-m1-comparison.json":
        "abstracts/experiments/public_results/core/e8_m1_comparison.json",
    "scripts/parser-benchmark.cjs": "bseq/benchmarking/node/run_benchmark.cjs",
    "scripts/browser-benchmark.cjs":
        "bseq/benchmarking/browser/run_browser_benchmark.cjs",
    "scripts/benchmark-plots.cjs": "bseq/benchmarking/plots/generate_plots.cjs",
    "scripts/m1-analytic-reference.py":
        "abstracts/experiments/scripts/core/m1_analytic_reference.py",
    "scripts/m1-comparison.cjs":
        "abstracts/experiments/scripts/core/stage3_compare_m1.cjs",
    "scripts/pulseq-matlab-reference.m":
        "abstracts/experiments/scripts/core/export_pulseq_matlab_reference.m",
    "scripts/pypulseq-reference.py":
        "abstracts/experiments/scripts/core/export_pypulseq_reference.py",
    "scripts/seqeyes-checkpoints.cjs":
        "abstracts/experiments/scripts/core/export_seqeyes_checkpoints.cjs",
    "scripts/compare-seqeyes-pulseq.m":
        "abstracts/experiments/scripts/core/compare_seqeyes_to_pulseq_matlab.m",
    "scripts/compare-full-kspace.py":
        "abstracts/experiments/scripts/core/compare_full_kspace_arrays.py",
    "scripts/matlab-host-smoke.m":
        "abstracts/experiments/scripts/core/stage3_matlab_inmemory_smoke.m",
    "scripts/python-host-smoke.py":
        "abstracts/experiments/scripts/core/stage3_python_notebook_smoke.py",
}

EXCLUDED_CORE_CASE = "wave_test_R3x2"

TRANSFORM_MAP = {
    "protocols/figure2b-d-cross-tool.json":
        "abstracts/experiments/public_protocols/figure2b-d_37_sequence_cross_tool_protocol.json",
    "results/figure2b-c-data.csv":
        "abstracts/experiments/public_results/expanded_37_sequence/browser/"
        "figure2b-c_37_case_plot_data.csv",
    "results/figure2b-d-summary.json":
        "abstracts/experiments/public_results/expanded_37_sequence/cross_tool/"
        "derived/figure2b-d_37_case_summary.json",
    "results/figure2b-d-data.csv":
        "abstracts/experiments/public_results/expanded_37_sequence/cross_tool/"
        "derived/figure2b-d_37_case_plot_data.csv",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def filtered_csv(source: Path, destination: Path) -> None:
    with source.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        rows = [
            row
            for row in reader
            if row.get("sequence_id") != EXCLUDED_CORE_CASE
        ]
        fieldnames = list(reader.fieldnames or [])
    if "no_wave_fit_n" in fieldnames:
        rename = {
            "no_wave_fit_predicted_log10_ready": "official_fit_predicted_log10_ready",
            "no_wave_fit_predicted_seconds": "official_fit_predicted_seconds",
            "no_wave_fit_n": "official_fit_n",
            "no_wave_fit_slope": "official_fit_slope",
            "no_wave_fit_intercept": "official_fit_intercept",
            "no_wave_fit_r2": "official_fit_r2",
        }
        keep = [
            "sequence_id",
            "sequence_label",
            "category",
            "adc_samples",
            "median_ready_ms",
            "median_ready_seconds",
            "is_labelled",
            "log10_adc_samples",
            "log10_ready_seconds",
            *rename,
        ]
        rows = [
            {
                rename.get(column, column): row[column]
                for column in keep
            }
            for row in rows
        ]
        fieldnames = [rename.get(column, column) for column in keep]
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def geometric_mean(values: list[float]) -> float:
    return math.exp(sum(math.log(value) for value in values) / len(values))


def filtered_json(source: Path, destination: Path) -> None:
    payload = json.loads(source.read_text(encoding="utf-8"))
    if "fixtures" in payload:
        payload["fixtures"] = [
            item for item in payload["fixtures"]
            if item.get("id") != EXCLUDED_CORE_CASE
        ]
        payload["publicCohort"] = {
            "officialPulseqDerivedCases": 36,
            "excludedLocalStressCases": 1,
        }
    if "cases" in payload:
        payload["cases"] = [
            item for item in payload["cases"]
            if item.get("id") != EXCLUDED_CORE_CASE
        ]
        payload["sequenceCount"] = len(payload["cases"])
    if "unsupportedCases" in payload:
        payload["unsupportedCases"] = [
            item for item in payload["unsupportedCases"]
            if item.get("id") != EXCLUDED_CORE_CASE
        ]
    ratios = payload.get("perCaseMedianTimeRatiosVsSeqEyes")
    if isinstance(ratios, dict):
        for tool, values in ratios.items():
            ratios[tool] = [
                item for item in values if item.get("id") != EXCLUDED_CORE_CASE
            ]
        payload["geometricMeanMedianTimeRatioVsSeqEyes"] = {
            tool: geometric_mean([item["ratio"] for item in values])
            for tool, values in ratios.items()
        }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    entries = []
    for public_name, source_name in COPY_MAP.items():
        source = WORKSPACE / source_name
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = OUTPUT / public_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        entries.append(
            {
                "publicPath": destination.relative_to(REPOSITORY / "site").as_posix(),
                "sourcePath": source.relative_to(WORKSPACE).as_posix(),
                "sourceSha256": sha256(source),
                "bytes": destination.stat().st_size,
                "sha256": sha256(destination),
                "transformation": "verbatim copy",
            }
        )

    for public_name, source_name in TRANSFORM_MAP.items():
        source = WORKSPACE / source_name
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = OUTPUT / public_name
        if source.suffix == ".csv":
            filtered_csv(source, destination)
        else:
            filtered_json(source, destination)
        if EXCLUDED_CORE_CASE in destination.read_text(encoding="utf-8"):
            raise ValueError(f"Excluded core case remains in {destination}")
        entries.append(
            {
                "publicPath": destination.relative_to(REPOSITORY / "site").as_posix(),
                "sourcePath": source.relative_to(WORKSPACE).as_posix(),
                "sourceSha256": sha256(source),
                "bytes": destination.stat().st_size,
                "sha256": sha256(destination),
                "transformation": (
                    "Excluded the local stress case from the core public "
                    "Figure 2B-C/D cohort and recomputed affected aggregate ratios."
                ),
            }
        )

    manifest = {
        "schemaVersion": "1.0.0",
        "scope": "Files cited directly by the Markdown technical report",
        "files": entries,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Copied {len(entries)} evidence files and wrote site/downloads/manifest.json")


if __name__ == "__main__":
    main()
