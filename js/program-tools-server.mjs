import { safeOutputFilename, validateToolInput } from './program-tools-catalog.mjs';

const BASE_PATH = '/api/cwk/tools';
const DONE = new Set(['done', 'succeeded', 'complete', 'completed']);
const FAILED = new Set(['error', 'failed', 'cancelled', 'canceled']);
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 20;

async function defaultPocketBase() {
    const { pb } = await import('./pb.js');
    return pb;
}

function checkJobId(jobId) {
    const id = String(jobId || '').trim();
    if (!/^[a-f0-9]{24,64}$/i.test(id)) throw new Error('파일 작업 번호가 올바르지 않아.');
    return id;
}

function notify(callback, payload) {
    if (typeof callback === 'function') callback(payload);
}

function normalizedJob(payload) {
    const job = payload?.job || payload;
    if (!job || typeof job !== 'object' || !job.id) throw new Error('서버가 올바른 작업 정보를 보내지 않았어.');
    return { ...job, status: String(job.status || '').toLowerCase() };
}

export async function getServerToolCapabilities({ pbClient } = {}) {
    const pb = pbClient || await defaultPocketBase();
    return await pb.send(`${BASE_PATH}/capabilities`, { method: 'GET', requestKey: null });
}

export async function createServerToolJob(toolId, files, options = {}, callbacks = {}) {
    const validated = validateToolInput(toolId, files);
    if (validated.tool.engine !== 'server') throw new Error('이 작업은 브라우저 로컬 도구야.');
    if (validated.files.length > MAX_FILES) throw new Error(`서버 작업은 한 번에 ${MAX_FILES}개까지만 처리할 수 있어.`);
    const totalBytes = validated.files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > MAX_UPLOAD_BYTES) throw new Error('서버로 보낼 파일의 합계가 200MB를 넘었어.');
    const serializedOptions = JSON.stringify(options || {});
    if (new Blob([serializedOptions]).size > 16 * 1024) throw new Error('작업 설정이 너무 커.');

    const body = new FormData();
    body.append('operation', toolId);
    body.append('options', serializedOptions);
    for (const file of validated.files) body.append('files', file, safeOutputFilename(file.name, 'input.bin'));
    notify(callbacks.onProgress, { phase: 'upload', completed: 0, total: totalBytes, message: '아이맥으로 파일을 보내고 있어.' });
    const pb = callbacks.pbClient || await defaultPocketBase();
    const payload = await pb.send(`${BASE_PATH}/jobs`, { method: 'POST', body, signal: callbacks.signal, requestKey: null });
    const job = normalizedJob(payload);
    notify(callbacks.onProgress, { phase: 'queued', completed: totalBytes, total: totalBytes, job, message: '작업 대기열에 들어갔어.' });
    return job;
}

export async function getServerToolJob(jobId, { pbClient, signal } = {}) {
    const pb = pbClient || await defaultPocketBase();
    return normalizedJob(await pb.send(`${BASE_PATH}/jobs/${checkJobId(jobId)}`, { method: 'GET', signal, requestKey: null }));
}

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason || new DOMException('작업을 취소했어.', 'AbortError'));
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException('작업을 취소했어.', 'AbortError'));
        }, { once: true });
    });
}

export async function waitForServerToolJob(jobId, callbacks = {}) {
    const pollIntervalMs = Math.min(Math.max(Number(callbacks.pollIntervalMs || 1000), 300), 10_000);
    const timeoutMs = Math.min(Math.max(Number(callbacks.timeoutMs || 20 * 60_000), 1_000), 60 * 60_000);
    const started = Date.now();
    while (true) {
        const job = await getServerToolJob(jobId, callbacks);
        notify(callbacks.onProgress, { phase: job.status || 'running', completed: DONE.has(job.status) ? 1 : 0, total: 1, job, message: job.status === 'queued' ? '앞 작업이 끝나길 기다리고 있어.' : job.status === 'running' ? '아이맥에서 파일을 처리하고 있어.' : '서버 작업 상태를 확인했어.' });
        if (DONE.has(job.status)) return job;
        if (FAILED.has(job.status)) throw new Error(job.error || (job.status.startsWith('cancel') ? '파일 작업을 취소했어.' : '아이맥 파일 작업에 실패했어.'));
        if (Date.now() - started > timeoutMs) throw new Error('아이맥 작업 대기 시간이 너무 길어졌어. 작업 상태를 다시 확인해줘.');
        await delay(pollIntervalMs, callbacks.signal);
    }
}

function filenameFromDisposition(value) {
    const encoded = String(value || '').match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try { return decodeURIComponent(encoded); } catch { /* 기본 filename으로 재시도 */ }
    }
    return String(value || '').match(/filename="?([^";]+)"?/i)?.[1] || '';
}

export async function downloadServerToolResult(jobOrId, callbacks = {}) {
    const suppliedJob = typeof jobOrId === 'object' ? normalizedJob(jobOrId) : null;
    const id = checkJobId(suppliedJob?.id || jobOrId);
    const pb = callbacks.pbClient || await defaultPocketBase();
    const url = pb.buildUrl(suppliedJob?.result_url || `${BASE_PATH}/jobs/${id}/result`);
    const headers = new Headers(callbacks.headers || {});
    if (pb.authStore?.token && !headers.has('Authorization')) headers.set('Authorization', pb.authStore.token);
    const response = await fetch(url, { method: 'GET', headers, signal: callbacks.signal, credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
        let message = `결과 파일을 내려받지 못했어. (${response.status})`;
        try { message = (await response.json())?.message || message; } catch { /* 기본 오류 문구 사용 */ }
        throw new Error(message);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('서버 결과 파일이 비어 있어.');
    const filename = safeOutputFilename(filenameFromDisposition(response.headers.get('content-disposition')) || suppliedJob?.result_name, 'result.bin');
    return { blob, filename, summary: '아이맥에서 파일 작업을 마쳤어.', job: suppliedJob || { id } };
}

export async function cancelServerToolJob(jobId, { pbClient, signal } = {}) {
    const pb = pbClient || await defaultPocketBase();
    return await pb.send(`${BASE_PATH}/jobs/${checkJobId(jobId)}`, { method: 'DELETE', signal, requestKey: null });
}

export async function runServerToolClient(toolId, files, options = {}, callbacks = {}) {
    let job = null;
    try {
        job = await createServerToolJob(toolId, files, options, callbacks);
        const completed = await waitForServerToolJob(job.id, callbacks);
        const result = await downloadServerToolResult(completed, callbacks);
        notify(callbacks.onProgress, { phase: 'done', completed: 1, total: 1, job: completed, message: '결과 파일을 받을 준비가 됐어.' });
        return { ...result, job: completed };
    } finally {
        // 결과 Blob은 이미 브라우저에 있으므로 서버 원본은 즉시 없앤다.
        // 취소 신호와 별개 요청으로 보내야 중단 중에도 임시 파일이 정리된다.
        if (job?.id) {
            try {
                await cancelServerToolJob(job.id, { pbClient: callbacks.pbClient });
            } catch {
                // 서버 TTL 정리기가 다시 처리한다. 다운로드 성공 자체는 유지한다.
            }
        }
    }
}

export const capabilities = getServerToolCapabilities;
export const createJob = createServerToolJob;
export const getJob = getServerToolJob;
export const downloadResult = downloadServerToolResult;
export const cancelJob = cancelServerToolJob;
