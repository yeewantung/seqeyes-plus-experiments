#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { cpus } = require('node:os');
const { dirname, join, relative, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');

const scriptDir = __dirname;
const baseDir = resolve(scriptDir, '..', '..', '..');
const pluginDir = join(baseDir, 'seqeyes_plugin');
const playwrightPath = join(pluginDir, 'node_modules', 'playwright');
const DEFAULT_INPUT = join(baseDir, 'bseq', 'benchmark_results', 'latest.json');
const DEFAULT_OUTPUT = join(baseDir, 'bseq', 'benchmark_results', 'latest-browser.json');
const SERVER_URL = 'http://127.0.0.1:4173/?debug=1';
const EXTREME_NAME = 'wave_test_R3x2';

if (!existsSync(playwrightPath)) {
    fail(`Playwright is not installed under ${pluginDir}. Run npm install in seqeyes_plugin first.`);
}
const { chromium } = require(playwrightPath);

main().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const parserReport = JSON.parse(readFileSync(options.input, 'utf8'));
    const cases = parserReport.pairs.map(pair => ({
        name: pair.name,
        category: pair.category,
        seqPath: join(baseDir, pair.files.seq),
        bseqPath: join(baseDir, pair.files.bseq),
        files: pair.files,
        descriptors: pair.descriptors,
    }));
    if (cases.length === 0) fail(`No pairs found in ${options.input}`);
    if (cases.some(item => item.name.toLowerCase() === 'wave_test')) {
        fail('The prohibited full wave_test pair appeared in the input report.');
    }

    console.log(`Browser benchmarking ${cases.length} pairs with ${options.iterations} iteration(s) per format`);
    const server = await ensureServer();
    const browser = await chromium.launch({ headless: true });
    try {
        const pairReports = [];
        for (let index = 0; index < cases.length; index++) {
            const testCase = cases[index];
            console.log(`[${index + 1}/${cases.length}] ${testCase.name}`);
            pairReports.push(await benchmarkPair(browser, testCase, options));
        }

        let extremeProfiles = null;
        const extreme = cases.find(item => item.name === EXTREME_NAME);
        if (options.profileExtreme && extreme) {
            console.log(`Profiling ${EXTREME_NAME} in Chromium (diagnostic iteration)`);
            extremeProfiles = {
                seq: await profileLoad(browser, extreme.seqPath),
                bseq: await profileLoad(browser, extreme.bseqPath),
            };
        }

        const report = {
            schemaVersion: 1,
            benchmark: 'seqeyes-standalone-browser-seq-vs-bseq-full-load',
            mode: 'reporting-first',
            timestamp: new Date().toISOString(),
            environment: {
                node: process.version,
                platform: process.platform,
                architecture: process.arch,
                cpuModel: cpus()[0]?.model || 'unknown',
                logicalCpuCount: cpus().length,
                chromiumVersion: browser.version(),
                headless: true,
                viewport: options.viewport,
            },
            sourceParserReport: relative(baseDir, options.input),
            iterationsPerFormat: options.iterations,
            summary: summarize(pairReports),
            pairs: pairReports,
            extremeCpuProfiles: extremeProfiles,
        };

        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
        const markdownPath = options.output.replace(/\.json$/i, '') + '.md';
        writeFileSync(markdownPath, renderMarkdown(report));
        console.log(`Browser JSON report: ${options.output}`);
        console.log(`Browser Markdown report: ${markdownPath}`);
        console.log(`Browser state parity: ${report.summary.parityPassedPairs}/${report.summary.pairCount} pairs passed`);
        console.log(`Geometric-mean browser-ready speedup: ${formatNumber(report.summary.readySpeedupGeometricMean)}x`);
        console.log(`Geometric-mean k-space speedup: ${formatNumber(report.summary.kspaceSpeedupGeometricMean)}x`);
        if (report.summary.parityFailedPairs > 0) process.exitCode = 1;
    } finally {
        await browser.close();
        if (server) await stopServer(server);
    }
}

