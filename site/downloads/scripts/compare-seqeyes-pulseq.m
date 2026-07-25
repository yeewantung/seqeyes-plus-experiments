function compare_seqeyes_to_pulseq_matlab(inputPath, checkpointPath, outputPath, pulseqPath)
% Compare SeqEyes native physical-time checkpoints with official Pulseq MATLAB.
% Reference arrays are evaluated at SeqEyes' predefined checkpoint times.

if nargin < 4, pulseqPath = ''; end
configurePulseq(pulseqPath);
observed = jsondecode(fileread(checkpointPath));
frozenB0Tesla = 3.0;
rfPhaseMinRelativeMagnitude = 1e-6;
seq = mr.Sequence(mr.opts('B0', frozenB0Tesla));
seq.read(inputPath);
assertFrozenB0(seq, frozenB0Tesla);
[waveData, ~, ~, tAdc] = seq.waveforms_and_times(true);
[kAdc, ~] = seq.calculateKspacePP();
[durationSec, blockCount, ~] = seq.duration();

result.schemaVersion = 1;
result.experiment = 'E3';
result.caseId = observed.caseId;
result.reference = 'Pulseq MATLAB R2024b';
result.b0Tesla = frozenB0Tesla;
result.rfPhaseMinRelativeMagnitude = rfPhaseMinRelativeMagnitude;
if isfield(observed, 'rfPhaseSelection'), result.rfPhaseSelection = observed.rfPhaseSelection; end
result.interpolation = 'linear physical-time interpolation; exact duplicate times use last value; outside event support is zero';
result.sequence.durationErrorSec = abs(double(observed.sequence.durationSec) - double(durationSec));
result.sequence.blockCountExact = double(observed.sequence.blockCount) == double(blockCount);
result.sequence.adcCountExact = double(observed.sequence.adcSampleCount) == numel(tAdc);

result.channels.gxHzPerM = compareReal(observed.checkpoints.gxHzPerM, waveData{1}, 5e-6);
result.channels.gyHzPerM = compareReal(observed.checkpoints.gyHzPerM, waveData{2}, 5e-6);
result.channels.gzHzPerM = compareReal(observed.checkpoints.gzHzPerM, waveData{3}, 5e-6);
if numel(waveData) >= 4
    result.channels.rfMagnitude = compareRf(observed.checkpoints.rfMagnitude, waveData{4}, false, 1e-3, 0);
    result.channels.rfPhaseRad = compareRf(observed.checkpoints.rfPhaseRad, waveData{4}, true, 1e-3, rfPhaseMinRelativeMagnitude);
else
    result.channels.rfMagnitude = emptyComparison(1e-3);
    result.channels.rfPhaseRad = emptyComparison(1e-3);
end

