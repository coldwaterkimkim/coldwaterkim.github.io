import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { isLoggedIn, logout, pb } from './pb.js';

const MIB = 1024 * 1024;
const MIN_DIAGNOSTIC_BYTES = 256 * MIB;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 32 * MIB;
const DIAGNOSTIC_FIXTURE_BYTES = 640 * MIB;
const DIAGNOSTIC_FIXTURE_CHUNK_BYTES = 8 * MIB;
const DIAGNOSTIC_FIXTURE_NAME = 'cwk-upload-diagnostics-fixture-640m.mp4';
const COOLDOWN_MS = 5000;
const PARALLEL_VARIANTS = [3, 6, 8];
const TARGETS_MB_PER_SECOND = [
    { minimum: 50, label: '아주 잘 풀린 목표(50–70MB/s)' },
    { minimum: 25, label: '현실적 목표(25–40MB/s)' },
    { minimum: 15, label: '보수적 성공(15–20MB/s)' },
    { minimum: 0, label: '보수적 성공 미달' }
];

if (!isLoggedIn()) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/admin/login.html?next=${encodeURIComponent(next)}`);
    await new Promise(() => {});
}

const elements = {
    file: document.getElementById('diagnosticFile'),
    fixture: document.getElementById('createDiagnosticFixture'),
    fixtureRemove: document.getElementById('removeDiagnosticFixture'),
    fixtureStatus: document.getElementById('diagnosticFixtureStatus'),
    rounds: document.getElementById('diagnosticRounds'),
    start: document.getElementById('startDiagnostic'),
    stop: document.getElementById('stopDiagnostic'),
    progress: document.getElementById('diagnosticProgress'),
    status: document.getElementById('diagnosticStatus'),
    results: document.getElementById('diagnosticResults'),
    summary: document.getElementById('diagnosticSummary'),
    copy: document.getElementById('copyDiagnostic'),
    download: document.getElementById('downloadDiagnostic'),
    log: document.getElementById('diagnosticLog'),
    logout: document.getElementById('logoutBtn')
};

const state = {
    running: false,
    stopAfterRun: false,
    report: null,
    activeUppy: null,
    preparingFixture: false,
    fixture: null
};

elements.logout.addEventListener('click', event => {
    event.preventDefault();
    if (state.running || state.preparingFixture) return;
    logout();
    window.location.href = '/admin/login.html';
});
elements.start.addEventListener('click', startDiagnostic);
elements.fixture.addEventListener('click', createBrowserFixture);
elements.fixtureRemove.addEventListener('click', async () => {
    const removed = await removeBrowserFixture();
    if (removed) setStatus('브라우저 디스크 임시 샘플을 삭제했어.');
});
elements.file.addEventListener('change', async () => {
    if (!elements.file.files?.[0] || !state.fixture) return;
    await removeBrowserFixture();
    elements.fixtureStatus.textContent = '로컬 영상 선택됨 · 임시 샘플 삭제 완료';
});
elements.stop.addEventListener('click', () => {
    state.stopAfterRun = true;
    elements.stop.disabled = true;
    setStatus('현재 전송은 안전하게 끝낸 뒤 다음 회차부터 중지할게.');
});
elements.copy.addEventListener('click', copyReport);
elements.download.addEventListener('click', downloadReport);
window.addEventListener('beforeunload', event => {
    if (!state.running && !state.preparingFixture && !state.fixture) return;
    event.preventDefault();
    event.returnValue = '';
});

logLine('준비 완료. 영상 하나를 고르거나 브라우저 디스크 샘플을 만들면 같은 File 객체로 모든 회차를 실행해.');

async function createBrowserFixture() {
    if (state.running || state.preparingFixture) return;
    if (!navigator.storage?.getDirectory) {
        setStatus('이 Chrome은 브라우저 디스크 샘플 생성을 지원하지 않아. 로컬 영상을 골라줘.', true);
        return;
    }

    state.preparingFixture = true;
    setControlsRunning(false);
    setStatus('브라우저 디스크에 640MiB 샘플을 만드는 중...');
    elements.fixtureStatus.textContent = '생성 중 · 탭을 닫지 마';
    let root = null;
    let writable = null;

    try {
        await removeBrowserFixture();
        root = await navigator.storage.getDirectory();
        await removeOpfsEntry(root, DIAGNOSTIC_FIXTURE_NAME);

        const estimate = await navigator.storage.estimate?.();
        const remaining = Number(estimate?.quota || 0) - Number(estimate?.usage || 0);
        if (remaining > 0 && remaining < DIAGNOSTIC_FIXTURE_BYTES + (64 * MIB)) {
            throw new Error(`브라우저 저장 공간이 부족해 (남은 공간 약 ${formatBytes(remaining)}).`);
        }

        const handle = await root.getFileHandle(DIAGNOSTIC_FIXTURE_NAME, { create: true });
        writable = await handle.createWritable({ keepExistingData: false });
        const chunk = createDeterministicFixtureChunk(DIAGNOSTIC_FIXTURE_CHUNK_BYTES);
        for (let offset = 0; offset < DIAGNOSTIC_FIXTURE_BYTES; offset += chunk.byteLength) {
            const bytes = Math.min(chunk.byteLength, DIAGNOSTIC_FIXTURE_BYTES - offset);
            await writable.write(bytes === chunk.byteLength ? chunk : chunk.subarray(0, bytes));
            const percent = ((offset + bytes) / DIAGNOSTIC_FIXTURE_BYTES) * 100;
            setStatus(`브라우저 디스크 샘플 생성 중 · ${percent.toFixed(0)}%`);
        }
        await writable.close();
        writable = null;

        const file = await handle.getFile();
        if (file.size !== DIAGNOSTIC_FIXTURE_BYTES) {
            throw new Error(`임시 샘플 크기가 달라 (${file.size}/${DIAGNOSTIC_FIXTURE_BYTES}).`);
        }
        state.fixture = { root, name: DIAGNOSTIC_FIXTURE_NAME, file };
        elements.fixtureRemove.disabled = false;
        elements.file.value = '';
        elements.fixtureStatus.textContent = `${formatBytes(file.size)} 준비됨 · 측정 뒤 자동 삭제`;
        setStatus('640MiB 브라우저 디스크 샘플 준비 완료. 측정 시작을 누르면 돼.');
        logLine(`브라우저 디스크 샘플 준비 완료 · ${formatBytes(file.size)} · ${file.name}`);
    } catch (error) {
        if (writable) {
            try {
                await writable.abort();
            } catch {
                // 실패한 임시 스트림은 아래 파일 삭제로 다시 정리한다.
            }
        }
        if (root) await removeOpfsEntry(root, DIAGNOSTIC_FIXTURE_NAME);
        state.fixture = null;
        elements.fixtureRemove.disabled = true;
        elements.fixtureStatus.textContent = '생성 실패 · 로컬 영상 선택 가능';
        setStatus(`임시 샘플 생성 실패: ${error.message || error}`, true);
        logLine(`브라우저 디스크 샘플 생성 실패: ${error.message || error}`);
    } finally {
        state.preparingFixture = false;
        setControlsRunning(false);
    }
}

async function startDiagnostic() {
    if (state.running) return;

    const fixture = state.fixture;
    const file = fixture?.file || elements.file.files?.[0];
    const validationError = validateDiagnosticFile(file);
    if (validationError) {
        setStatus(validationError, true);
        return;
    }

    state.running = true;
    state.stopAfterRun = false;
    setControlsRunning(true);
    clearResults();

    try {
        const capability = await getCapability();
        validateCapability(capability, file.size);
        const clientScope = classifyDiagnosticClient(capability.clientIp);
        const rounds = Math.max(1, Math.min(2, Number(elements.rounds.value || 1)));
        const sequence = buildBalancedSequence(rounds);
        const sourceProbe = await probeSourceRead(file);
        const startedAt = new Date().toISOString();
        state.report = {
            schemaVersion: 2,
            kind: 'coldwaterkim-owner-tus-ab',
            startedAt,
            completedAt: null,
            origin: window.location.origin,
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            connection: connectionSnapshot(),
            serverSeenClientIp: capability.clientIp,
            clientScope: clientScope.id,
            countsAsMacBookLanEvidence: clientScope.countsAsMacBookLanEvidence,
            file: {
                name: file.name,
                type: file.type,
                bytes: file.size,
                lastModified: file.lastModified,
                source: fixture ? 'browser-opfs-fixture' : 'local-file-picker',
                sourceReadSampleBytes: sourceProbe.bytesRead,
                sourceReadMiBPerSecond: bytesPerSecondToMib(sourceProbe.speedBytesPerSecond)
            },
            capability,
            chunkBytes: capability.chunkSize,
            rounds,
            sequence,
            runs: [],
            summary: []
        };

        logLine(`파일: ${file.name} · ${formatBytes(file.size)} · 원본 읽기 ${formatRate(sourceProbe.speedBytesPerSecond)}`);
        logLine(`서버: 클라이언트 ${capability.clientIp || '확인 불가'} · ${clientScope.label} · 최대 ${capability.maxParallelUploads}-way · 청크 ${formatBytes(capability.chunkSize)} · 안전 한도 ${formatBytes(capability.safeUploadBytes)}`);
        if (!clientScope.countsAsMacBookLanEvidence) {
            logLine('주의: 이 측정은 MacBook 홈 LAN 지속 속도 목표 판정에서 제외한다.');
        }

        for (let index = 0; index < sequence.length; index += 1) {
            if (state.stopAfterRun) break;
            const parallelUploads = sequence[index];
            const runNumber = index + 1;
            const run = await runVariant({
                file,
                parallelUploads,
                chunkSize: capability.chunkSize,
                runNumber,
                runCount: sequence.length
            });
            state.report.runs.push(run);
            renderResults();

            if (run.outcome !== 'complete' || !run.cleanupComplete) {
                throw new Error(run.errorMessage || '회차가 실패했거나 진단용 임시 조각 정리가 끝나지 않았어.');
            }

            if (index < sequence.length - 1 && !state.stopAfterRun) {
                logLine(`다음 회차까지 ${COOLDOWN_MS / 1000}초 대기.`);
                await countdownCooldown(COOLDOWN_MS, runNumber, sequence.length);
            }
        }

        state.report.completedAt = new Date().toISOString();
        state.report.summary = summarizeRuns(state.report.runs, state.report.countsAsMacBookLanEvidence);
        renderResults();
        renderSummary();
        const stopped = state.stopAfterRun && state.report.runs.length < sequence.length;
        setStatus(stopped
            ? `요청대로 ${state.report.runs.length}/${sequence.length}회 뒤 중지했어. 수집된 결과는 저장할 수 있어.`
            : `완료. ${state.report.runs.length}회 모두 전송했고 진단용 임시 조각도 정리했어.`);
        logLine(stopped ? '사용자 요청으로 후속 회차 중지.' : '전체 A/B 완료.');
    } catch (error) {
        if (state.report) {
            state.report.completedAt = new Date().toISOString();
            state.report.summary = summarizeRuns(
                state.report.runs,
                state.report.countsAsMacBookLanEvidence
            );
        }
        renderSummary();
        setStatus(`진단 중단: ${error.message || error}`, true);
        logLine(`오류: ${error.stack || error.message || error}`);
    } finally {
        if (fixture) {
            const removed = await removeBrowserFixture();
            if (!removed) {
                setStatus('전송은 끝났지만 브라우저 임시 샘플 삭제를 확인하지 못했어. 이 페이지에서 다시 샘플 만들기를 누르면 먼저 정리해.', true);
            }
        }
        state.running = false;
        state.activeUppy = null;
        setControlsRunning(false);
        elements.copy.disabled = !state.report?.runs?.length;
        elements.download.disabled = !state.report?.runs?.length;
    }
}

async function runVariant({ file, parallelUploads, chunkSize, runNumber, runCount }) {
    const sessionId = `cwk-ab-${parallelUploads}w-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const createdResourceUrls = new Set();
    const requestState = new WeakMap();
    const acceptedOffsets = new Map();
    const patchKeys = new Map();
    const requests = [];
    let acceptedPatchBytes = 0;
    let completedChunkCount = 0;
    let firstPatchStartedAt = 0;
    let lastAcceptedOffsetObservedAt = 0;
    let finalUploadUrl = '';
    let finalOffset = 0;
    const wallStartedAt = performance.now();

    const run = {
        runNumber,
        parallelUploads,
        sessionId,
        startedAt: new Date().toISOString(),
        completedAt: null,
        outcome: 'running',
        fileBytes: file.size,
        chunkBytes: chunkSize,
        acceptedPatchBytes: 0,
        finalOffset: 0,
        patchSeconds: 0,
        wallSeconds: 0,
        averageMiBPerSecond: 0,
        averageMBPerSecond: 0,
        completedChunkCount: 0,
        patchRequestCount: 0,
        retryOrReplayCount: 0,
        nonSuccessResponseCount: 0,
        cleanupResourceCount: 0,
        cleanupComplete: false,
        errorMessage: '',
        requests
    };

    setStatus(`${runNumber}/${runCount}회 · ${parallelUploads}-way 전송 준비 중...`);
    logLine(`${runNumber}/${runCount}회 시작 · ${parallelUploads}-way · session ${sessionId}`);

    const uppy = new Uppy({
        autoProceed: false,
        restrictions: {
            maxNumberOfFiles: 1,
            maxFileSize: MAX_UPLOAD_BYTES
        }
    });
    state.activeUppy = uppy;

    uppy.use(Tus, {
        endpoint: pb.buildUrl('/api/cwk/tus/files/'),
        headers: () => ({ Authorization: pb.authStore.token }),
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: false,
        allowedMetaFields: ['name', 'type', 'owner_id', 'upload_session'],
        parallelUploads,
        chunkSize,
        limit: 1,
        onBeforeRequest(request) {
            request.setHeader('X-Request-ID', sessionId);
            const method = requestMethod(request);
            const kind = requestKind(request);
            const resourceUrl = normalizeTusResourceUrl(requestUrl(request));
            const uploadOffset = numberHeader(request, 'Upload-Offset');
            const startedAt = performance.now();
            const metric = {
                method,
                kind,
                resourceId: resourceId(resourceUrl),
                uploadOffset,
                responseOffset: null,
                status: 0,
                durationMs: null
            };
            requests.push(metric);
            requestState.set(request, { kind, metric, resourceUrl, startedAt });
            if (kind === 'patch') {
                if (!firstPatchStartedAt) firstPatchStartedAt = startedAt;
                const key = `${resourceUrl}@${uploadOffset}`;
                patchKeys.set(key, (patchKeys.get(key) || 0) + 1);
                const offsetState = acceptedOffsets.get(resourceUrl) || {
                    hasPatch: false,
                    initialOffset: null,
                    lastObservedOffset: 0
                };
                if (offsetState.initialOffset === null) offsetState.initialOffset = uploadOffset;
                offsetState.lastObservedOffset = Math.max(offsetState.lastObservedOffset, uploadOffset);
                offsetState.hasPatch = true;
                acceptedOffsets.set(resourceUrl, offsetState);
            }
        },
        onAfterResponse(request, response) {
            const completedAt = performance.now();
            const stateForRequest = requestState.get(request);
            if (!stateForRequest) return;
            const status = Number(response?.getStatus?.() || 0);
            const responseOffset = Number(response?.getHeader?.('Upload-Offset') || 0);
            const location = response?.getHeader?.('Location') || '';
            stateForRequest.metric.status = status;
            stateForRequest.metric.durationMs = Math.max(0, completedAt - stateForRequest.startedAt);
            stateForRequest.metric.responseOffset = responseOffset;

            if (location) {
                const createdUrl = normalizeTusResourceUrl(location);
                if (createdUrl) createdResourceUrls.add(createdUrl);
                if (stateForRequest.kind === 'final-concat') finalUploadUrl = createdUrl;
            }
            if ((stateForRequest.kind === 'patch' || stateForRequest.kind === 'head') && stateForRequest.resourceUrl) {
                const offsetState = acceptedOffsets.get(stateForRequest.resourceUrl) || {
                    hasPatch: false,
                    initialOffset: null,
                    lastObservedOffset: 0
                };
                if (!offsetState.hasPatch && offsetState.initialOffset === null) {
                    offsetState.initialOffset = responseOffset;
                }
                if (offsetState.hasPatch && responseOffset > offsetState.lastObservedOffset) {
                    acceptedPatchBytes += responseOffset - offsetState.lastObservedOffset;
                    lastAcceptedOffsetObservedAt = completedAt;
                }
                offsetState.lastObservedOffset = Math.max(offsetState.lastObservedOffset, responseOffset);
                acceptedOffsets.set(stateForRequest.resourceUrl, offsetState);
            }
        },
        onChunkComplete() {
            completedChunkCount += 1;
        }
    });

    const fileId = uppy.addFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: file,
        meta: {
            owner_id: String(pb.authStore.model?.id || ''),
            upload_session: sessionId
        }
    });

    uppy.on('upload-progress', (uppyFile, progress) => {
        if (uppyFile?.id !== fileId) return;
        const uploaded = Number(progress.bytesUploaded || 0);
        const percent = file.size > 0 ? (uploaded / file.size) * 100 : 0;
        const overallPercent = (((runNumber - 1) + (percent / 100)) / runCount) * 100;
        elements.progress.value = overallPercent;
        const elapsedSeconds = firstPatchStartedAt
            ? Math.max((performance.now() - firstPatchStartedAt) / 1000, 0.001)
            : 0;
        const speed = elapsedSeconds > 0 ? acceptedPatchBytes / elapsedSeconds : 0;
        setStatus(`${runNumber}/${runCount}회 · ${parallelUploads}-way · ${percent.toFixed(1)}% · ${formatRate(speed)}`);
    });

    try {
        const result = await uppy.upload();
        const failed = result?.failed?.[0];
        if (failed) throw failed.error || new Error('Uppy tus 전송 실패');
        const uploaded = result?.successful?.[0] || uppy.getFile(fileId);
        finalUploadUrl ||= normalizeTusResourceUrl(uploaded?.response?.uploadURL || uploaded?.uploadURL || uploaded?.tus?.uploadUrl || '');
        if (!finalUploadUrl) throw new Error('완료된 결합 tus URL을 찾지 못했어.');
        createdResourceUrls.add(finalUploadUrl);

        finalOffset = await readFinalOffset(finalUploadUrl, sessionId);
        if (acceptedPatchBytes !== file.size) {
            throw new Error(`서버가 받은 PATCH 바이트가 원본과 달라 (${acceptedPatchBytes}/${file.size}).`);
        }
        if (finalOffset !== file.size) {
            throw new Error(`결합본 오프셋이 원본 크기와 달라 (${finalOffset}/${file.size}).`);
        }
        run.outcome = 'complete';
    } catch (error) {
        run.outcome = 'failed';
        run.errorMessage = String(error?.message || error);
    } finally {
        const wallCompletedAt = performance.now();
        uppy.destroy();
        state.activeUppy = null;

        const cleanup = await cleanupCreatedResources(createdResourceUrls, sessionId);
        const patchSeconds = firstPatchStartedAt && lastAcceptedOffsetObservedAt
            ? Math.max((lastAcceptedOffsetObservedAt - firstPatchStartedAt) / 1000, 0.001)
            : 0;
        const patchRequests = requests.filter(request => request.kind === 'patch');
        run.completedAt = new Date().toISOString();
        run.acceptedPatchBytes = acceptedPatchBytes;
        run.finalOffset = finalOffset;
        run.patchSeconds = patchSeconds;
        run.wallSeconds = Math.max((wallCompletedAt - wallStartedAt) / 1000, 0.001);
        run.averageMiBPerSecond = patchSeconds > 0 ? bytesPerSecondToMib(acceptedPatchBytes / patchSeconds) : 0;
        run.averageMBPerSecond = patchSeconds > 0 ? bytesPerSecondToMb(acceptedPatchBytes / patchSeconds) : 0;
        run.completedChunkCount = completedChunkCount;
        run.patchRequestCount = patchRequests.length;
        run.retryOrReplayCount = Array.from(patchKeys.values()).reduce((total, count) => total + Math.max(0, count - 1), 0);
        run.nonSuccessResponseCount = requests.filter(request => request.status < 200 || request.status >= 300).length;
        run.cleanupResourceCount = cleanup.resourceCount;
        run.cleanupComplete = cleanup.complete;
        run.cleanupStatuses = cleanup.statuses;
        if (!cleanup.complete) {
            run.outcome = 'failed';
            run.errorMessage ||= '자체 생성한 tus 임시 조각을 모두 정리하지 못했어.';
        }
        logLine(`${parallelUploads}-way ${run.outcome} · ${run.averageMBPerSecond.toFixed(3)}MB/s (${run.averageMiBPerSecond.toFixed(3)}MiB/s) · ${run.patchSeconds.toFixed(3)}초 · 정리 ${cleanup.complete ? '완료' : '실패'}`);
    }

    return run;
}

