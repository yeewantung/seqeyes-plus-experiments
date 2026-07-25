#!/usr/bin/env node
'use strict';

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const scriptDir = __dirname;
const baseDir = resolve(scriptDir, '..', '..', '..');
const defaults = {
    parser: join(baseDir, 'bseq', 'benchmark_results', 'latest.json'),
    browser: join(baseDir, 'bseq', 'benchmark_results', 'latest-browser.json'),
    outputDir: join(baseDir, 'bseq', 'benchmark_results'),
};

main();

function main() {
    const options = parseArguments(process.argv.slice(2));
    const parserReport = readJson(options.parser, 'parser');
    const browserReport = readJson(options.browser, 'browser');
    const parserByName = new Map(parserReport.pairs.map(pair => [pair.name, pair]));
    const rows = browserReport.pairs.map(pair => {
        const parser = parserByName.get(pair.name);
        if (!parser) throw new Error(`Browser pair ${pair.name} is absent from the parser report`);
        return {
            name: pair.name,
            category: pair.category,
            arbitraryBlocks: pair.descriptors?.arbitraryGradientBlocks?.blocksWithAny || 0,
            totalBlocks: pair.descriptors?.blocks || 0,
            parser: parser.performance?.parsePreloadedBytes?.speedupTextOverBinary,
            ready: pair.speedupTextOverBinary?.fileInputToReady,
            kspace: pair.speedupTextOverBinary?.kspace,
            storage: parser.files?.bseqBytes > 0 ? parser.files.seqBytes / parser.files.bseqBytes : null,
        };
    });
    if (rows.length === 0) throw new Error('No common benchmark pairs were found');

    mkdirSync(options.outputDir, { recursive: true });
    const speedupPath = join(options.outputDir, 'speedup-comparison.svg');
    const breakdownPath = join(options.outputDir, 'wave-test-r3x2-breakdown.svg');
    writeFileSync(speedupPath, renderSpeedupComparison(rows, parserReport, browserReport));
    writeFileSync(breakdownPath, renderExtremeBreakdown(browserReport));
    console.log(`Speedup comparison plot: ${speedupPath}`);
    console.log(`Extreme-case breakdown plot: ${breakdownPath}`);
}

