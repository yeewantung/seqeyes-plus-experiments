#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { cpus, totalmem } = require('node:os');
const { basename, dirname, extname, join, relative, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');

const scriptDir = __dirname;
const baseDir = resolve(scriptDir, '..', '..', '..');
const pluginDir = join(baseDir, 'seqeyes_plugin');
const parserDir = join(pluginDir, 'out', 'pulseq');

const { parseSequenceBytes } = loadParserModule('sequenceReader.js');
const { decodeAllBlocks, getTotalDuration } = loadParserModule('decoder.js');

const DEFAULT_FIXTURE_DIR = join(baseDir, 'bseq', 'benchmark_data', 'demo_seq_pairs');
const EXTREME_FIXTURE_DIR = join(baseDir, 'demo_files');
const EXTREME_FIXTURE_NAME = 'wave_test_R3x2';
const DEFAULT_OUTPUT = join(baseDir, 'bseq', 'benchmark_results', 'latest.json');
const MAX_MISMATCH_DETAILS = 30;
const PROHIBITED_PAIR_NAMES = new Set(['wave_test']);

main();

function main() {
    const options = parseArguments(process.argv.slice(2));
    const pairs = discoverPairs(options.fixtureDir, options.filter, options.includeExtreme);
    if (pairs.length === 0) {
        fail(`No complete .seq/.bseq pairs found in ${options.fixtureDir}`);
    }

    console.log(`Benchmarking ${pairs.length} pairs with ${options.iterations} measured parse iterations`);
    console.log(`Fixtures: ${options.fixtureDir}`);

    const pairReports = [];
    for (let index = 0; index < pairs.length; index++) {
        const pair = pairs[index];
        console.log(`[${index + 1}/${pairs.length}] ${pair.name}`);
        pairReports.push(benchmarkPair(pair, options));
    }

    const report = {
        schemaVersion: 1,
        benchmark: 'seqeyes-web-seq-vs-bseq-parser-and-accuracy',
        mode: 'reporting-first-performance-blocking-accuracy',
        timestamp: new Date().toISOString(),
        environment: environmentReport(),
        parser: {
            packageVersion: readPackageVersion(),
            pluginCommit: gitRevision(pluginDir),
            compiledModuleDirectory: relative(baseDir, parserDir),
        },
        fixtureDirectory: relative(baseDir, options.fixtureDir),
        options: {
            warmupIterations: options.warmup,
            measuredIterations: options.iterations,
            filter: options.filter ? options.filter.source : null,
            includeExtremeFixture: options.includeExtreme,
        },
        summary: summarize(pairReports),
        pairs: pairReports,
    };

    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
    const markdownPath = options.output.replace(/\.json$/i, '') + '.md';
    writeFileSync(markdownPath, renderMarkdown(report));

    console.log(`JSON report: ${options.output}`);
    console.log(`Markdown report: ${markdownPath}`);
    console.log(`Accuracy: ${report.summary.accuracyPassedPairs}/${report.summary.pairCount} pairs passed`);
    console.log(`Geometric-mean parser speedup (text/binary): ${formatNumber(report.summary.parseSpeedupGeometricMean)}x`);

    if (report.summary.accuracyFailedPairs > 0) process.exitCode = 1;
}

function benchmarkPair(pair, options) {
    const textBytes = readFileSync(pair.seqPath);
    const binaryBytes = readFileSync(pair.bseqPath);

    const textSequence = parseSequenceBytes(textBytes, pair.seqPath);
    const binarySequence = parseSequenceBytes(binaryBytes, pair.bseqPath);
    const accuracy = comparePair(textSequence, binarySequence);

    for (let i = 0; i < options.warmup; i++) {
        if (i % 2 === 0) {
            parseSequenceBytes(textBytes, pair.seqPath);
            parseSequenceBytes(binaryBytes, pair.bseqPath);
        } else {
            parseSequenceBytes(binaryBytes, pair.bseqPath);
            parseSequenceBytes(textBytes, pair.seqPath);
        }
    }

    const parseTextMs = [];
    const parseBinaryMs = [];
    const readTextMs = [];
    const readBinaryMs = [];
    for (let i = 0; i < options.iterations; i++) {
        const binaryFirst = i % 2 === 1;
        if (binaryFirst) {
            parseBinaryMs.push(time(() => parseSequenceBytes(binaryBytes, pair.bseqPath)));
            parseTextMs.push(time(() => parseSequenceBytes(textBytes, pair.seqPath)));
            readBinaryMs.push(time(() => readFileSync(pair.bseqPath)));
            readTextMs.push(time(() => readFileSync(pair.seqPath)));
        } else {
            parseTextMs.push(time(() => parseSequenceBytes(textBytes, pair.seqPath)));
            parseBinaryMs.push(time(() => parseSequenceBytes(binaryBytes, pair.bseqPath)));
            readTextMs.push(time(() => readFileSync(pair.seqPath)));
            readBinaryMs.push(time(() => readFileSync(pair.bseqPath)));
        }
    }

    const textParse = statistics(parseTextMs, textBytes.byteLength);
    const binaryParse = statistics(parseBinaryMs, binaryBytes.byteLength);
    const textRead = statistics(readTextMs, textBytes.byteLength);
    const binaryRead = statistics(readBinaryMs, binaryBytes.byteLength);

    return {
        name: pair.name,
        category: pair.category,
        files: {
            seq: relative(baseDir, pair.seqPath),
            bseq: relative(baseDir, pair.bseqPath),
            seqBytes: textBytes.byteLength,
            bseqBytes: binaryBytes.byteLength,
            bseqToSeqSizeRatio: binaryBytes.byteLength / textBytes.byteLength,
            seqSha256: sha256(textBytes),
            bseqSha256: sha256(binaryBytes),
        },
        descriptors: sequenceDescriptors(textSequence),
        accuracy,
        performance: {
            acquisition: {
                note: 'Warm filesystem read plus allocation; not a controlled cold-cache measurement.',
                seq: textRead,
                bseq: binaryRead,
                speedupTextOverBinary: safeRatio(textRead.medianMs, binaryRead.medianMs),
            },
            parsePreloadedBytes: {
                note: 'Includes UTF-8 decoding for .seq and complete parser validation/shape decompression for both formats.',
                seq: textParse,
                bseq: binaryParse,
                speedupTextOverBinary: safeRatio(textParse.medianMs, binaryParse.medianMs),
            },
        },
    };
}

function comparePair(textSequence, binarySequence) {
    const structure = createComparison('normalizedStructure');
    compareValue(structure, 'rasterTimes', textSequence.rasterTimes, binarySequence.rasterTimes, numericTolerance(1e-12, 1e-10));
    compareValue(structure, 'blocks', textSequence.blocks, binarySequence.blocks, exactTolerance());
    compareMap(structure, 'definitions', textSequence.definitions, binarySequence.definitions, numericTolerance(1e-12, 1e-8));
    compareStringDefinitions(structure, textSequence, binarySequence);

    for (const field of ['rfs', 'arbitraryGrads', 'trapGrads', 'adcs']) {
        // MATLAB's text writer uses roughly six significant digits for many
        // event scalars, while writeBinary preserves float64 values.
        compareMap(structure, field, textSequence[field], binarySequence[field], numericTolerance(1e-9, 5e-6));
    }
    for (const field of ['extensions', 'extensionNames', 'extensionTypes']) {
        compareMap(structure, field, textSequence[field], binarySequence[field], exactTolerance());
    }
    for (const field of ['triggers', 'ncos', 'rotations', 'labelSets', 'labelIncs', 'softDelays', 'rfShims']) {
        compareValue(structure, field, textSequence[field], binarySequence[field], numericTolerance(1e-9, 5e-6));
    }
    compareShapes(structure, textSequence.shapes, binarySequence.shapes);

    const decodedText = decodeAllBlocks(textSequence);
    const decodedBinary = decodeAllBlocks(binarySequence);
    const decoded = compareDecodedBlocks(decodedText, decodedBinary);
    const durationDifferenceSec = Math.abs(getTotalDuration(textSequence) - getTotalDuration(binarySequence));
    const durationToleranceSec = 1e-9;
    const versionCompatibility = compareVersions(textSequence.version, binarySequence.version);

    return {
        passed: versionCompatibility.passed
            && structure.mismatchCount === 0
            && decoded.passed
            && durationDifferenceSec <= durationToleranceSec,
        versionCompatibility,
        structure,
        decoded,
        totalDuration: {
            seqSeconds: getTotalDuration(textSequence),
            bseqSeconds: getTotalDuration(binarySequence),
            absoluteDifferenceSeconds: durationDifferenceSec,
            toleranceSeconds: durationToleranceSec,
            passed: durationDifferenceSec <= durationToleranceSec,
        },
    };
}

function compareVersions(textVersion, binaryVersion) {
    // The current Pulseq MATLAB writers intentionally label these same-run
    // pairs differently: write() emits text revision 1, whereas
    // writeBinary() emits the official binary revision 2. Major/minor must
    // still agree and the binary parser currently supports exactly 1.5.2.
    const passed = textVersion.major === binaryVersion.major
        && textVersion.minor === binaryVersion.minor
        && binaryVersion.major === 1
        && binaryVersion.minor === 5
        && binaryVersion.revision === 2
        && (textVersion.revision === 1 || textVersion.revision === 2);
    return {
        passed,
        seq: textVersion,
        bseq: binaryVersion,
        note: 'Pulseq MATLAB write() and writeBinary() may emit text revision 1 and binary revision 2 from the same object.',
    };
}

function compareShapes(comparison, textShapes, binaryShapes) {
    compareMapKeys(comparison, 'shapes', textShapes, binaryShapes);
    for (const [id, textShape] of textShapes) {
        const binaryShape = binaryShapes.get(id);
        if (!binaryShape) continue;
        compareValue(comparison, `shapes.${id}.numSamples`, textShape.numSamples, binaryShape.numSamples, exactTolerance());
        compareValue(comparison, `shapes.${id}.samples`, textShape.samples, binaryShape.samples, numericTolerance(2e-6, 2e-6));
    }
}

function compareDecodedBlocks(textBlocks, binaryBlocks) {
    const details = [];
    const metrics = {
        blockCountSeq: textBlocks.length,
        blockCountBseq: binaryBlocks.length,
        presenceMismatchCount: 0,
        lengthMismatchCount: 0,
        metadataMismatchCount: 0,
        maxTimeDifferenceSec: 0,
        maxGradientAbsoluteDifference: 0,
        maxGradientMagnitude: 0,
        maxRfMagnitudeDifference: 0,
        maxRfPhaseDifferenceRad: 0,
    };

    if (textBlocks.length !== binaryBlocks.length) {
        addDetail(details, `decoded block count: ${textBlocks.length} != ${binaryBlocks.length}`);
    }

    const blockCount = Math.min(textBlocks.length, binaryBlocks.length);
    for (let index = 0; index < blockCount; index++) {
        const left = textBlocks[index];
        const right = binaryBlocks[index];
        metrics.maxTimeDifferenceSec = Math.max(
            metrics.maxTimeDifferenceSec,
            Math.abs(left.startTime - right.startTime),
            Math.abs(left.duration - right.duration),
        );

        for (const channel of ['gx', 'gy', 'gz']) {
            const leftGrad = left[channel];
            const rightGrad = right[channel];
            if (!!leftGrad !== !!rightGrad) {
                metrics.presenceMismatchCount++;
                addDetail(details, `block ${index + 1} ${channel} presence differs`);
                continue;
            }
            if (!leftGrad) continue;
            if (leftGrad.type !== rightGrad.type) {
                metrics.metadataMismatchCount++;
                addDetail(details, `block ${index + 1} ${channel} type differs`);
            }
            compareDecodedArrayLengths(metrics, details, index, `${channel}.timePoints`, leftGrad.timePoints, rightGrad.timePoints);
            compareDecodedArrayLengths(metrics, details, index, `${channel}.waveform`, leftGrad.waveform, rightGrad.waveform);
            metrics.maxTimeDifferenceSec = Math.max(metrics.maxTimeDifferenceSec, maxAbsDiff(leftGrad.timePoints, rightGrad.timePoints));
            metrics.maxGradientAbsoluteDifference = Math.max(metrics.maxGradientAbsoluteDifference, maxAbsDiff(leftGrad.waveform, rightGrad.waveform));
            metrics.maxGradientMagnitude = Math.max(metrics.maxGradientMagnitude, maxAbs(leftGrad.waveform), maxAbs(rightGrad.waveform));
        }

        if (!!left.rf !== !!right.rf) {
            metrics.presenceMismatchCount++;
            addDetail(details, `block ${index + 1} RF presence differs`);
        } else if (left.rf) {
            compareDecodedArrayLengths(metrics, details, index, 'rf.timePoints', left.rf.timePoints, right.rf.timePoints);
            compareDecodedArrayLengths(metrics, details, index, 'rf.magnitude', left.rf.magnitude, right.rf.magnitude);
            compareDecodedArrayLengths(metrics, details, index, 'rf.phase', left.rf.phase, right.rf.phase);
            metrics.maxTimeDifferenceSec = Math.max(metrics.maxTimeDifferenceSec, maxAbsDiff(left.rf.timePoints, right.rf.timePoints));
            metrics.maxRfMagnitudeDifference = Math.max(metrics.maxRfMagnitudeDifference, maxAbsDiff(left.rf.magnitude, right.rf.magnitude));
            metrics.maxRfPhaseDifferenceRad = Math.max(metrics.maxRfPhaseDifferenceRad, maxAbsDiff(left.rf.phase, right.rf.phase));
        }

        if (!!left.adc !== !!right.adc) {
            metrics.presenceMismatchCount++;
            addDetail(details, `block ${index + 1} ADC presence differs`);
        } else if (left.adc) {
            const adcComparison = createComparison('adc');
            compareValue(adcComparison, `block.${index + 1}.adc`, left.adc, right.adc, numericTolerance(1e-9, 5e-6));
            metrics.metadataMismatchCount += adcComparison.mismatchCount;
            for (const item of adcComparison.mismatches) addDetail(details, item);
        }

        for (const field of ['triggers', 'nco', 'rotation', 'labelSets', 'labelIncs', 'softDelay', 'rfShim']) {
            const metadataComparison = createComparison(field);
            compareValue(metadataComparison, `block.${index + 1}.${field}`, left[field], right[field], numericTolerance(1e-9, 5e-6));
            metrics.metadataMismatchCount += metadataComparison.mismatchCount;
            for (const item of metadataComparison.mismatches) addDetail(details, item);
        }
    }

    const tolerances = {
        timeSeconds: 1e-9,
        gradientAbsolute: Math.max(1e-9, metrics.maxGradientMagnitude * 5e-6),
        rfMagnitudeAbsolute: 0.001,
        rfPhaseAbsoluteRad: 0.001,
    };
    const passed = textBlocks.length === binaryBlocks.length
        && metrics.presenceMismatchCount === 0
        && metrics.lengthMismatchCount === 0
        && metrics.metadataMismatchCount === 0
        && metrics.maxTimeDifferenceSec <= tolerances.timeSeconds
        && metrics.maxGradientAbsoluteDifference <= tolerances.gradientAbsolute
        && metrics.maxRfMagnitudeDifference < tolerances.rfMagnitudeAbsolute
        && metrics.maxRfPhaseDifferenceRad < tolerances.rfPhaseAbsoluteRad;

    return { passed, metrics, tolerances, mismatches: details };
}

function compareDecodedArrayLengths(metrics, details, blockIndex, field, left, right) {
    if (left.length !== right.length) {
        metrics.lengthMismatchCount++;
        addDetail(details, `block ${blockIndex + 1} ${field} length: ${left.length} != ${right.length}`);
    }
}

function compareStringDefinitions(comparison, textSequence, binarySequence) {
    const keys = new Set([...textSequence.definitionsRaw.keys(), ...binarySequence.definitionsRaw.keys()]);
    for (const key of keys) {
        const textNumeric = textSequence.definitions.get(key) || [];
        const binaryNumeric = binarySequence.definitions.get(key) || [];
        if (textNumeric.length > 0 || binaryNumeric.length > 0) continue;
        compareValue(
            comparison,
            `definitionsRaw.${key}`,
            textSequence.definitionsRaw.get(key),
            binarySequence.definitionsRaw.get(key),
            exactTolerance(),
        );
    }
}

function compareMap(comparison, path, left, right, tolerance) {
    compareMapKeys(comparison, path, left, right);
    for (const [key, value] of left) {
        if (right.has(key)) compareValue(comparison, `${path}.${String(key)}`, value, right.get(key), tolerance);
    }
}

function compareMapKeys(comparison, path, left, right) {
    const leftKeys = [...left.keys()].map(String).sort();
    const rightKeys = [...right.keys()].map(String).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
        recordMismatch(comparison, `${path} keys differ: [${leftKeys.join(', ')}] != [${rightKeys.join(', ')}]`);
    }
}