async function getCapability() {
    const response = await fetch(pb.buildUrl('/api/cwk/tus/status'), {
        method: 'GET',
        cache: 'no-store',
        headers: {
            Authorization: pb.authStore.token
        }
    });
    if (!response.ok) throw new Error(`운영 tus 상태 확인 실패 (${response.status}).`);
    const result = await response.json();
    return {
        available: Boolean(result?.available),
        protocol: String(result?.protocol || ''),
        maxSize: Number(result?.max_size || 0),
        safeUploadBytes: Number(result?.safe_upload_bytes || 0),
        availableBytes: Number(result?.available_bytes || 0),
        recommendedParallelUploads: Number(result?.parallel_uploads || 0),
        maxParallelUploads: Number(result?.max_parallel_uploads || 0),
        chunkSize: normalizeChunkSize(result?.chunk_size),
        clientIp: String(response.headers.get('X-CWK-Client-IP') || '')
    };
}

function validateCapability(capability, fileSize) {
    if (!capability.available || capability.protocol !== 'tus-1.0.0') {
        throw new Error('운영 tus 상태 엔드포인트가 준비되지 않았어.');
    }
    if (capability.maxParallelUploads < Math.max(...PARALLEL_VARIANTS)) {
        throw new Error(`서버 최대 분할이 ${capability.maxParallelUploads}-way라 8-way 비교를 실행할 수 없어.`);
    }
    if (fileSize > capability.maxSize || fileSize > capability.safeUploadBytes) {
        throw new Error('현재 서버 용량 안전 한도 안에서 이 파일을 반복 전송할 수 없어.');
    }
}

