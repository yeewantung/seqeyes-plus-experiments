#!/usr/bin/env python3
"""Closed-form M1 reference cases for the SeqEyes abstract.

This file deliberately does not import SeqEyes. It evaluates the exact integral
of a linearly interpolated gradient segment about a fixed reference time using
Decimal arithmetic:

    M1 = integral((t - t_ref) * G(t), dt)

Gradient units are Hz/m, time is seconds, and M1 is s/m.
"""

from __future__ import annotations

from decimal import Decimal, getcontext
import json
from pathlib import Path
import sys

getcontext().prec = 50
D = Decimal


def linear_segment_moments(
    t0: Decimal,
    t1: Decimal,
    g0: Decimal,
    g1: Decimal,
    reference_time: Decimal,
) -> tuple[Decimal, Decimal]:
    """Return exact (M0, M1) for a linearly interpolated segment."""
    dt = t1 - t0
    dg = g1 - g0
    m0 = dt * (g0 + dg / D(2))
    m1 = (
        (t0 - reference_time) * dt * (g0 + dg / D(2))
        + dt * dt * (g0 / D(2) + dg / D(3))
    )
    return m0, m1


def close(actual: Decimal, expected: Decimal, tolerance: Decimal = D("1e-40")) -> None:
    if abs(actual - expected) > tolerance:
        raise AssertionError(f"actual={actual} expected={expected} error={actual - expected}")


Segment = tuple[Decimal, Decimal, Decimal, Decimal]


def segments_from_nodes(times: list[Decimal], values: list[Decimal]) -> list[Segment]:
    if len(times) != len(values) or len(times) < 2:
        raise ValueError("Piecewise-linear nodes must have matching time/value arrays")
    return [(times[i], times[i + 1], values[i], values[i + 1]) for i in range(len(times) - 1)]


def interpolate_segment(segment: Segment, time: Decimal) -> Decimal:
    t0, t1, g0, g1 = segment
    if t1 == t0:
        return g1
    return g0 + (g1 - g0) * (time - t0) / (t1 - t0)


def effective_moments_at(
    segments: list[Segment],
    end_time: Decimal,
    reference_time: Decimal = D(0),
    refocusing_times: tuple[Decimal, ...] = (),
) -> tuple[Decimal, Decimal, Decimal]:
    """Return effective (M0, M1_rfCenter, M1_observationTime)."""
    effective_m0 = D(0)
    effective_m1 = D(0)
    for segment in segments:
        t0, t1, _, _ = segment
        start = max(t0, reference_time)
        stop = min(t1, end_time)
        if stop <= start:
            continue
        split_points = [start]
        split_points.extend(flip for flip in refocusing_times if start < flip < stop)
        split_points.append(stop)
        for left, right in zip(split_points, split_points[1:]):
            sign = D(-1) if sum(flip <= left for flip in refocusing_times) % 2 else D(1)
            m0, m1 = linear_segment_moments(
                left,
                right,
                interpolate_segment(segment, left),
                interpolate_segment(segment, right),
                reference_time,
            )
            effective_m0 += sign * m0
            effective_m1 += sign * m1
    observation_m1 = effective_m1 - (end_time - reference_time) * effective_m0
    return effective_m0, effective_m1, observation_m1


def sampled_case(
    segments: list[Segment],
    end_time: Decimal,
    raster: Decimal,
    refocusing_times: tuple[Decimal, ...] = (),
) -> list[dict[str, str]]:
    return [
        {
            "timeSec": str(time),
            "m0_1_per_m": str(values[0]),
            "m1_rfCenter_s_per_m": str(values[1]),
            "m1_observationTime_s_per_m": str(values[2]),
        }
        for index in range(int(end_time / raster) + 1)
        for time in [raster * index]
        for values in [effective_moments_at(segments, time, D(0), refocusing_times)]
    ]


def main() -> None:
    raster = D("0.001")
    constant = segments_from_nodes([D(0), D("0.02")], [D(100), D(100)])
    ramp = segments_from_nodes([D(0), D("0.03")], [D(0), D(120)])
    bipolar = segments_from_nodes(
        [D(0), D("0.005"), D("0.01"), D("0.015"), D("0.02")],
        [D(0), D(100), D(0), D(-100), D(0)],
    )
    refocusing = segments_from_nodes([D(0), D("0.02")], [D(100), D(100)])

    definitions = {
        "constant_gradient": (constant, D("0.02"), ()),
        "linear_ramp": (ramp, D("0.03"), ()),
        "bipolar_gradient": (bipolar, D("0.02"), ()),
        "refocusing_sign_flip": (refocusing, D("0.02"), (D("0.01"),)),
    }
    expected_endpoints = {
        "constant_gradient": (D(2), D("0.02"), D("-0.02")),
        "linear_ramp": (D("1.8"), D("0.036"), D("-0.018")),
        "bipolar_gradient": (D(0), D("-0.005"), D("-0.005")),
        "refocusing_sign_flip": (D(0), D("-0.01"), D("-0.01")),
    }

    results: dict[str, dict] = {}
    for name, (segments, end_time, refocusing_times) in definitions.items():
        final = effective_moments_at(segments, end_time, D(0), refocusing_times)
        for actual, expected in zip(final, expected_endpoints[name]):
            close(actual, expected)
        results[name] = {
            "final_m0_1_per_m": str(final[0]),
            "final_m1_rfCenter_s_per_m": str(final[1]),
            "final_m1_observationTime_s_per_m": str(final[2]),
            "samples": sampled_case(segments, end_time, raster, refocusing_times),
        }

    # Independent hand-derived refocusing checkpoints audit both conventions.
    refocusing_table = {
        D("0.005"): (D("0.5"), D("0.00125"), D("-0.00125")),
        D("0.01"): (D(1), D("0.005"), D("-0.005")),
        D("0.015"): (D("0.5"), D("-0.00125"), D("-0.00875")),
        D("0.02"): (D(0), D("-0.01"), D("-0.01")),
    }
    for time, expected in refocusing_table.items():
        actual = effective_moments_at(refocusing, time, D(0), (D("0.01"),))
        for actual_value, expected_value in zip(actual, expected):
            close(actual_value, expected_value)

    # Metamorphic properties: amplitude x2 -> M1 x2; time x3 -> M1 x9.
    _, base = linear_segment_moments(D(0), D("0.02"), D(100), D(100), D(0))
    _, amp_scaled = linear_segment_moments(D(0), D("0.02"), D(200), D(200), D(0))
    _, time_scaled = linear_segment_moments(D(0), D("0.06"), D(100), D(100), D(0))
    close(amp_scaled, D(2) * base)
    close(time_scaled, D(9) * base)

    payload = json.dumps({
        "schemaVersion": 2,
        "rasterSec": str(raster),
        "conventions": ["rfCenter", "observationTime"],
        "cases": results,
        "metamorphic": {
            "base_m1_s_per_m": str(base),
            "amplitude_x2_m1_s_per_m": str(amp_scaled),
            "time_x3_m1_s_per_m": str(time_scaled),
        },
    }, indent=2, sort_keys=True) + "\n"
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