async function benchmarkPair(browser, testCase, options) {
    const results = { seq: [], bseq: [] };
    for (let iteration = 0; iteration < options.iterations; iteration++) {
        const binaryFirst = iteration % 2 === 1;
        for (const format of binaryFirst ? ['bseq', 'seq'] : ['seq', 'bseq']) {
            const filePath = format === 'seq' ? testCase.seqPath : testCase.bseqPath;
            results[format].push(await measureLoad(browser, filePath, options));
        }
    }

    const seqSummary = summarizeRuns(results.seq);
    const bseqSummary = summarizeRuns(results.bseq);
    const parity = compareBrowserState(results.seq[0], results.bseq[0]);
    return {
        name: testCase.name,
        category: testCase.category,
        files: testCase.files,
        descriptors: testCase.descriptors,
        parity,
        seq: seqSummary,
        bseq: bseqSummary,
        speedupTextOverBinary: {
            fileInputToReady: ratio(seqSummary.metricsMs.fileInputToReady.median, bseqSummary.metricsMs.fileInputToReady.median),
            synchronousPipeline: ratio(seqSummary.metricsMs.synchronousPipeline.median, bseqSummary.metricsMs.synchronousPipeline.median),
            parse: ratio(phaseMedian(seqSummary, 'parseSequenceBytes'), phaseMedian(bseqSummary, 'parseSequenceBytes')),
            decode: ratio(phaseMedian(seqSummary, 'decodeAllBlocks'), phaseMedian(bseqSummary, 'decodeAllBlocks')),
            kspace: ratio(phaseMedian(seqSummary, 'calculateKspace'), phaseMedian(bseqSummary, 'calculateKspace')),
        },
        rawRuns: results,
    };
}