function validateDiagnosticFile(file) {
    if (!file) return '먼저 비교할 영상 하나를 골라줘.';
    const isVideo = String(file.type || '').startsWith('video/') || /\.(?:mp4|mov|m4v|webm)$/i.test(file.name || '');
    if (!isVideo) return '영상 파일만 측정할 수 있어.';
    if (file.size < MIN_DIAGNOSTIC_BYTES) return '3·6·8-way 비교가 의미 있도록 256MiB 이상 영상을 골라줘.';
    if (file.size > MAX_UPLOAD_BYTES) return '파일 하나는 8GiB까지 측정할 수 있어.';
    return '';
}

function buildBalancedSequence(rounds) {
    if (rounds <= 1) return [...PARALLEL_VARIANTS];
    return [...PARALLEL_VARIANTS, ...[...PARALLEL_VARIANTS].reverse()];
}

async function probeSourceRead(file) {
    const sampleBytes = Math.min(file.size, 8 * MIB);
    const startedAt = performance.now();
    const sample = await file.slice(0, sampleBytes).arrayBuffer();
    const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    return {
        bytesRead: sample.byteLength,
        speedBytesPerSecond: sample.byteLength / seconds
    };
}

async function readFinalOffset(uploadUrl, sessionId) {
    const response = await fetch(uploadUrl, {
        method: 'HEAD',
        headers: {
            Authorization: pb.authStore.token,
            'Tus-Resumable': '1.0.0',
            'X-Request-ID': sessionId
        },
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`결합본 HEAD 확인 실패 (${response.status}).`);
    return Number(response.headers.get('Upload-Offset') || 0);
}

async function cleanupCreatedResources(urls, sessionId) {
    const normalized = Array.from(urls)
        .map(normalizeTusResourceUrl)
        .filter(Boolean)
        .reverse();
    const statuses = [];
    for (const url of normalized) {
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    Authorization: pb.authStore.token,
                    'Tus-Resumable': '1.0.0',
                    'X-Request-ID': sessionId
                }
            });
            statuses.push({ resourceId: resourceId(url), status: response.status });
        } catch (error) {
            statuses.push({ resourceId: resourceId(url), status: 0, error: String(error?.message || error) });
        }
    }
    return {
        resourceCount: normalized.length,
        statuses,
        complete: statuses.length > 0 && statuses.every(item => item.status === 204 || item.status === 404)
    };
}

function normalizeTusResourceUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(value, pb.buildUrl('/api/cwk/tus/files/'));
        const base = new URL(pb.buildUrl('/api/cwk/tus/files/'));
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return '';
        const id = resourceId(url.href);
        if (!/^[A-Za-z0-9._+~-]{10,512}$/.test(id) || id.includes('..')) return '';
        url.search = '';
        url.hash = '';
        return url.href;
    } catch {
        return '';
    }
}

function resourceId(value) {
    try {
        return decodeURIComponent(new URL(value, window.location.origin).pathname.split('/').filter(Boolean).at(-1) || '');
    } catch {
        return '';
    }
}

function requestMethod(request) {
    try {
        return String(request?.getMethod?.() || 'UNKNOWN').toUpperCase();
    } catch {
        return 'UNKNOWN';
    }
}

function requestUrl(request) {
    try {
        return String(request?.getURL?.() || '');
    } catch {
        return '';
    }
}

function requestHeader(request, name) {
    try {
        return String(request?.getHeader?.(name) || '');
    } catch {
        return '';
    }
}

function numberHeader(request, name) {
    return Number(requestHeader(request, name) || 0);
}

function requestKind(request) {
    const method = requestMethod(request);
    if (method !== 'POST') return method.toLowerCase();
    const concat = requestHeader(request, 'Upload-Concat');
    if (concat === 'partial') return 'partial-create';
    if (concat.startsWith('final;')) return 'final-concat';
    return 'create';
}

