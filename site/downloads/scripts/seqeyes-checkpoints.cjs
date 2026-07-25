#!/usr/bin/env node
/* Export canonical host-neutral checkpoints from the shared SeqEyes engine. */
'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { dirname, extname, resolve } = require('node:path');

const workspace = resolve(__dirname, '..', '..', '..', '..');
const plugin = resolve(workspace, 'seqeyes_plugin');
const { parseSequenceBytes } = require(resolve(plugin, 'out/pulseq/sequenceReader.js'));
const { decodeAllBlocks, getTotalDuration } = require(resolve(plugin, 'out/pulseq/decoder.js'));
const { calculateKspace } = require(resolve(plugin, 'out/pulseq/kspace.js'));
const packageVersion = require(resolve(plugin, 'package.json')).version;
const FROZEN_B0_TESLA = 3.0;
const RF_PHASE_MIN_RELATIVE_MAGNITUDE = 1e-6;

function selectedIndices(values) {
  if (!values.length) return [];
  const indices = new Set([0, Math.floor((values.length - 1) / 2), values.length - 1]);
  let min = Infinity, max = -Infinity, minIndex = 0, maxIndex = 0;
  values.forEach((value, index) => {
    if (Number.isFinite(value) && value < min) { min = value; minIndex = index; }
    if (Number.isFinite(value) && value > max) { max = value; maxIndex = index; }
  });
  indices.add(minIndex); indices.add(maxIndex);
  return [...indices].sort((a, b) => a - b);
}

function checkpoints(times, values) {
  return selectedIndices(values).map(index => ({ index, timeSec: times[index], value: values[index] }));
}

function rfPhaseCheckpoints(times, values, magnitudes) {
  const peak = magnitudes.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const threshold = RF_PHASE_MIN_RELATIVE_MAGNITUDE * peak;
  const eligible = values.map((_, index) => index).filter(index => Math.abs(magnitudes[index] ?? 0) >= threshold);
  const eligibleValues = eligible.map(index => values[index]);
  const points = selectedIndices(eligibleValues).map(localIndex => {
    const index = eligible[localIndex];
    return { index, timeSec: times[index], value: values[index] };
  });
  return {
    points,
    totalSampleCount: values.length,
    eligibleSampleCount: eligible.length,
    excludedSampleCount: values.length - eligible.length,
    magnitudeThreshold: threshold,
  };
}

function assertFrozenB0(sequence) {
  const raw = sequence.definitions.get('B0')
    ?? sequence.definitions.get('b0')
    ?? sequence.definitions.get('b_0');
  if (raw === undefined) return;
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length !== 1 || Math.abs(Number(values[0]) - FROZEN_B0_TESLA) > 1e-12) {
    throw new Error(`Fixture B0 must be absent or equal to the frozen ${FROZEN_B0_TESLA.toFixed(1)} T field strength`);
  }
}

function appendSeries(targetTimes, targetValues, waveform, field) {
  if (!waveform) return;
  for (let index = 0; index < waveform.timePoints.length; index++) {
    targetTimes.push(waveform.timePoints[index]);
    targetValues.push(waveform[field][index]);
  }
}

function axisBounds(series) {
  let min = Infinity, max = -Infinity;
  for (const value of series) if (Number.isFinite(value)) { if (value < min) min = value; if (value > max) max = value; }
  return [min, max];
}

function vector(kspace, index) {
  return [kspace.ktraj_adc[0][index], kspace.ktraj_adc[1][index], kspace.ktraj_adc[2][index]];
}