async function measureLoad(browser, filePath, options) {
    const page = await browser.newPage({ viewport: options.viewport });
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));

    try {
        await page.goto(SERVER_URL, { waitUntil: 'load', timeout: 30_000 });
        await installInstrumentation(page);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');

        const nodeStart = performance.now();
        await page.locator('#fileInput').setInputFiles(filePath);
        await waitForViewerReady(page, options.timeoutMs);
        const nodeReadyMs = performance.now() - nodeStart;
        let forcedKspace = false;
        let nodeKspaceReadyMs = nodeReadyMs;
        const safetyInitiallyActive = await page.evaluate(
            () => window.__seqeyesDebug.kspaceSafetyState().active,
        );
        if (safetyInitiallyActive && options.forceKspace) {
            forcedKspace = true;
            await page.evaluate(() => document.getElementById('kspaceSafetyProceed').click());
            await page.waitForFunction(
                () => !window.__seqeyesDebug.kspaceSafetyState().busy,
                null,
                { timeout: options.timeoutMs },
            );
            nodeKspaceReadyMs = performance.now() - nodeStart;
            const overrideState = await page.evaluate(() => ({
                safety: window.__seqeyesDebug.kspaceSafetyState(),
                debug: window.__seqeyesDebug.state(),
            }));
            if (overrideState.safety.active || !overrideState.debug.adcCount) {
                throw new Error(
                    `Forced k-space did not complete for ${filePath}: `
                    + overrideState.debug.notices.join('; '),
                );
            }
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        const browserMetrics = await page.evaluate(() => {
            const bench = window.__bseqBenchmark;
            const debug = window.__seqeyesDebug.state();
            return {
                bench,
                debug,
                waveformCanvasVaried: canvasHasVariation(document.getElementById('mc')),
                minimapCanvasVaried: canvasHasVariation(document.getElementById('mmc')),
                safety: window.__seqeyesDebug.kspaceSafetyState(),
            };

            function canvasHasVariation(canvas) {
                if (!canvas || !canvas.width || !canvas.height) return false;
                const context = canvas.getContext('2d');
                if (!context) return false;
                const width = canvas.width;
                const height = canvas.height;
                let first = null;
                for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
                    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
                        const pixel = context.getImageData(x, y, 1, 1).data;
                        const key = `${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`;
                        if (first === null) first = key;
                        else if (key !== first) return true;
                    }
                }
                return false;
            }
        });

        const interaction = await page.evaluate(async () => {
            async function afterPaint(operation) {
                const start = performance.now();
                operation();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return performance.now() - start;
            }
            const fitMs = await afterPaint(() => document.getElementById('zf').click());
            const zoomBatchMs = await afterPaint(() => {
                for (let index = 0; index < 8; index++) {
                    document.getElementById(index % 2 === 0 ? 'zi' : 'zo').click();
                }
            });
            const kspaceToggleMs = await afterPaint(() => document.getElementById('kbtn').click());
            return { fitMs, zoomBatchMs, kspaceToggleMs };
        });

        const performanceMetrics = await cdp.send('Performance.getMetrics');
        await cdp.send('HeapProfiler.enable');
        const heapBeforeGc = await cdp.send('Runtime.getHeapUsage');
        await cdp.send('HeapProfiler.collectGarbage');
        const heapAfterGc = await cdp.send('Runtime.getHeapUsage');
        await cdp.detach();
        const cdpMetrics = Object.fromEntries(performanceMetrics.metrics.map(item => [item.name, item.value]));
        const bench = browserMetrics.bench;
        const knownPipelineMs = sumPhaseTotals(bench.phases);
        return {
            file: relative(baseDir, filePath),
            nodeObservedFileInputToReadyMs: nodeReadyMs,
            nodeObservedFileInputToKspaceReadyMs: nodeKspaceReadyMs,
            metricsMs: {
                fileInputToReady: bench.readyAt - bench.fileReadStart,
                fileInputToKspaceReady: forcedKspace
                    ? nodeKspaceReadyMs
                    : bench.readyAt - bench.fileReadStart,
                fileRead: bench.fileReadEnd - bench.fileReadStart,
                synchronousPipeline: bench.readyAt - bench.pipelineStart,
                knownInstrumentedPipeline: knownPipelineMs,
                unattributedViewerPreparationAndRender: Math.max(0, bench.readyAt - bench.pipelineStart - knownPipelineMs),
                longestTask: bench.longTasks.length ? Math.max(...bench.longTasks) : 0,
                totalLongTasks: bench.longTasks.reduce((sum, value) => sum + value, 0),
                initialDraw: browserMetrics.debug.lastDrawDurationMs,
                ...interaction,
            },
            phases: bench.phases,
            state: {
                blocks: browserMetrics.debug.blocks,
                totalDuration: browserMetrics.debug.totalDuration,
                adcTrajectorySamples: browserMetrics.debug.adcCount,
                exportEnabled: browserMetrics.debug.exportEnabled,
                waveformOverviewActive: browserMetrics.debug.waveformOverviewActive,
                derivedRenderPoints: browserMetrics.debug.derivedRenderPoints,
                notices: browserMetrics.debug.notices,
                kspaceSafetyActive: browserMetrics.safety.active,
                kspaceSafetyInitiallyActive: safetyInitiallyActive,
                forcedKspace,
                kspaceEstimate: bench.kspaceEstimate || null,
                kspaceEstimatedPeakMemoryBytes: bench.kspaceEstimatedPeakMemoryBytes || null,
                kspaceResultCounts: bench.kspaceResultCounts || null,
                waveformCanvasVaried: browserMetrics.waveformCanvasVaried,
                minimapCanvasVaried: browserMetrics.minimapCanvasVaried,
            },
            memoryAndRuntime: {
                jsHeapUsedBytes: cdpMetrics.JSHeapUsedSize ?? null,
                jsHeapTotalBytes: cdpMetrics.JSHeapTotalSize ?? null,
                jsHeapUsedBeforeForcedGcBytes: heapBeforeGc.usedSize,
                jsHeapUsedAfterForcedGcBytes: heapAfterGc.usedSize,
                embedderHeapUsedBeforeForcedGcBytes: heapBeforeGc.embedderHeapUsedSize ?? null,
                embedderHeapUsedAfterForcedGcBytes: heapAfterGc.embedderHeapUsedSize ?? null,
                nodes: cdpMetrics.Nodes ?? null,
                layoutCount: cdpMetrics.LayoutCount ?? null,
                recalcStyleCount: cdpMetrics.RecalcStyleCount ?? null,
                taskDurationSeconds: cdpMetrics.TaskDuration ?? null,
            },
            consoleErrors,
        };
    } finally {
        await page.close();
    }
}