function renderSpeedupComparison(inputRows, parserReport, browserReport) {
    const rows = [...inputRows].sort((a, b) =>
        b.arbitraryBlocks - a.arbitraryBlocks || b.totalBlocks - a.totalBlocks || a.name.localeCompare(b.name));
    const width = 1600;
    const rowHeight = 44;
    const top = 260;
    const bottom = 90;
    const height = top + rows.length * rowHeight + bottom;
    const left = 370;
    const plotRight = 1180;
    const plotWidth = plotRight - left;
    const values = rows.flatMap(row => [row.parser, row.ready, row.kspace, row.storage]).filter(isPositiveFinite);
    const domainMin = Math.min(0.5, 2 ** Math.floor(Math.log2(Math.min(...values))));
    const domainMax = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(...values) * 1.08)));
    const x = value => left + (Math.log2(value) - Math.log2(domainMin)) /
        (Math.log2(domainMax) - Math.log2(domainMin)) * plotWidth;
    const ticks = [];
    for (let value = domainMin; value <= domainMax * 1.0001; value *= 2) ticks.push(value);
    const parserGeo = geometricMean(rows.map(row => row.parser).filter(isPositiveFinite));
    const readyGeo = geometricMean(rows.map(row => row.ready).filter(isPositiveFinite));
    const kspaceGeo = geometricMean(rows.map(row => row.kspace).filter(isPositiveFinite));
    const totalSeqBytes = parserReport.summary?.totalSeqBytes;
    const totalBseqBytes = parserReport.summary?.totalBseqBytes;
    const aggregateStorage = totalBseqBytes > 0 ? totalSeqBytes / totalBseqBytes : NaN;
    const body = [];

    body.push(svgHeader(width, height));
    body.push(`<rect width="${width}" height="${height}" fill="#f8fafc"/>`);
    body.push(text(55, 58, 'BSEQ comparison: storage and parser gains versus complete viewer work', 30, '#0f172a', 700));
    body.push(text(55, 92, 'Each value is SEQ ÷ BSEQ (bytes or median time). Right of 1× favors BSEQ; left favors SEQ.', 17, '#475569'));
    body.push(`<rect x="55" y="118" width="1490" height="55" rx="10" fill="#e2e8f0"/>`);
    body.push(metricSummary(78, 141, '#7c3aed', 'Aggregate storage reduction', aggregateStorage));
    body.push(metricSummary(430, 141, '#2563eb', 'Parser geometric mean', parserGeo));
    body.push(metricSummary(790, 141, '#f59e0b', 'File-to-ready geometric mean', readyGeo));
    body.push(metricSummary(1190, 141, '#059669', 'K-space geometric mean', kspaceGeo));

    const plotTop = top - 5;
    const plotBottom = top + rows.length * rowHeight;
    const breakEvenX = x(1);
    body.push(`<rect x="${left}" y="${plotTop}" width="${Math.max(0, breakEvenX - left)}" height="${plotBottom - plotTop}" fill="#fef2f2"/>`);
    body.push(`<rect x="${breakEvenX}" y="${plotTop}" width="${Math.max(0, plotRight - breakEvenX)}" height="${plotBottom - plotTop}" fill="#f0fdf4"/>`);
    for (const tick of ticks) {
        const tickX = x(tick);
        const isOne = Math.abs(tick - 1) < 1e-9;
        body.push(`<line x1="${tickX}" y1="${plotTop - 22}" x2="${tickX}" y2="${plotBottom}" stroke="${isOne ? '#334155' : '#cbd5e1'}" stroke-width="${isOne ? 2.5 : 1}" ${isOne ? '' : 'stroke-dasharray="3 5"'}/>`);
        body.push(text(tickX, plotTop - 30, `${formatRatio(tick)}`, 14, '#475569', isOne ? 700 : 500, 'middle'));
    }
    body.push(text(left, plotTop - 55, 'Per-sequence median speedup (log₂ scale)', 15, '#334155', 650));
    body.push(text(1225, plotTop - 55, 'Storage', 14, '#6d28d9', 700, 'middle'));
    body.push(text(1320, plotTop - 55, 'Parser', 14, '#2563eb', 700, 'middle'));
    body.push(text(1415, plotTop - 55, 'Ready', 14, '#b45309', 700, 'middle'));
    body.push(text(1510, plotTop - 55, 'K-space', 14, '#047857', 700, 'middle'));

    rows.forEach((row, index) => {
        const rowTop = top + index * rowHeight;
        const cy = rowTop + rowHeight / 2;
        if (row.name === 'wave_test_R3x2') {
            body.push(`<rect x="40" y="${rowTop}" width="1505" height="${rowHeight}" rx="5" fill="#fef3c7" opacity="0.8"/>`);
        } else if (index % 2 === 1) {
            body.push(`<rect x="40" y="${rowTop}" width="1505" height="${rowHeight}" fill="#ffffff" opacity="0.72"/>`);
        }
        body.push(`<line x1="${left}" y1="${cy}" x2="${plotRight}" y2="${cy}" stroke="#e2e8f0"/>`);
        body.push(text(55, cy - 1, row.name, 14, '#0f172a', row.name === 'wave_test_R3x2' ? 700 : 500));
        body.push(text(55, cy + 15, `${row.arbitraryBlocks.toLocaleString()} arbitrary-gradient / ${row.totalBlocks.toLocaleString()} total blocks`, 11, '#64748b'));
        if (isPositiveFinite(row.storage)) {
            body.push(diamondMarker(x(row.storage), cy - 12, '#7c3aed', `${row.name}: storage ${formatRatio(row.storage)}`));
        }
        if (isPositiveFinite(row.parser)) {
            body.push(circleMarker(x(row.parser), cy - 4, '#2563eb', `${row.name}: parser ${formatRatio(row.parser)}`));
        }
        if (isPositiveFinite(row.ready)) {
            body.push(squareMarker(x(row.ready), cy + 4, '#f59e0b', `${row.name}: file-to-ready ${formatRatio(row.ready)}`));
        }
        if (isPositiveFinite(row.kspace)) {
            body.push(triangleMarker(x(row.kspace), cy + 12, '#059669', `${row.name}: k-space ${formatRatio(row.kspace)}`));
        }
        body.push(text(1225, cy + 5, formatRatio(row.storage), 13, '#6d28d9', 600, 'middle'));
        body.push(text(1320, cy + 5, formatRatio(row.parser), 13, '#1e40af', 600, 'middle'));
        body.push(text(1415, cy + 5, formatRatio(row.ready), 13, '#92400e', 600, 'middle'));
        body.push(text(1510, cy + 5, formatRatio(row.kspace), 13, '#065f46', 600, 'middle'));
    });

    const legendY = plotBottom + 42;
    body.push(diamondMarker(65, legendY, '#7c3aed', 'Storage reduction'));
    body.push(text(82, legendY + 5, 'SEQ bytes ÷ BSEQ bytes', 14, '#334155'));
    body.push(circleMarker(300, legendY, '#2563eb', 'Parser speedup'));
    body.push(text(317, legendY + 5, 'preloaded-byte parser', 14, '#334155'));
    body.push(squareMarker(545, legendY, '#f59e0b', 'Ready speedup'));
    body.push(text(562, legendY + 5, 'local file input → viewer ready', 14, '#334155'));
    body.push(triangleMarker(875, legendY, '#059669', 'K-space speedup'));
    body.push(text(892, legendY + 5, 'bounded estimate/calculation phase', 14, '#334155'));
    body.push(text(55, height - 25,
        `Parser report ${shortDate(parserReport.timestamp)} · Browser report ${shortDate(browserReport.timestamp)} · ${rows.length} matched pairs`,
        13, '#64748b'));
    body.push('</svg>\n');
    return body.join('\n');
}