fields = {'first','middle','last','min','max'};
nAdc = size(kAdc, 2); mid = floor((nAdc - 1) / 2) + 1;
reference.first = double(kAdc(:, 1).'); reference.middle = double(kAdc(:, mid).'); reference.last = double(kAdc(:, end).');
reference.min = double(min(kAdc, [], 2).'); reference.max = double(max(kAdc, [], 2).');
errors = [];
for index = 1:numel(fields)
    field = fields{index};
    errors = [errors abs(double(observed.kspace.(field)(:).') - reference.(field))]; %#ok<AGROW>
end
result.kspace.maxAbsoluteErrorPerM = max(errors);
result.kspace.rmsePerM = sqrt(mean(errors.^2));
result.kspace.tolerancePerM = 1e-5;
result.kspace.pass = result.kspace.maxAbsoluteErrorPerM <= result.kspace.tolerancePerM;
channelNames = fieldnames(result.channels);
channelPass = true;
for index = 1:numel(channelNames), channelPass = channelPass && result.channels.(channelNames{index}).pass; end
result.pass = result.sequence.durationErrorSec <= 1e-9 && result.sequence.blockCountExact && result.sequence.adcCountExact && channelPass && result.kspace.pass;

fid = fopen(outputPath, 'w'); assert(fid >= 0, 'Cannot write %s', outputPath);
cleanup = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s\n', jsonencode(result, PrettyPrint=true));
end

function result = compareReal(points, series, relativeTolerance)
if isempty(points), result = emptyComparison(1e-9); result.referenceMaximumMagnitude = 0; return; end
times = arrayfun(@(item) double(item.timeSec), points);
observed = arrayfun(@(item) double(item.value), points);
reference = real(interpolateSeries(series, times, observed, 'real'));
scale = max(abs(reference)); tolerance = max(1e-9, relativeTolerance * scale);
result = metrics(observed - reference, tolerance);
result.referenceMaximumMagnitude = scale;
end

function result = compareRf(points, series, phaseMode, tolerance, minRelativeMagnitude)
[observed, reference, rawReference] = evaluatePoints(points, series, phaseMode);
if phaseMode
    threshold = minRelativeMagnitude * max(abs(series(2, :)));
    eligible = abs(rawReference) >= threshold;
    errors = angle(exp(1i * (observed(eligible) - reference(eligible))));
    result = metrics(errors, tolerance);
    result.totalCount = numel(observed);
    result.eligibleCount = sum(eligible);
    result.excludedCount = sum(~eligible);
    result.phaseMagnitudeThreshold = threshold;
    result.pass = result.pass && result.eligibleCount > 0;
else
    result = metrics(observed - reference, tolerance);
end
end

function [observed, reference, raw] = evaluatePoints(points, series, phaseMode)
if isempty(points), observed = []; reference = []; raw = []; return; end
times = arrayfun(@(item) double(item.timeSec), points);
observed = arrayfun(@(item) double(item.value), points);
if phaseMode, mode = 'phase'; else, mode = 'magnitude'; end
raw = interpolateSeries(series, times, observed, mode);
if phaseMode, reference = angle(raw); else, reference = abs(raw); end
end

function assertFrozenB0(seq, expectedB0Tesla)
explicitB0 = seq.getDefinition('B0');
if isempty(explicitB0), return; end
assert(numel(explicitB0) == 1 && abs(double(explicitB0(1)) - expectedB0Tesla) <= 1e-12, ...
    'Fixture B0 must be absent or equal to the frozen %.1f T test field strength.', expectedB0Tesla);
end

function values = interpolateSeries(series, targets, observed, mode)
if isempty(series), values = zeros(size(targets)); return; end
tRaw = real(series(1, :)); vRaw = series(2, :);
[t, order] = sort(tRaw); v = vRaw(order);
[tUnique, indices] = unique(t, 'last'); vUnique = v(indices);
values = interp1(tUnique, vUnique, targets, 'linear', 0);
for index = 1:numel(targets)
    exact = find(abs(t - targets(index)) <= 1e-12);
    if isempty(exact), continue; end
    candidates = v(exact);
    if strcmp(mode, 'real')
        [~, chosen] = min(abs(real(candidates) - observed(index)));
    elseif strcmp(mode, 'magnitude')
        [~, chosen] = min(abs(abs(candidates) - observed(index)));
    else
        maxMagnitude = max(abs(candidates));
        strong = find(abs(candidates) >= maxMagnitude * (1 - 1e-12));
        phaseErrors = abs(angle(exp(1i * (angle(candidates(strong)) - observed(index)))));
        [~, local] = min(phaseErrors); chosen = strong(local);
    end
    values(index) = candidates(chosen);
end
end

function result = metrics(errors, tolerance)
result.count = numel(errors);
if isempty(errors), result.maxAbsoluteError = 0; result.rmse = 0;
else, result.maxAbsoluteError = max(abs(errors)); result.rmse = sqrt(mean(abs(errors).^2)); end
result.tolerance = tolerance;
result.pass = result.maxAbsoluteError <= tolerance;
end

function result = emptyComparison(tolerance)
result.count = 0; result.maxAbsoluteError = 0; result.rmse = 0; result.tolerance = tolerance; result.pass = true;
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