function normalizeChunkSize(value) {
    const bytes = Number(value || 0);
    return Number.isFinite(bytes) && bytes >= 8 * MIB && bytes <= 128 * MIB
        ? Math.round(bytes)
        : DEFAULT_CHUNK_BYTES;
}

function summarizeRuns(runs, countsAsMacBookLanEvidence = false) {
    return PARALLEL_VARIANTS.map(parallelUploads => {
        const matching = runs.filter(run => run.parallelUploads === parallelUploads && run.outcome === 'complete');
        const speedsMB = matching.map(run => run.averageMBPerSecond).sort((a, b) => a - b);
        const speedsMiB = matching.map(run => run.averageMiBPerSecond).sort((a, b) => a - b);
        const medianMB = medianValue(speedsMB);
        return {
            parallelUploads,
            completedRuns: matching.length,
            medianMBPerSecond: medianMB,
            medianMiBPerSecond: medianValue(speedsMiB),
            minimumMBPerSecond: speedsMB[0] || 0,
            maximumMBPerSecond: speedsMB.at(-1) || 0,
            target: countsAsMacBookLanEvidence
                ? targetForSpeed(medianMB)
                : 'MacBook 홈 LAN 목표 판정 제외'
        };
    });
}

function medianValue(values) {
    if (!values.length) return 0;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 1
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2;
}