function compareValue(comparison, path, left, right, tolerance) {
    if (typeof left === 'number' && typeof right === 'number') {
        comparison.numericComparisonCount++;
        if (Number.isNaN(left) && Number.isNaN(right)) return;
        const difference = Math.abs(left - right);
        const scale = Math.max(Math.abs(left), Math.abs(right));
        const relativeDifference = scale === 0 ? difference : difference / scale;
        comparison.maxAbsoluteDifference = Math.max(comparison.maxAbsoluteDifference, difference);
        comparison.maxRelativeDifference = Math.max(comparison.maxRelativeDifference, relativeDifference);
        if (!Number.isFinite(difference) || difference > tolerance.absolute + tolerance.relative * scale) {
            recordMismatch(comparison, `${path}: ${left} != ${right}`);
        }
        return;
    }

    if (isArrayLike(left) && isArrayLike(right)) {
        if (left.length !== right.length) {
            recordMismatch(comparison, `${path} length: ${left.length} != ${right.length}`);
        }
        const length = Math.min(left.length, right.length);
        for (let index = 0; index < length; index++) {
            compareValue(comparison, `${path}[${index}]`, left[index], right[index], tolerance);
        }
        return;
    }

    if (left && right && typeof left === 'object' && typeof right === 'object') {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
            recordMismatch(comparison, `${path} object keys differ`);
        }
        for (const key of leftKeys) {
            if (Object.prototype.hasOwnProperty.call(right, key)) {
                compareValue(comparison, `${path}.${key}`, left[key], right[key], tolerance);
            }
        }
        return;
    }

    if (!Object.is(left, right)) recordMismatch(comparison, `${path}: ${String(left)} != ${String(right)}`);
}

