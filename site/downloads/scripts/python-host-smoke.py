#!/usr/bin/env python3
"""Validate the Python/Jupyter seq.plot() and binary-import workflows."""

from __future__ import annotations

import base64
import argparse
import json
from pathlib import Path
import sys


def parse_args() -> argparse.Namespace:
    default_workspace = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "output_path",
        nargs="?",
        default="/tmp/seqeyes-stage3-python-notebook.json",
    )
    parser.add_argument("--workspace-root", type=Path, default=default_workspace)
    parser.add_argument("--seq-path", type=Path)
    parser.add_argument("--bseq-path", type=Path)
    return parser.parse_args()


def main(args: argparse.Namespace) -> None:
    from IPython import display as ipy_display
    from pypulseq import Sequence

    import seqeyes
    from seqeyes import SeqEyesViewer

    workspace = args.workspace_root.resolve()
    fixture_root = workspace / "bseq/benchmark_data/demo_seq_pairs"
    seq_path = (args.seq_path or fixture_root / "writeGradientEcho_label.seq").resolve()
    bseq_path = (args.bseq_path or fixture_root / "writeGradientEcho_label.bseq").resolve()
    if not seq_path.is_file() or not bseq_path.is_file():
        raise FileNotFoundError(f"Smoke-test fixture pair not found: {seq_path}, {bseq_path}")

    sequence = Sequence()
    sequence.read(str(seq_path))
    captured: list[object] = []
    original_display = ipy_display.display
    ipy_display.display = lambda obj, *args, **kwargs: captured.append(obj)
    try:
        seqeyes.set(theme="system", time_disp="ms", grad_disp="Hz/m")
        sequence.plot()
    finally:
        seqeyes.reset()
        ipy_display.display = original_display

    if len(captured) != 1 or not isinstance(captured[0], SeqEyesViewer):
        raise AssertionError("seq.plot() did not publish exactly one SeqEyesViewer through IPython display")
    iframe = captured[0]._repr_html_()
    if not iframe.startswith("<iframe") or "data:text/html;base64," not in iframe:
        raise AssertionError("Jupyter display did not produce an inline iframe")
    encoded = iframe.split("data:text/html;base64,", 1)[1].split('"', 1)[0]
    embedded_html = base64.b64decode(encoded).decode("utf-8")
    if "SEQEYES_RAW_B64" not in embedded_html or "pulseq-bundle" not in embedded_html:
        raise AssertionError("Inline viewer payload is incomplete")

    binary_viewer = SeqEyesViewer.from_file(bseq_path)
    binary_html = binary_viewer.to_html(inject_bundle=False)
    if 'window.SEQEYES_SOURCE_KIND = "bytes";' not in binary_html:
        raise AssertionError("Binary workflow did not preserve byte input")

    payload = {
        "schemaVersion": 1,
        "experiment": "E4",
        "host": "python_jupyter_ipython_display",
        "pythonVersion": sys.version.split()[0],
        "seqeyesVersion": seqeyes.__version__,
        "inputModes": ["pypulseq.Sequence.plot", "SeqEyesViewer.from_file_bseq"],
        "fixtures": [str(seq_path), str(bseq_path)],
        "viewer": {
            "displayObjectPublished": True,
            "inlineIframeCreated": True,
            "embeddedViewerComplete": True,
            "binaryBytesEmbedded": True,
        },
        "pass": True,
    }
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(parse_args())