function targetForSpeed(value) {
    return TARGETS_MB_PER_SECOND.find(target => value >= target.minimum)?.label || '보수적 성공 미달';
}

function classifyDiagnosticClient(value) {
    const clientIp = String(value || '').trim().replace(/^::ffff:/i, '');
    if (!clientIp) {
        return {
            id: 'unknown',
            label: '경로 확인 불가',
            countsAsMacBookLanEvidence: false
        };
    }
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '192.168.0.11') {
        return {
            id: 'imac-local',
            label: '아이맥 자체 측정',
            countsAsMacBookLanEvidence: false
        };
    }
    if (clientIp === '192.168.0.10') {
        return {
            id: 'macbook-home-lan',
            label: 'MacBook 홈 LAN 실측',
            countsAsMacBookLanEvidence: true
        };
    }
    if (/^192\.168\.0\.\d{1,3}$/.test(clientIp)) {
        return {
            id: 'other-home-lan-client',
            label: '다른 홈 LAN 기기',
            countsAsMacBookLanEvidence: false
        };
    }
    return {
        id: 'external-or-other',
        label: '홈 LAN 외부 또는 다른 경로',
        countsAsMacBookLanEvidence: false
    };
}

function connectionSnapshot() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return null;
    return {
        effectiveType: connection.effectiveType || '',
        downlinkMbps: Number(connection.downlink || 0),
        rttMs: Number(connection.rtt || 0),
        saveData: Boolean(connection.saveData)
    };
}

