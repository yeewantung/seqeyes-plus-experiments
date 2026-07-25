#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { calculateM1 } = require(path.resolve(
  __dirname, '..', '..', '..', '..', 'seqeyes_plugin', 'out', 'pulseq', 'm1.js'
));

const referencePath = path.resolve(process.argv[2] || 'abstracts/experiments/results/core/stage3_e8_m1_reference.json');
const outputPath = path.resolve(process.argv[3] || 'abstracts/experiments/results/core/stage3_e8_m1_comparison.json');
const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const raster = Number(reference.rasterSec);

function gradient(channel, times, values) {
  return { blockIndex: 1, startTime: times[0], duration: times.at(-1) - times[0], timePoints: Float64Array.from(times), waveform: Float64Array.from(values), amplitude: Math.max(...values.map(Math.abs)), type: 'trap', channel };
}
function zero(channel, start, duration) { return gradient(channel, [start, start + duration], [0, 0]); }
function rf(centerTime, use) {
  return { blockIndex: 1, startTime: centerTime, centerTime, duration: 0, timePoints: Float64Array.of(centerTime), magnitude: Float64Array.of(1), phase: Float64Array.of(0), amplitude: 1, freqOffset: 0, phaseOffset: 0, use };
}
function block(index, start, duration, gx, event) {
  return { index, startTime: start, duration, gx: gx || zero('gx', start, duration), gy: zero('gy', start, duration), gz: zero('gz', start, duration), ...(event ? { rf: event } : {}) };
}

const cases = {
  constant_gradient: [block(1, 0, .02, gradient('gx', [0, .02], [100, 100]))],
  linear_ramp: [block(1, 0, .03, gradient('gx', [0, .03], [0, 120]))],
  bipolar_gradient: [block(1, 0, .02, gradient('gx', [0, .005, .01, .015, .02], [0, 100, 0, -100, 0]))],
  refocusing_sign_flip: [
    block(1, 0, .01, gradient('gx', [0, .01], [100, 100]), rf(0, 'e')),
    block(2, .01, .01, gradient('gx', [.01, .02], [100, 100]), rf(.01, 'r')),
  ],
};

const reports = {};
for (const [name, blocks] of Object.entries(cases)) {
  const expected = reference.cases[name].samples;
  const modes = {};
  for (const referenceMode of ['rfCenter', 'observationTime']) {
    const actual = calculateM1(blocks, raster, { referenceMode });
    const expectedField = referenceMode === 'rfCenter'
      ? 'm1_rfCenter_s_per_m'
      : 'm1_observationTime_s_per_m';
    const errors = [];
    const points = [];
    for (const item of expected) {
      const target = Number(item.timeSec);
      let index = -1;
      for (let i = 0; i < actual.tSec.length; i++) {
        if (Math.abs(actual.tSec[i] - target) <= 1e-12) index = i;
      }
      if (index < 0) throw new Error(`${name}/${referenceMode}: missing shared time ${target}`);
      const expectedValue = Number(item[expectedField]);
      const observedValue = actual.m1x[index];
      const error = observedValue - expectedValue;
      errors.push(error);
      points.push({ timeSec: target, expected_s_per_m: expectedValue, observed_s_per_m: observedValue, error_s_per_m: error });
    }
    const maxReference = Math.max(...points.map(item => Math.abs(item.expected_s_per_m)));
    const tolerance = 1e-9 + 1e-8 * maxReference;
    const maxAbsoluteError = Math.max(...errors.map(Math.abs));
    modes[referenceMode] = {
      valid: actual.valid,
      referenceMode: actual.referenceMode,
      sampleCount: points.length,
      maxAbsoluteError_s_per_m: maxAbsoluteError,
      rmse_s_per_m: Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length),
      tolerance_s_per_m: tolerance,
      pass: actual.valid && actual.referenceMode === referenceMode && maxAbsoluteError <= tolerance,
      points,
    };
  }
  const modeReports = Object.values(modes);
  reports[name] = {
    pass: modeReports.every(report => report.pass),
    maxAbsoluteError_s_per_m: Math.max(...modeReports.map(report => report.maxAbsoluteError_s_per_m)),
    rmse_s_per_m: Math.max(...modeReports.map(report => report.rmse_s_per_m)),
    tolerance_s_per_m: Math.max(...modeReports.map(report => report.tolerance_s_per_m)),
    modes,
  };
}

const payload = {
  schemaVersion: 2,
  experiment: 'E8',
  reference: referencePath,
  units: { time: 's', gradient: 'Hz/m', m0: '1/m', m1: 's/m' },
  conventions: ['rfCenter', 'observationTime'],
  cases: reports,
  pass: Object.values(reports).every(report => report.pass),
};
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n');
console.log(outputPath);