function renderExtremeBreakdown(browserReport) {
    const pair = browserReport.pairs.find(item => item.name === 'wave_test_R3x2');
    if (!pair) throw new Error('wave_test_R3x2 is absent from the browser report');
    const width = 1500;
    const height = 900;
    const left = 260;
    const right = 1390;
    const barWidth = right - left;
    const formats = [
        { key: 'seq', label: 'SEQ', y: 230 },
        { key: 'bseq', label: 'BSEQ', y: 330 },
    ];
    const phases = [
        { key: 'read', label: 'File read', color: '#94a3b8', value: summary => summary.metricsMs.fileRead.median },
        { key: 'parse', label: 'Parse', color: '#2563eb', value: summary => phaseMedian(summary, 'parseSequenceBytes') },
        { key: 'timing', label: 'Timing', color: '#8b5cf6', value: summary => phaseMedian(summary, 'detectSequenceTiming') },
        { key: 'decode', label: 'Decode', color: '#06b6d4', value: summary => phaseMedian(summary, 'decodeAllBlocks') },
        { key: 'kspace', label: 'K-space', color: '#059669', value: summary => phaseMedian(summary, 'calculateKspace') },
        { key: 'residual', label: 'Viewer prep + render', color: '#f59e0b', value: summary => summary.metricsMs.unattributedViewerPreparationAndRender.median },
    ];
    const totalMax = Math.max(...formats.map(format => pair[format.key].metricsMs.fileInputToReady.median));
    const xScale = value => value / totalMax * barWidth;
    const body = [svgHeader(width, height), `<rect width="${width}" height="${height}" fill="#f8fafc"/>`];

    body.push(text(55, 58, 'wave_test_R3x2: complete-load cost and memory pressure', 30, '#0f172a', 700));
    body.push(text(55, 92, 'The binary parser is faster, but k-space dominates this extreme arbitrary-gradient workload.', 17, '#475569'));
    body.push(`<rect x="55" y="120" width="1390" height="65" rx="10" fill="#e2e8f0"/>`);
    body.push(metricSummary(80, 147, '#2563eb', 'Parser speedup', pair.speedupTextOverBinary.parse));
    body.push(metricSummary(495, 147, '#059669', 'K-space speedup', pair.speedupTextOverBinary.kspace));
    body.push(metricSummary(895, 147, '#f59e0b', 'File-to-ready speedup', pair.speedupTextOverBinary.fileInputToReady));

    body.push(text(55, 216, 'Median load-time breakdown', 19, '#0f172a', 700));
    formats.forEach(format => {
        const summary = pair[format.key];
        const total = summary.metricsMs.fileInputToReady.median;
        body.push(text(190, format.y + 34, format.label, 19, '#0f172a', 700, 'end'));
        let currentX = left;
        phases.forEach(phase => {
            const value = Math.max(0, phase.value(summary) || 0);
            const widthPx = xScale(value);
            body.push(`<rect x="${currentX}" y="${format.y}" width="${widthPx}" height="64" fill="${phase.color}"><title>${format.label} ${phase.label}: ${formatMs(value)}</title></rect>`);
            if (widthPx > 70) body.push(text(currentX + widthPx / 2, format.y + 38, formatMs(value), 13, '#ffffff', 700, 'middle'));
            currentX += widthPx;
        });
        body.push(text(right + 12, format.y + 38, formatMs(total), 16, '#0f172a', 700));
    });
    let legendX = 260;
    phases.forEach(phase => {
        body.push(`<rect x="${legendX}" y="414" width="14" height="14" rx="2" fill="${phase.color}"/>`);
        body.push(text(legendX + 21, 426, phase.label, 13, '#475569'));
        legendX += 80 + phase.label.length * 7;
    });

    body.push(`<line x1="55" y1="465" x2="1445" y2="465" stroke="#cbd5e1"/>`);
    body.push(text(55, 510, 'JavaScript heap before and after forced garbage collection', 19, '#0f172a', 700));
    const memoryRows = [
        { y: 550, label: 'SEQ before GC', value: pair.seq.memoryAndRuntime.medianJsHeapUsedBeforeForcedGcBytes, color: '#64748b' },
        { y: 602, label: 'BSEQ before GC', value: pair.bseq.memoryAndRuntime.medianJsHeapUsedBeforeForcedGcBytes, color: '#334155' },
        { y: 654, label: 'SEQ after GC', value: pair.seq.memoryAndRuntime.medianJsHeapUsedAfterForcedGcBytes, color: '#93c5fd' },
        { y: 706, label: 'BSEQ after GC', value: pair.bseq.memoryAndRuntime.medianJsHeapUsedAfterForcedGcBytes, color: '#60a5fa' },
    ];
    const memoryMax = Math.max(...memoryRows.map(row => row.value));
    memoryRows.forEach(row => {
        const widthPx = row.value / memoryMax * 700;
        body.push(text(225, row.y + 25, row.label, 14, '#334155', 600, 'end'));
        body.push(`<rect x="${left}" y="${row.y}" width="${widthPx}" height="34" rx="4" fill="${row.color}"><title>${row.label}: ${formatBytes(row.value)}</title></rect>`);
        body.push(text(left + widthPx + 10, row.y + 24, formatBytes(row.value), 14, '#0f172a', 650));
    });

    const state = pair.seq.state;
    const factsX = 1115;
    body.push(`<rect x="${factsX - 30}" y="525" width="360" height="220" rx="12" fill="#fff7ed" stroke="#fdba74"/>`);
    body.push(text(factsX, 558, 'Workload facts', 18, '#9a3412', 700));
    const facts = [
        `SEQ ${formatBytes(pair.files.seqBytes)} → BSEQ ${formatBytes(pair.files.bseqBytes)}`,
        `${pair.descriptors.arbitraryGradientBlocks.blocksWithAny.toLocaleString()} arbitrary-gradient blocks`,
        `${state.kspaceEstimate.rasterSamples.toLocaleString()} raster samples`,
        `${state.kspaceEstimate.gridCandidatePoints.toLocaleString()} grid candidates`,
        `${state.kspaceResultCounts.trajectorySamples.toLocaleString()} trajectory points`,
        `${formatBytes(state.kspaceEstimatedPeakMemoryBytes)} estimated peak`,
    ];
    facts.forEach((fact, index) => body.push(text(factsX, 592 + index * 30, `• ${fact}`, 14, '#7c2d12')));

    const kspaceShareSeq = phaseMedian(pair.seq, 'calculateKspace') / pair.seq.metricsMs.fileInputToReady.median * 100;
    const kspaceShareBseq = phaseMedian(pair.bseq, 'calculateKspace') / pair.bseq.metricsMs.fileInputToReady.median * 100;
    body.push(`<rect x="55" y="786" width="1390" height="70" rx="10" fill="#ecfdf5" stroke="#6ee7b7"/>`);
    body.push(text(80, 816,
        `K-space consumes ${formatNumber(kspaceShareSeq, 1)}% of SEQ ready time and ${formatNumber(kspaceShareBseq, 1)}% of BSEQ ready time.`,
        17, '#065f46', 700));
    body.push(text(80, 841,
        'Conclusion: faster binary parsing alone cannot materially shorten this load; k-space policy and computation are the primary optimization target.',
        15, '#047857'));
    body.push(text(55, height - 18, `Browser report ${shortDate(browserReport.timestamp)} · medians from ${browserReport.iterationsPerFormat} fresh-page iteration(s) per format`, 13, '#64748b'));
    body.push('</svg>\n');
    return body.join('\n');
}