function createComparison(name) {
    return {
        name,
        mismatchCount: 0,
        mismatches: [],
        numericComparisonCount: 0,
        maxAbsoluteDifference: 0,
        maxRelativeDifference: 0,
    };
}

function recordMismatch(comparison, message) {
    comparison.mismatchCount++;
    addDetail(comparison.mismatches, message);
}

function addDetail(details, message) {
    if (details.length < MAX_MISMATCH_DETAILS) details.push(message);
}

function sequenceDescriptors(sequence) {
    const arbitraryGradientBlocks = countArbitraryGradientBlocks(sequence);
    return {
        version: `${sequence.version.major}.${sequence.version.minor}.${sequence.version.revision}`,
        blocks: sequence.blocks.length,
        rfEvents: sequence.rfs.size,
        arbitraryGradientEvents: sequence.arbitraryGrads.size,
        arbitraryGradientBlocks,
        trapezoidGradientEvents: sequence.trapGrads.size,
        adcEvents: sequence.adcs.size,
        extensionNodes: sequence.extensions.size,
        shapes: sequence.shapes.size,
        expandedShapeSamples: [...sequence.shapes.values()].reduce((sum, shape) => sum + shape.numSamples, 0),
        totalDurationSeconds: getTotalDuration(sequence),
    };
}