function main() {
  const [inputArg, outputArg, host = 'core'] = process.argv.slice(2);
  if (!inputArg || !outputArg) throw new Error('Usage: export_seqeyes_checkpoints.cjs INPUT.seq|bseq OUTPUT.json [host]');
  const input = resolve(inputArg), output = resolve(outputArg);
  if (!['.seq', '.bseq'].includes(extname(input).toLowerCase())) throw new Error('Input must be .seq or .bseq');
  const bytes = readFileSync(input);
  const sequence = parseSequenceBytes(bytes, input);
  assertFrozenB0(sequence);
  const blocks = decodeAllBlocks(sequence);
  const totalDuration = getTotalDuration(sequence);
  const kspace = calculateKspace(blocks, sequence.rasterTimes.gradientRaster, totalDuration, 0, {
    rfRaster: sequence.rasterTimes.rfRaster,
    gradientSupport: 'all',
  });
  if (!kspace) throw new Error('K-space calculation failed');

  const channels = {
    rfMagnitude: [[], []], rfPhaseRad: [[], []],
    gxHzPerM: [[], []], gyHzPerM: [[], []], gzHzPerM: [[], []],
  };
  let adcEventCount = 0, adcSampleCount = 0;
  const adcTimes = [];
  for (const block of blocks) {
    appendSeries(channels.rfMagnitude[0], channels.rfMagnitude[1], block.rf, 'magnitude');
    appendSeries(channels.rfPhaseRad[0], channels.rfPhaseRad[1], block.rf, 'phase');
    appendSeries(channels.gxHzPerM[0], channels.gxHzPerM[1], block.gx, 'waveform');
    appendSeries(channels.gyHzPerM[0], channels.gyHzPerM[1], block.gy, 'waveform');
    appendSeries(channels.gzHzPerM[0], channels.gzHzPerM[1], block.gz, 'waveform');
    if (block.adc) {
      adcEventCount++;
      adcSampleCount += block.adc.numSamples;
      const first = block.adc.startTime + block.adc.delay + 0.5 * block.adc.dwell;
      for (let index = 0; index < block.adc.numSamples; index++) adcTimes.push(first + index * block.adc.dwell);
    }
  }
  const n = kspace.t_adc.length, middle = n ? Math.floor((n - 1) / 2) : 0;
  const xBounds = axisBounds(kspace.ktraj_adc[0]), yBounds = axisBounds(kspace.ktraj_adc[1]), zBounds = axisBounds(kspace.ktraj_adc[2]);
  const channelCheckpoints = Object.fromEntries(
    Object.entries(channels).map(([name, [times, values]]) => [name, checkpoints(times, values)]),
  );
  const rfPhaseSelection = rfPhaseCheckpoints(
    channels.rfPhaseRad[0],
    channels.rfPhaseRad[1],
    channels.rfMagnitude[1],
  );
  channelCheckpoints.rfPhaseRad = rfPhaseSelection.points;
  const payload = {
    schemaVersion: 1,
    caseId: input.split('/').pop().replace(/\.(?:seq|bseq)$/i, ''),
    inputFormat: extname(input).slice(1).toLowerCase(),
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
    host,
    engineVersion: packageVersion,
    b0Tesla: FROZEN_B0_TESLA,
    rfPhaseMinRelativeMagnitude: RF_PHASE_MIN_RELATIVE_MAGNITUDE,
    rfPhaseSelection: {
      totalSampleCount: rfPhaseSelection.totalSampleCount,
      eligibleSampleCount: rfPhaseSelection.eligibleSampleCount,
      excludedSampleCount: rfPhaseSelection.excludedSampleCount,
      magnitudeThreshold: rfPhaseSelection.magnitudeThreshold,
    },
    sequence: {
      pulseqVersion: `${sequence.version.major}.${sequence.version.minor}.${sequence.version.revision}`,
      durationSec: totalDuration,
      blockCount: sequence.blocks.length,
      adcEventCount,
      adcSampleCount,
    },
    checkpoints: channelCheckpoints,
    adcTimesSec: selectedIndices(adcTimes).map(index => ({ index, timeSec: adcTimes[index] })),
    kspace: {
      units: '1/m', adcCount: n,
      first: n ? vector(kspace, 0) : [0, 0, 0],
      middle: n ? vector(kspace, middle) : [0, 0, 0],
      last: n ? vector(kspace, n - 1) : [0, 0, 0],
      min: [xBounds[0], yBounds[0], zBounds[0]],
      max: [xBounds[1], yBounds[1], zBounds[1]],
    },
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
