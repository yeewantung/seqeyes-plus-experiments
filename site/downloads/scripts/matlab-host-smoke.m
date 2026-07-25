function stage3_matlab_inmemory_smoke(outputPath, workspaceRoot, pulseqPath, inputPath)
% Validate the MATLAB Desktop in-memory mr.Sequence -> SeqEyes workflow.

if nargin < 1 || isempty(outputPath)
    outputPath = fullfile(tempdir, 'seqeyes-stage3-matlab-inmemory.json');
end
if nargin < 2 || isempty(workspaceRoot)
    workspaceRoot = defaultWorkspaceRoot();
end
if nargin < 3, pulseqPath = ''; end
configurePulseq(pulseqPath);
seqeyesMatlabPath = fullfile(workspaceRoot, 'seqeyes_plugin', 'matlab');
assert(isfolder(seqeyesMatlabPath), 'SeqEyes MATLAB wrapper not found: %s', seqeyesMatlabPath);
addpath(genpath(seqeyesMatlabPath));

if nargin < 4 || isempty(inputPath)
    inputPath = fullfile(workspaceRoot, 'bseq', 'benchmark_data', ...
        'demo_seq_pairs', 'writeGradientEcho_label.seq');
end
assert(isfile(inputPath), 'Smoke-test fixture not found: %s', inputPath);
seq = mr.Sequence();
seq.read(inputPath);
[durationSec, blockCount, eventCount] = seq.duration();

before = findall(groot, 'Type', 'figure');
seqeyes(seq);
drawnow;
pause(2);
drawnow;
after = findall(groot, 'Type', 'figure');
created = setdiff(after, before);
assert(~isempty(created), 'No MATLAB figure was created by seqeyes(seq).');
fig = created(1);
cleanup = onCleanup(@() closeFigure(fig)); %#ok<NASGU>
assert(contains(fig.Name, 'SeqEyes'), 'Created figure is not named SeqEyes.');
assert(isstruct(fig.UserData) && isfield(fig.UserData, 'htmlComponent'), 'SeqEyes uihtml handle is missing.');
h = fig.UserData.htmlComponent;
assert(isvalid(h), 'SeqEyes uihtml component is invalid.');
htmlPath = char(h.HTMLSource);
assert(isfile(htmlPath), 'SeqEyes temporary HTML was not created.');
html = fileread(htmlPath);
assert(contains(html, 'window._SEQEYES_HOST="matlab"'), 'MATLAB host metadata is missing.');
assert(contains(html, 'window._SEQEYES_PRELOAD='), 'In-memory sequence preload is missing.');
assert(contains(html, 'seqeyes_sequence.seq'), 'In-memory sequence was not serialized with the expected name.');

payload.schemaVersion = 1;
payload.experiment = 'E4';
payload.host = 'matlab_desktop';
payload.matlabVersion = version;
payload.inputMode = 'in_memory_mr.Sequence';
payload.sourceFixture = inputPath;
payload.sequence.durationSec = double(durationSec);
payload.sequence.blockCount = double(blockCount);
payload.sequence.eventCounts = double(eventCount(:).');
payload.viewer.figureCreated = true;
payload.viewer.uihtmlCreated = true;
payload.viewer.matlabHostStamped = true;
payload.viewer.sequencePreloaded = true;
payload.pass = true;

fid = fopen(outputPath, 'w');
assert(fid >= 0, 'Cannot write result: %s', outputPath);
fileCleanup = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s\n', jsonencode(payload, PrettyPrint=true));
end

function closeFigure(fig)
if isvalid(fig), delete(fig); end
end

function workspaceRoot = defaultWorkspaceRoot()
scriptDirectory = fileparts(mfilename('fullpath'));
workspaceRoot = fileparts(fileparts(fileparts(fileparts(scriptDirectory))));
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
