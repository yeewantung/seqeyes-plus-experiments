function export_pulseq_matlab_reference(inputPath, outputPath, pulseqPath, includeKspace)
% Export official Pulseq MATLAB waveform/k-space checkpoints as JSON.
% This function does not import or call SeqEyes.

if nargin < 3, pulseqPath = ''; end
if nargin < 4, includeKspace = true; end
configurePulseq(pulseqPath);

frozenB0Tesla = 3.0;
rfPhaseMinRelativeMagnitude = 1e-6;
seq = mr.Sequence(mr.opts('B0', frozenB0Tesla));
seq.read(inputPath);
assertFrozenB0(seq, frozenB0Tesla);
[waveData, ~, ~, tAdc] = seq.waveforms_and_times(true);
[durationSec, blockCount, eventCount] = seq.duration();

payload.schemaVersion = 1;
payload.reference = 'Pulseq MATLAB';
payload.referenceVersion = version;
payload.inputPath = inputPath;
payload.b0Tesla = frozenB0Tesla;
payload.rfPhaseMinRelativeMagnitude = rfPhaseMinRelativeMagnitude;
payload.sequence.durationSec = double(durationSec);
payload.sequence.blockCount = double(blockCount);
payload.sequence.eventCounts = double(eventCount(:).');
payload.sequence.adcSampleCount = numel(tAdc);
payload.checkpoints.selectionRule = 'first-middle-last plus extrema, native Pulseq MATLAB arrays';
payload.checkpoints.gxHzPerM = realCheckpoints(waveData{1});
payload.checkpoints.gyHzPerM = realCheckpoints(waveData{2});
payload.checkpoints.gzHzPerM = realCheckpoints(waveData{3});
if numel(waveData) >= 4
    payload.checkpoints.rfMagnitude = rfCheckpoints(waveData{4}, false, rfPhaseMinRelativeMagnitude);
    payload.checkpoints.rfPhaseRad = rfCheckpoints(waveData{4}, true, rfPhaseMinRelativeMagnitude);
    payload.rfPhaseSelection = rfPhaseSelectionStats(waveData{4}, rfPhaseMinRelativeMagnitude);
else
    payload.checkpoints.rfMagnitude = struct([]);
    payload.checkpoints.rfPhaseRad = struct([]);
    payload.rfPhaseSelection = struct('totalSampleCount', 0, 'eligibleSampleCount', 0, ...
        'excludedSampleCount', 0, 'magnitudeThreshold', 0);
end
payload.checkpoints.adcTimesSec = timeCheckpoints(tAdc);

payload.kspace.units = '1/m';
payload.kspace.calculated = logical(includeKspace);
if includeKspace
    [kAdc, kTimeAdc] = seq.calculateKspacePP();
    nAdc = size(kAdc, 2);
else
    kAdc = []; kTimeAdc = []; nAdc = 0;
end
payload.kspace.adcCount = nAdc;
if includeKspace && nAdc > 0
    mid = floor((nAdc - 1) / 2) + 1;
    payload.kspace.first = double(kAdc(:, 1).');
    payload.kspace.middle = double(kAdc(:, mid).');
    payload.kspace.last = double(kAdc(:, end).');
    payload.kspace.min = double(min(kAdc, [], 2).');
    payload.kspace.max = double(max(kAdc, [], 2).');
    payload.kspace.adcTimeFirstSec = double(kTimeAdc(1));
    payload.kspace.adcTimeLastSec = double(kTimeAdc(end));
else
    payload.kspace.first = [0 0 0]; payload.kspace.middle = [0 0 0]; payload.kspace.last = [0 0 0];
    payload.kspace.min = [0 0 0]; payload.kspace.max = [0 0 0];
end

outDir = fileparts(outputPath);
if ~isempty(outDir) && ~isfolder(outDir), mkdir(outDir); end
fid = fopen(outputPath, 'w');
assert(fid >= 0, 'Cannot open output: %s', outputPath);
cleanup = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s\n', jsonencode(payload, PrettyPrint=true));
end

function result = realCheckpoints(series)
if isempty(series), result = struct([]); return; end
t = real(series(1, :)); v = real(series(2, :)); idx = selectIndices(v);
result = makeValues(t, v, idx);
end

function result = rfCheckpoints(series, phaseMode, minRelativeMagnitude)
if isempty(series), result = struct([]); return; end
t = real(series(1, :)); raw = series(2, :);
if phaseMode
    v = angle(raw);
    threshold = minRelativeMagnitude * max(abs(raw));
    eligible = find(abs(raw) >= threshold);
    if isempty(eligible), result = struct([]); return; end
    localIdx = unique([selectIndices(abs(raw(eligible))), selectIndices(v(eligible))]);
    idx = eligible(localIdx);
else
    v = abs(raw);
    idx = unique([selectIndices(abs(raw)), selectIndices(angle(raw))]);
end
result = makeValues(t, v, idx);
end

function assertFrozenB0(seq, expectedB0Tesla)
explicitB0 = seq.getDefinition('B0');
if isempty(explicitB0), return; end
assert(numel(explicitB0) == 1 && abs(double(explicitB0(1)) - expectedB0Tesla) <= 1e-12, ...
    'Fixture B0 must be absent or equal to the frozen %.1f T test field strength.', expectedB0Tesla);
end

function result = rfPhaseSelectionStats(series, minRelativeMagnitude)
magnitude = abs(series(2, :));
threshold = minRelativeMagnitude * max(magnitude);
eligibleCount = sum(magnitude >= threshold);
result.totalSampleCount = numel(magnitude);
result.eligibleSampleCount = eligibleCount;
result.excludedSampleCount = numel(magnitude) - eligibleCount;
result.magnitudeThreshold = threshold;
end

function result = timeCheckpoints(t)
t = double(t(:).');
if isempty(t), result = struct([]); return; end
idx = unique([1, floor((numel(t)-1)/2)+1, numel(t)]);
result = struct('index', num2cell(idx-1), 'timeSec', num2cell(t(idx)));
end

function idx = selectIndices(v)
n = numel(v); if n == 0, idx = []; return; end
[~, iMin] = min(v); [~, iMax] = max(v);
idx = unique([1, floor((n-1)/2)+1, n, iMin, iMax]);
end

function result = makeValues(t, v, idx)
result = struct('index', num2cell(idx-1), 'timeSec', num2cell(double(t(idx))), 'value', num2cell(double(v(idx))));
end

function configurePulseq(requestedPath)
resolvedPath = requestedPath;
if isempty(resolvedPath), resolvedPath = getenv('PULSEQ_MATLAB_PATH'); end
if ~isempty(resolvedPath)
    assert(isfolder(resolvedPath), 'Pulseq MATLAB path does not exist: %s', resolvedPath);
    addpath(genpath(resolvedPath));
end
assert(~isempty(which('mr.Sequence')), ...
    ['Pulseq MATLAB is unavailable. Pass pulseqPath, set PULSEQ_MATLAB_PATH, ' ...
    'or add Pulseq MATLAB to the MATLAB path before calling this function.']);
end