function countArbitraryGradientBlocks(sequence) {
    const perAxisBlockReferences = { gx: 0, gy: 0, gz: 0 };
    const referencedEventIds = new Set();
    let blocksWithAny = 0;
    let totalBlockReferences = 0;

    for (const block of sequence.blocks) {
        let blockHasArbitraryGradient = false;
        for (const [axis, field] of [['gx', 'gxId'], ['gy', 'gyId'], ['gz', 'gzId']]) {
            const eventId = block[field];
            if (eventId !== 0 && sequence.arbitraryGrads.has(eventId)) {
                perAxisBlockReferences[axis]++;
                totalBlockReferences++;
                referencedEventIds.add(eventId);
                blockHasArbitraryGradient = true;
            }
        }
        if (blockHasArbitraryGradient) blocksWithAny++;
    }

    return {
        blocksWithAny,
        totalBlockReferences,
        perAxisBlockReferences,
        uniqueReferencedEvents: referencedEventIds.size,
        fractionOfBlocksWithAny: sequence.blocks.length > 0 ? blocksWithAny / sequence.blocks.length : 0,
    };
}

function discoverPairs(fixtureDir, filter, includeExtreme) {
    if (!existsSync(fixtureDir)) fail(`Fixture directory does not exist: ${fixtureDir}`);
    const entries = readdirSync(fixtureDir);
    const names = new Set(entries.filter(name => extname(name).toLowerCase() === '.seq').map(name => basename(name, '.seq')));
    const pairs = [...names]
        .filter(name => !PROHIBITED_PAIR_NAMES.has(name.toLowerCase()))
        .filter(name => existsSync(join(fixtureDir, `${name}.bseq`)))
        .filter(name => !filter || filter.test(name))
        .sort()
        .map(name => ({
            name,
            category: 'demoSeq',
            seqPath: join(fixtureDir, `${name}.seq`),
            bseqPath: join(fixtureDir, `${name}.bseq`),
        }));

    if (includeExtreme && (!filter || filter.test(EXTREME_FIXTURE_NAME))) {
        const seqPath = join(EXTREME_FIXTURE_DIR, `${EXTREME_FIXTURE_NAME}.seq`);
        const bseqPath = join(EXTREME_FIXTURE_DIR, `${EXTREME_FIXTURE_NAME}.bseq`);
        if (existsSync(seqPath) && existsSync(bseqPath) && !pairs.some(pair => pair.name === EXTREME_FIXTURE_NAME)) {
            pairs.push({
                name: EXTREME_FIXTURE_NAME,
                category: 'extreme-arbitrary-gradient',
                seqPath,
                bseqPath,
            });
        }
    }
    return pairs;
}