function parseArguments(args) {
    const options = { ...defaults };
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--parser') options.parser = resolve(requireValue(args, ++index, arg));
        else if (arg === '--browser') options.browser = resolve(requireValue(args, ++index, arg));
        else if (arg === '--output-dir') options.outputDir = resolve(requireValue(args, ++index, arg));
        else if (arg === '--help' || arg === '-h') {
            console.log('Usage: generate_plots.cjs [--parser report.json] [--browser report.json] [--output-dir directory]');
            process.exit(0);
        } else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function requireValue(args, index, option) {
    if (!args[index]) throw new Error(`${option} requires a value`);
    return args[index];
}

function readJson(path, label) {
    if (!existsSync(path)) throw new Error(`The ${label} report does not exist: ${path}`);
    return JSON.parse(readFileSync(path, 'utf8'));
}

function phaseMedian(summary, name) {
    return summary.phases?.[name]?.medianTotalMs || 0;
}

function geometricMean(values) {
    return values.length ? Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length) : NaN;
}

function isPositiveFinite(value) {
    return Number.isFinite(value) && value > 0;
}

function formatRatio(value) {
    return isPositiveFinite(value) ? `${formatNumber(value, value >= 10 ? 1 : 2)}×` : 'n/a';
}

function formatMs(value) {
    return value >= 1000 ? `${formatNumber(value / 1000, 2)} s` : `${formatNumber(value, 1)} ms`;
}