async function installInstrumentation(page) {
    await page.evaluate(() => {
        const benchmark = {
            installedAt: performance.now(),
            fileReadStart: 0,
            fileReadEnd: 0,
            pipelineStart: 0,
            readyAt: 0,
            phases: {},
            longTasks: [],
            kspaceEstimate: null,
            kspaceEstimatedPeakMemoryBytes: null,
            kspaceResultCounts: null,
        };
        window.__bseqBenchmark = benchmark;

        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) benchmark.longTasks.push(entry.duration);
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (_error) {
            // Long-task observation is diagnostic and not universally available.
        }

        const originalArrayBuffer = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = async function (...args) {
            benchmark.fileReadStart = performance.now();
            try {
                return await originalArrayBuffer.apply(this, args);
            } finally {
                benchmark.fileReadEnd = performance.now();
            }
        };

        const originalPulseq = window.Pulseq;
        const instrumentedPulseq = {};
        for (const key of Object.keys(originalPulseq)) instrumentedPulseq[key] = originalPulseq[key];

        function wrap(name) {
            const original = originalPulseq[name];
            if (typeof original !== 'function') return;
            instrumentedPulseq[name] = function (...args) {
                const start = performance.now();
                if (!benchmark.pipelineStart && name === 'parseSequenceBytes') benchmark.pipelineStart = start;
                try {
                    const result = original.apply(originalPulseq, args);
                    if (name === 'estimateKspaceCost') benchmark.kspaceEstimate = result;
                    if (name === 'estimateKspacePeakMemoryBytes') benchmark.kspaceEstimatedPeakMemoryBytes = result;
                    if (name === 'calculateKspace' && result) {
                        benchmark.kspaceResultCounts = {
                            trajectorySamples: result.t_ktraj?.length || 0,
                            adcSamples: result.t_adc?.length || 0,
                        };
                    }
                    return result;
                } finally {
                    const duration = performance.now() - start;
                    const phase = benchmark.phases[name] || { calls: 0, totalMs: 0, maxMs: 0, firstStart: start };
                    phase.calls++;
                    phase.totalMs += duration;
                    phase.maxMs = Math.max(phase.maxMs, duration);
                    benchmark.phases[name] = phase;
                }
            };
        }

        for (const name of [
            'parseSequenceBytes',
            'detectSequenceTiming',
            'decodeAllBlocks',
            'estimateKspaceCost',
            'estimateKspacePeakMemoryBytes',
            'calculateKspace',
        ]) wrap(name);
        // esbuild's namespace exports are getter-only, so individual methods
        // cannot be replaced. Replacing the writable global namespace keeps
        // the viewer's `Pulseq.method()` calls observable without editing it.
        window.Pulseq = instrumentedPulseq;

        const exportButton = document.getElementById('exportKspaceBtn');
        const readyObserver = new MutationObserver(() => {
            if (benchmark.pipelineStart && exportButton && !exportButton.disabled && !benchmark.readyAt) {
                benchmark.readyAt = performance.now();
            }
        });
        readyObserver.observe(exportButton, { attributes: true, attributeFilter: ['disabled'] });
    });
}