function statistics(values, byteLength) {
    const sorted = [...values].sort((a, b) => a - b);
    const med = median(sorted);
    const deviations = sorted.map(value => Math.abs(value - med)).sort((a, b) => a - b);
    return {
        medianMs: med,
        p95Ms: percentile(sorted, 0.95),
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        medianAbsoluteDeviationMs: median(deviations),
        medianMegabytesPerSecond: med > 0 ? (byteLength / 1_000_000) / (med / 1000) : null,
        samplesMs: values,
    };
}

function summarize(pairReports) {
    const passed = pairReports.filter(pair => pair.accuracy.passed).length;
    const speedups = pairReports
        .map(pair => pair.performance.parsePreloadedBytes.speedupTextOverBinary)
        .filter(value => Number.isFinite(value) && value > 0);
    const totalSeqBytes = pairReports.reduce((sum, pair) => sum + pair.files.seqBytes, 0);
    const totalBseqBytes = pairReports.reduce((sum, pair) => sum + pair.files.bseqBytes, 0);
    return {
        pairCount: pairReports.length,
        accuracyPassedPairs: passed,
        accuracyFailedPairs: pairReports.length - passed,
        totalSeqBytes,
        totalBseqBytes,
        aggregateBseqToSeqSizeRatio: totalBseqBytes / totalSeqBytes,
        parseSpeedupGeometricMean: geometricMean(speedups),
        parseSpeedupMedian: median(speedups.sort((a, b) => a - b)),
    };
}