function renderResults() {
    const runs = state.report?.runs || [];
    if (!runs.length) {
        clearResults();
        return;
    }
    elements.results.innerHTML = runs.map(run => `
        <tr>
            <td>${run.runNumber}</td>
            <td>${run.parallelUploads}-way</td>
            <td>${run.averageMBPerSecond.toFixed(3)}MB/s (${run.averageMiBPerSecond.toFixed(3)}MiB/s)</td>
            <td>${run.wallSeconds.toFixed(3)}초</td>
            <td>${run.completedChunkCount}</td>
            <td>${run.retryOrReplayCount} / ${run.nonSuccessResponseCount}</td>
            <td>${run.cleanupComplete ? '완료' : '확인 필요'}</td>
        </tr>
    `).join('');
}

function renderSummary() {
    const summary = state.report?.summary || summarizeRuns(
        state.report?.runs || [],
        state.report?.countsAsMacBookLanEvidence || false
    );
    const available = summary.filter(item => item.completedRuns > 0);
    if (!available.length) {
        elements.summary.textContent = '완료된 측정값이 아직 없어.';
        return;
    }
    const winner = [...available].sort((a, b) => b.medianMBPerSecond - a.medianMBPerSecond)[0];
    const scopePrefix = state.report?.countsAsMacBookLanEvidence
        ? `홈 LAN 실측 인정 (${state.report.serverSeenClientIp})`
        : `참고 측정 · MacBook 목표 판정 제외 (${state.report?.serverSeenClientIp || 'IP 확인 불가'})`;
    elements.summary.textContent = [scopePrefix]
        .concat(available
        .map(item => `${item.parallelUploads}-way 중앙값 ${item.medianMBPerSecond.toFixed(3)}MB/s (${item.target})`)
        .concat(`현재 우세: ${winner.parallelUploads}-way`))
        .join(' · ');
}