async function profileLoad(browser, filePath) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
        await page.goto(SERVER_URL, { waitUntil: 'load', timeout: 30_000 });
        await installInstrumentation(page);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
        await page.locator('#fileInput').setInputFiles(filePath);
        await waitForViewerReady(page, 180_000);
        const { profile } = await cdp.send('Profiler.stop');
        await cdp.detach();
        return summarizeCpuProfile(profile, filePath);
    } finally {
        await page.close();
    }
}

async function waitForViewerReady(page, timeoutMs) {
    await page.waitForFunction(() => {
        const button = document.getElementById('exportKspaceBtn');
        return !!button && !button.disabled && window.__seqeyesDebug.state().blocks > 0;
    }, null, { timeout: timeoutMs });
    await page.evaluate(() => {
        // MutationObserver should normally set this timestamp. Keep a
        // deterministic fallback for browsers that reflect the disabled DOM
        // property without delivering an attribute mutation.
        if (!window.__bseqBenchmark.readyAt) window.__bseqBenchmark.readyAt = performance.now();
    });
}

function summarizeCpuProfile(profile, filePath) {
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const totals = new Map();
    const samples = profile.samples || [];
    const deltas = profile.timeDeltas || [];
    for (let index = 0; index < samples.length; index++) {
        const node = nodes.get(samples[index]);
        if (!node) continue;
        const frame = node.callFrame;
        const name = frame.functionName || '(anonymous)';
        const url = frame.url || '';
        const key = `${name}|${url}|${frame.lineNumber}`;
        const existing = totals.get(key) || {
            functionName: name,
            url,
            lineNumber: frame.lineNumber + 1,
            selfTimeMs: 0,
            sampleCount: 0,
        };
        existing.selfTimeMs += (deltas[index] || 0) / 1000;
        existing.sampleCount++;
        totals.set(key, existing);
    }
    return {
        file: relative(baseDir, filePath),
        profileDurationMs: (profile.endTime - profile.startTime) / 1000,
        topFunctionsBySelfTime: [...totals.values()]
            .sort((left, right) => right.selfTimeMs - left.selfTimeMs)
            .slice(0, 30),
    };
}

function summarizeRuns(runs) {
    const metricNames = Object.keys(runs[0].metricsMs);
    const phaseNames = new Set(runs.flatMap(run => Object.keys(run.phases)));
    return {
        metricsMs: Object.fromEntries(metricNames.map(name => [name, stats(runs.map(run => run.metricsMs[name]))])),
        phases: Object.fromEntries([...phaseNames].map(name => [name, {
            medianTotalMs: median(runs.map(run => run.phases[name]?.totalMs || 0)),
            medianCalls: median(runs.map(run => run.phases[name]?.calls || 0)),
            maxSingleCallMs: Math.max(...runs.map(run => run.phases[name]?.maxMs || 0)),
        }])),
        state: runs[0].state,
        memoryAndRuntime: {
            medianJsHeapUsedBytes: median(runs.map(run => run.memoryAndRuntime.jsHeapUsedBytes).filter(Number.isFinite)),
            medianJsHeapUsedBeforeForcedGcBytes: median(runs.map(run => run.memoryAndRuntime.jsHeapUsedBeforeForcedGcBytes).filter(Number.isFinite)),
            medianJsHeapUsedAfterForcedGcBytes: median(runs.map(run => run.memoryAndRuntime.jsHeapUsedAfterForcedGcBytes).filter(Number.isFinite)),
            medianTaskDurationSeconds: median(runs.map(run => run.memoryAndRuntime.taskDurationSeconds).filter(Number.isFinite)),
        },
        consoleErrors: [...new Set(runs.flatMap(run => run.consoleErrors))],
    };
}