function renderMarkdown(report) {
    const lines = [
        '# SeqEyes Web `.seq` vs `.bseq` benchmark',
        '',
        `Generated: ${report.timestamp}`,
        '',
        `Accuracy: **${report.summary.accuracyPassedPairs}/${report.summary.pairCount} pairs passed**`,
        '',
        `Geometric-mean parser speedup (text median / binary median): **${formatNumber(report.summary.parseSpeedupGeometricMean)}x**`,
        '',
        `Aggregate paired storage: SEQ **${formatBytes(report.summary.totalSeqBytes)}**; BSEQ **${formatBytes(report.summary.totalBseqBytes)}**; BSEQ saves **${formatPercent(1 - report.summary.aggregateBseqToSeqSizeRatio)}**.`,
        '',
        `Aggregate BSEQ/SEQ size ratio: **${formatNumber(report.summary.aggregateBseqToSeqSizeRatio)}**`,
        '',
        '| Pair | Category | SEQ bytes | BSEQ bytes | Arb events | Arb blocks | Arb refs | SEQ parse ms | BSEQ parse ms | Speedup | Accuracy |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
    ];
    for (const pair of report.pairs) {
        const arbitrary = pair.descriptors.arbitraryGradientBlocks;
        lines.push(`| ${pair.name} | ${pair.category} | ${pair.files.seqBytes} | ${pair.files.bseqBytes} | ${pair.descriptors.arbitraryGradientEvents} | ${arbitrary.blocksWithAny} | ${arbitrary.totalBlockReferences} | ${formatNumber(pair.performance.parsePreloadedBytes.seq.medianMs)} | ${formatNumber(pair.performance.parsePreloadedBytes.bseq.medianMs)} | ${formatNumber(pair.performance.parsePreloadedBytes.speedupTextOverBinary)}x | ${pair.accuracy.passed ? 'PASS' : 'FAIL'} |`);
    }
    const failures = report.pairs.filter(pair => !pair.accuracy.passed);
    if (failures.length > 0) {
        lines.push('', '## Accuracy failures', '');
        for (const pair of failures) {
            lines.push(`### ${pair.name}`, '');
            const mismatches = [
                ...pair.accuracy.structure.mismatches,
                ...pair.accuracy.decoded.mismatches,
            ];
            for (const mismatch of mismatches) lines.push(`- ${mismatch}`);
            lines.push('');
        }
    }
    lines.push('', '> Performance values are reporting-first. Warm filesystem acquisition and preloaded-byte parsing are reported separately; this run does not measure browser rendering or k-space.', '');
    return lines.join('\n');
}