function clearResults() {
    elements.results.innerHTML = '<tr><td colspan="7">측정 중...</td></tr>';
    elements.summary.textContent = '회차별 값을 모으는 중.';
    elements.progress.value = 0;
    state.report = null;
    elements.copy.disabled = true;
    elements.download.disabled = true;
}

function setControlsRunning(running) {
    const locked = running || state.preparingFixture;
    elements.file.disabled = locked;
    elements.fixture.disabled = locked;
    elements.fixtureRemove.disabled = locked || !state.fixture;
    elements.rounds.disabled = locked;
    elements.start.disabled = locked;
    elements.stop.disabled = !running;
    elements.logout.setAttribute('aria-disabled', String(running));
}

function createDeterministicFixtureChunk(size) {
    const bytes = new Uint8Array(size);
    let value = 0x6d2b79f5;
    for (let index = 0; index < bytes.length; index += 1) {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        bytes[index] = value & 0xff;
    }
    return bytes;
}

async function removeBrowserFixture() {
    const fixture = state.fixture;
    if (!fixture) return true;
    const removed = await removeOpfsEntry(fixture.root, fixture.name);
    if (removed) {
        state.fixture = null;
        elements.fixtureRemove.disabled = true;
        elements.fixtureStatus.textContent = '임시 샘플 삭제 완료';
        logLine('브라우저 디스크 임시 샘플 삭제 완료.');
    }
    return removed;
}

async function removeOpfsEntry(root, name) {
    try {
        await root.removeEntry(name);
        return true;
    } catch (error) {
        if (error?.name === 'NotFoundError') return true;
        logLine(`브라우저 디스크 임시 샘플 삭제 실패: ${error.message || error}`);
        return false;
    }
}

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.style.color = isError ? '#b00020' : '';
}

function logLine(message) {
    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    elements.log.textContent += `${elements.log.textContent ? '\n' : ''}[${timestamp}] ${message}`;
    elements.log.scrollTop = elements.log.scrollHeight;
}

async function countdownCooldown(durationMs, completedRuns, totalRuns) {
    const end = Date.now() + durationMs;
    while (Date.now() < end && !state.stopAfterRun) {
        const seconds = Math.ceil((end - Date.now()) / 1000);
        setStatus(`${completedRuns}/${totalRuns}회 완료 · 다음 회차까지 ${seconds}초`);
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}

async function copyReport() {
    if (!state.report) return;
    await navigator.clipboard.writeText(`${JSON.stringify(state.report, null, 2)}\n`);
    setStatus('진단 JSON을 클립보드에 복사했어.');
}

function downloadReport() {
    if (!state.report) return;
    const blob = new Blob([`${JSON.stringify(state.report, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cwk-upload-ab-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * MIB) return `${(bytes / 1024 / MIB).toFixed(2)}GiB`;
    return `${(bytes / MIB).toFixed(2)}MiB`;
}

function formatRate(bytesPerSecond) {
    return `${bytesPerSecondToMb(bytesPerSecond).toFixed(2)}MB/s`;
}

function bytesPerSecondToMib(value) {
    return Number(value || 0) / MIB;
}

function bytesPerSecondToMb(value) {
    return Number(value || 0) / 1_000_000;
}