function compareBrowserState(seqRun, bseqRun) {
    const fields = ['blocks', 'totalDuration', 'adcTrajectorySamples', 'exportEnabled', 'waveformOverviewActive', 'kspaceSafetyActive'];
    const mismatches = [];
    for (const field of fields) {
        const left = seqRun.state[field];
        const right = bseqRun.state[field];
        const equal = typeof left === 'number' && typeof right === 'number'
            ? Math.abs(left - right) <= Math.max(1e-9, Math.abs(left) * 1e-9)
            : left === right;
        if (!equal) mismatches.push(`${field}: ${left} != ${right}`);
    }
    if (!seqRun.state.waveformCanvasVaried) mismatches.push('SEQ waveform canvas is blank');
    if (!bseqRun.state.waveformCanvasVaried) mismatches.push('BSEQ waveform canvas is blank');
    for (const field of ['kspaceEstimate', 'kspaceEstimatedPeakMemoryBytes', 'kspaceResultCounts']) {
        if (JSON.stringify(seqRun.state[field]) !== JSON.stringify(bseqRun.state[field])) {
            mismatches.push(`${field} differs between formats`);
        }
    }
    if (seqRun.consoleErrors.length) mismatches.push(`SEQ console errors: ${seqRun.consoleErrors.join('; ')}`);
    if (bseqRun.consoleErrors.length) mismatches.push(`BSEQ console errors: ${bseqRun.consoleErrors.join('; ')}`);
    return { passed: mismatches.length === 0, mismatches };
}

function summarize(pairReports) {
    const passed = pairReports.filter(pair => pair.parity.passed).length;
    const speedups = pairReports
        .map(pair => pair.speedupTextOverBinary.fileInputToReady)
        .filter(value => Number.isFinite(value) && value > 0);
    const kspaceSpeedups = pairReports
        .map(pair => pair.speedupTextOverBinary.kspace)
        .filter(value => Number.isFinite(value) && value > 0);
    const totalSeqBytes = pairReports.reduce((sum, pair) => sum + pair.files.seqBytes, 0);
    const totalBseqBytes = pairReports.reduce((sum, pair) => sum + pair.files.bseqBytes, 0);
    return {
        pairCount: pairReports.length,
        parityPassedPairs: passed,
        parityFailedPairs: pairReports.length - passed,
        totalSeqBytes,
        totalBseqBytes,
        aggregateBseqToSeqSizeRatio: totalSeqBytes > 0 ? totalBseqBytes / totalSeqBytes : null,
        readySpeedupGeometricMean: geometricMean(speedups),
        readySpeedupMedian: median(speedups),
        kspaceComparedPairs: kspaceSpeedups.length,
        kspaceSpeedupGeometricMean: geometricMean(kspaceSpeedups),
        kspaceSpeedupMedian: median(kspaceSpeedups),
    };
}