function formatBytes(value) {
    if (!Number.isFinite(value)) return 'n/a';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let current = value;
    let index = 0;
    while (current >= 1024 && index < units.length - 1) {
        current /= 1024;
        index++;
    }
    return `${formatNumber(current, index >= 2 ? 2 : 1)} ${units[index]}`;
}

function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return 'n/a';
    return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function shortDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeXml(String(value)) : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function svgHeader(width, height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
}

function text(x, y, value, size, color, weight = 400, anchor = 'start') {
    return `<text x="${x}" y="${y}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function metricSummary(x, y, color, label, value) {
    return `<circle cx="${x}" cy="${y + 7}" r="7" fill="${color}"/>${text(x + 17, y, label, 14, '#475569', 600)}${text(x + 17, y + 27, formatRatio(value), 20, '#0f172a', 750)}`;
}

function circleMarker(x, y, color, title) {
    return `<circle cx="${x}" cy="${y}" r="5.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(title)}</title></circle>`;
}

function squareMarker(x, y, color, title) {
    return `<rect x="${x - 5.5}" y="${y - 5.5}" width="11" height="11" rx="1" fill="${color}" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(title)}</title></rect>`;
}

function triangleMarker(x, y, color, title) {
    return `<path d="M ${x} ${y - 6.5} L ${x + 6} ${y + 5.5} L ${x - 6} ${y + 5.5} Z" fill="${color}" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(title)}</title></path>`;
}

function diamondMarker(x, y, color, title) {
    if (!Number.isFinite(x)) return '';
    return `<path d="M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z" fill="${color}" stroke="#ffffff" stroke-width="1"><title>${escapeXml(title)}</title></path>`;
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]);
}