function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return 'n/a';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MiB`;
    return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function parseArguments(args) {
    const options = {
        fixtureDir: DEFAULT_FIXTURE_DIR,
        output: DEFAULT_OUTPUT,
        warmup: 3,
        iterations: 15,
        filter: null,
        includeExtreme: true,
    };
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--quick') {
            options.warmup = 1;
            options.iterations = 3;
        } else if (argument === '--no-extreme') {
            options.includeExtreme = false;
        } else if (argument === '--fixtures') {
            options.fixtureDir = resolve(requireValue(args, ++index, argument));
        } else if (argument === '--output') {
            options.output = resolve(requireValue(args, ++index, argument));
        } else if (argument === '--iterations') {
            options.iterations = positiveInteger(requireValue(args, ++index, argument), argument);
        } else if (argument === '--warmup') {
            options.warmup = nonNegativeInteger(requireValue(args, ++index, argument), argument);
        } else if (argument === '--filter') {
            options.filter = new RegExp(requireValue(args, ++index, argument), 'i');
        } else if (argument === '--help' || argument === '-h') {
            printHelp();
            process.exit(0);
        } else {
            fail(`Unknown argument: ${argument}`);
        }
    }
    return options;
}

function printHelp() {
    console.log(`Usage: run_benchmark.cjs [options]\n\nOptions:\n  --quick             Use 1 warm-up and 3 measured iterations\n  --iterations N      Measured parser/read iterations (default: 15)\n  --warmup N          Parser warm-up iterations (default: 3)\n  --filter REGEX      Benchmark only matching pair names\n  --fixtures PATH     Override the paired fixture directory\n  --no-extreme        Exclude demo_files/wave_test_R3x2 pair\n  --output PATH       JSON output path (default: bseq/benchmark_results/latest.json)\n  -h, --help          Show this help`);
}

function loadParserModule(fileName) {
    const modulePath = join(parserDir, fileName);
    if (!existsSync(modulePath)) {
        fail(`Compiled SeqEyes Web parser not found at ${modulePath}. Run the benchmark wrapper so seqeyes_plugin is compiled first.`);
    }
    return require(modulePath);
}

function environmentReport() {
    const cpu = cpus()[0];
    return {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        cpuModel: cpu ? cpu.model : 'unknown',
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        rootCommit: gitRevision(baseDir),
    };
}

function readPackageVersion() {
    const packagePath = join(pluginDir, 'package.json');
    if (!existsSync(packagePath)) return 'unknown';
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

function gitRevision(directory) {
    try {
        return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

function time(operation) {
    const start = performance.now();
    operation();
    return performance.now() - start;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function exactTolerance() {
    return { absolute: 0, relative: 0 };
}

function numericTolerance(absolute, relative) {
    return { absolute, relative };
}

function isArrayLike(value) {
    return Array.isArray(value) || ArrayBuffer.isView(value);
}

function maxAbs(values) {
    let maximum = 0;
    for (let index = 0; index < values.length; index++) maximum = Math.max(maximum, Math.abs(values[index]));
    return maximum;
}

function maxAbsDiff(left, right) {
    if (left.length !== right.length) return Number.POSITIVE_INFINITY;
    let maximum = 0;
    for (let index = 0; index < left.length; index++) maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
    return maximum;
}

function median(sortedValues) {
    if (sortedValues.length === 0) return null;
    const middle = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2 === 0
        ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
        : sortedValues[middle];
}

function percentile(sortedValues, fraction) {
    if (sortedValues.length === 0) return null;
    return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];
}

function geometricMean(values) {
    if (values.length === 0) return null;
    return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function safeRatio(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null;
}

function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

function requireValue(args, index, argument) {
    if (index >= args.length) fail(`${argument} requires a value`);
    return args[index];
}

function positiveInteger(value, argument) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) fail(`${argument} requires a positive integer`);
    return parsed;
}

function nonNegativeInteger(value, argument) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) fail(`${argument} requires a non-negative integer`);
    return parsed;
}

function fail(message) {
    console.error(message);
    process.exit(2);
}