function renderMarkdown(report) {
    const lines = [
        '# SeqEyes standalone browser `.seq` vs `.bseq` full-load benchmark',
        '',
        `Generated: ${report.timestamp}`,
        '',
        `Browser state parity: **${report.summary.parityPassedPairs}/${report.summary.pairCount} pairs passed**`,
        '',
        `Geometric-mean file-input-to-ready speedup: **${formatNumber(report.summary.readySpeedupGeometricMean)}x**`,
        '',
        `Geometric-mean k-space speedup: **${formatNumber(report.summary.kspaceSpeedupGeometricMean)}x** (${report.summary.kspaceComparedPairs}/${report.summary.pairCount} pairs)`,
        '',
        `Aggregate paired storage: SEQ **${formatBytes(report.summary.totalSeqBytes)}**; BSEQ **${formatBytes(report.summary.totalBseqBytes)}**; BSEQ saves **${formatPercent(1 - report.summary.aggregateBseqToSeqSizeRatio)}**.`,
        '',
        '## File storage',
        '',
        '| Pair | SEQ size | BSEQ size | BSEQ/SEQ ratio | Storage saved |',
        '|---|---:|---:|---:|---:|',
    ];
    for (const pair of report.pairs) {
        lines.push(`| ${pair.name} | ${formatBytes(pair.files.seqBytes)} | ${formatBytes(pair.files.bseqBytes)} | ${formatNumber(pair.files.bseqToSeqSizeRatio)} | ${formatPercent(1 - pair.files.bseqToSeqSizeRatio)} |`);
    }
    lines.push(
        '',
        '## Load performance',
        '',
        '| Pair | Arb blocks | SEQ ready ms | BSEQ ready ms | Parse speedup | K-space SEQ ms | K-space BSEQ ms | K-space speedup | Residual SEQ ms | Residual BSEQ ms | Ready speedup | Parity |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
    );
    for (const pair of report.pairs) {
        lines.push(`| ${pair.name} | ${pair.descriptors.arbitraryGradientBlocks.blocksWithAny} | ${formatNumber(pair.seq.metricsMs.fileInputToReady.median)} | ${formatNumber(pair.bseq.metricsMs.fileInputToReady.median)} | ${formatNumber(pair.speedupTextOverBinary.parse)}x | ${formatNumber(phaseMedian(pair.seq, 'calculateKspace'))} | ${formatNumber(phaseMedian(pair.bseq, 'calculateKspace'))} | ${formatNumber(pair.speedupTextOverBinary.kspace)}x | ${formatNumber(pair.seq.metricsMs.unattributedViewerPreparationAndRender.median)} | ${formatNumber(pair.bseq.metricsMs.unattributedViewerPreparationAndRender.median)} | ${formatNumber(pair.speedupTextOverBinary.fileInputToReady)}x | ${pair.parity.passed ? 'PASS' : 'FAIL'} |`);
    }
    if (report.extremeCpuProfiles) {
        const extremePair = report.pairs.find(pair => pair.name === EXTREME_NAME);
        if (extremePair) {
            const state = extremePair.seq.state;
            lines.push('', `## ${EXTREME_NAME} resource breakdown`, '');
            lines.push(`- K-space estimate: ${state.kspaceEstimate.rasterSamples.toLocaleString()} raster samples, ${state.kspaceEstimate.adcSamples.toLocaleString()} ADC samples, and ${state.kspaceEstimate.gridCandidatePoints.toLocaleString()} grid candidates.`);
            lines.push(`- Conservative peak-memory estimate: ${formatBytes(state.kspaceEstimatedPeakMemoryBytes)}.`);
            lines.push(`- Calculated result: ${state.kspaceResultCounts.trajectorySamples.toLocaleString()} trajectory samples and ${state.kspaceResultCounts.adcSamples.toLocaleString()} ADC samples.`);
            lines.push(`- Median pre-GC JavaScript heap: SEQ ${formatBytes(extremePair.seq.memoryAndRuntime.medianJsHeapUsedBeforeForcedGcBytes)}; BSEQ ${formatBytes(extremePair.bseq.memoryAndRuntime.medianJsHeapUsedBeforeForcedGcBytes)}.`);
            lines.push(`- Median retained JavaScript heap after forced GC: SEQ ${formatBytes(extremePair.seq.memoryAndRuntime.medianJsHeapUsedAfterForcedGcBytes)}; BSEQ ${formatBytes(extremePair.bseq.memoryAndRuntime.medianJsHeapUsedAfterForcedGcBytes)}.`);
            lines.push(`- Median longest load task: SEQ ${formatNumber(extremePair.seq.metricsMs.longestTask.median)} ms; BSEQ ${formatNumber(extremePair.bseq.metricsMs.longestTask.median)} ms.`);
            lines.push(`- Median k-space panel opening: SEQ ${formatNumber(extremePair.seq.metricsMs.kspaceToggleMs.median)} ms; BSEQ ${formatNumber(extremePair.bseq.metricsMs.kspaceToggleMs.median)} ms.`);
        }
        lines.push('', `## ${EXTREME_NAME} CPU profile`, '');
        for (const format of ['seq', 'bseq']) {
            const profile = report.extremeCpuProfiles[format];
            lines.push(`### ${format.toUpperCase()}`, '', '| Function | Self time ms | Samples |', '|---|---:|---:|');
            for (const item of profile.topFunctionsBySelfTime.slice(0, 15)) {
                lines.push(`| ${escapeTable(item.functionName)} | ${formatNumber(item.selfTimeMs)} | ${item.sampleCount} |`);
            }
            lines.push('');
        }
    }
    const failures = report.pairs.filter(pair => !pair.parity.passed);
    if (failures.length) {
        lines.push('## Browser parity failures', '');
        for (const pair of failures) {
            lines.push(`### ${pair.name}`, '');
            for (const mismatch of pair.parity.mismatches) lines.push(`- ${mismatch}`);
            lines.push('');
        }
    }
    lines.push('> The browser-ready metric includes local File.arrayBuffer transport, parsing, timing detection, block decoding, display serialization/overview construction, bounded k-space policy/calculation, and initial drawing. It excludes the progress overlay’s intentional 500 ms fade delay.', '');
    return lines.join('\n');
}

async function ensureServer() {
    if (await serverResponding()) return null;
    const child = spawn(process.execPath, ['test/browser/serve-web.cjs'], {
        cwd: pluginDir,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errorText = '';
    child.stderr.on('data', chunk => { errorText += chunk.toString(); });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (await serverResponding()) return child;
        if (child.exitCode !== null) fail(`Browser server exited early: ${errorText}`);
        await delay(100);
    }
    child.kill('SIGTERM');
    fail(`Timed out starting browser server: ${errorText}`);
}

async function serverResponding() {
    try {
        const response = await fetch(SERVER_URL, { signal: AbortSignal.timeout(500) });
        return response.ok;
    } catch {
        return false;
    }
}

async function stopServer(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise(resolveExit => child.once('exit', resolveExit)),
        delay(2000),
    ]);
}

function parseArguments(args) {
    const options = {
        input: DEFAULT_INPUT,
        output: DEFAULT_OUTPUT,
        iterations: 3,
        timeoutMs: 180_000,
        profileExtreme: true,
        forceKspace: false,
        viewport: { width: 1280, height: 900 },
    };
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--quick') options.iterations = 1;
        else if (argument === '--iterations') options.iterations = positiveInteger(requireValue(args, ++index, argument), argument);
        else if (argument === '--input') options.input = resolve(requireValue(args, ++index, argument));
        else if (argument === '--output') options.output = resolve(requireValue(args, ++index, argument));
        else if (argument === '--no-profile') options.profileExtreme = false;
        else if (argument === '--force-kspace') options.forceKspace = true;
        else if (argument === '--timeout-ms') options.timeoutMs = positiveInteger(requireValue(args, ++index, argument), argument);
        else if (argument === '--help' || argument === '-h') {
            console.log('Usage: run_browser_benchmark.cjs [--quick] [--iterations N] [--input PATH] [--output PATH] [--no-profile] [--force-kspace] [--timeout-ms N]');
            process.exit(0);
        } else fail(`Unknown argument: ${argument}`);
    }
    return options;
}

function sumPhaseTotals(phases) {
    return Object.values(phases).reduce((sum, phase) => sum + phase.totalMs, 0);
}

function phaseMedian(summary, name) {
    return summary.phases[name]?.medianTotalMs ?? 0;
}

function stats(values) {
    return {
        median: median(values),
        min: Math.min(...values),
        max: Math.max(...values),
        samples: values,
    };
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function geometricMean(values) {
    if (!values.length) return null;
    return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function ratio(left, right) {
    return right > 0 ? left / right : null;
}

function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

function formatBytes(value) {
    if (!Number.isFinite(value)) return 'n/a';
    const units = ['bytes', 'KiB', 'MiB', 'GiB'];
    let scaled = value;
    let index = 0;
    while (scaled >= 1024 && index < units.length - 1) {
        scaled /= 1024;
        index++;
    }
    return `${scaled.toFixed(index >= 2 ? 2 : 1)} ${units[index]}`;
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function escapeTable(value) {
    return String(value).replace(/\|/g, '\\|');
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

function delay(milliseconds) {
    return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

function fail(message) {
    console.error(message);
    process.exit(2);
}
