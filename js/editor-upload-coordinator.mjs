const DEFAULT_DUPLICATE_BATCH_WINDOW_MS = 2500;

export function createEditorUploadCoordinator(options = {}) {
    const uploadFile = options.uploadFile;
    if (typeof uploadFile !== 'function') {
        throw new TypeError('createEditorUploadCoordinator requires an uploadFile function');
    }

    const fingerprintFile = options.fingerprintFile || editorFileFingerprint;
    const duplicateBatchWindowMs = Number.isFinite(options.duplicateBatchWindowMs)
        ? Math.max(0, options.duplicateBatchWindowMs)
        : DEFAULT_DUPLICATE_BATCH_WINDOW_MS;
    const now = options.now || Date.now;
    const completedFiles = new Map();
    const inFlightFiles = new Map();
    const activeBatches = new Set();
    const recentBatches = new Map();
    let queue = Promise.resolve();

    async function uploadOne(file, fileKey, callbacks = {}) {
        if (completedFiles.has(fileKey)) {
            const cached = completedFiles.get(fileKey);
            callbacks.onFileReused?.(file, cached);
            return cached;
        }

        if (inFlightFiles.has(fileKey)) {
            const pending = await inFlightFiles.get(fileKey);
            callbacks.onFileReused?.(file, pending);
            return pending;
        }

        callbacks.onFileStart?.(file);
        const pending = Promise.resolve(uploadFile(file, {
            onProgress: progress => callbacks.onFileProgress?.(file, progress)
        })).then(result => {
            if (!result) throw new Error(`Upload returned no result for ${file?.name || 'file'}`);
            completedFiles.set(fileKey, result);
            return result;
        }).finally(() => {
            if (inFlightFiles.get(fileKey) === pending) {
                inFlightFiles.delete(fileKey);
            }
        });

        inFlightFiles.set(fileKey, pending);
        return pending;
    }

    async function runBatch(files, callbacks = {}) {
        const batchFiles = Array.from(files || []).filter(Boolean);
        if (!batchFiles.length) {
            return { duplicate: false, uploaded: [], errors: [] };
        }

        const fileKeys = await Promise.all(batchFiles.map(fingerprintFile));
        pruneRecentBatches(recentBatches, now(), duplicateBatchWindowMs);
        const batchKey = editorBatchFingerprint(fileKeys);

        if (activeBatches.has(batchKey) || recentBatches.has(batchKey)) {
            callbacks.onDuplicateBatch?.(batchFiles);
            return { duplicate: true, uploaded: [], errors: [] };
        }

        activeBatches.add(batchKey);

        const execute = async () => {
            const uploaded = [];
            const errors = [];

            for (let index = 0; index < batchFiles.length; index += 1) {
                const file = batchFiles[index];
                const fileKey = fileKeys[index];
                const fileCallbacks = {
                    onFileStart: current => callbacks.onFileStart?.(current, index, batchFiles.length),
                    onFileProgress: (current, progress) => callbacks.onFileProgress?.(current, progress, index, batchFiles.length),
                    onFileReused: (current, result) => callbacks.onFileReused?.(current, result, index, batchFiles.length)
                };

                try {
                    const result = await uploadOne(file, fileKey, fileCallbacks);
                    uploaded.push({ file, result, index, fileKey });
                } catch (error) {
                    errors.push({ file, error, index, fileKey });
                    callbacks.onFileError?.(file, error, index, batchFiles.length);
                }
            }

            if (uploaded.length) {
                await callbacks.onComplete?.(uploaded, errors);
            }

            recentBatches.set(batchKey, now());
            return { duplicate: false, uploaded, errors };
        };

        const job = queue.then(execute);
        queue = job.catch(() => {});

        try {
            return await job;
        } finally {
            activeBatches.delete(batchKey);
        }
    }

    async function uploadSingle(file, callbacks = {}) {
        if (!file) throw new TypeError('uploadSingle requires a file');
        const fileKey = await fingerprintFile(file);
        return await uploadOne(file, fileKey, callbacks);
    }

    return {
        runBatch,
        uploadSingle,
        clear() {
            completedFiles.clear();
            inFlightFiles.clear();
            activeBatches.clear();
            recentBatches.clear();
        }
    };
}

export async function editorFileFingerprint(file) {
    if (!file) return 'missing-file';

    const name = String(file.name || '').trim().toLowerCase();
    const type = String(file.type || '').trim().toLowerCase();
    const size = Number(file.size || 0);
    const base = `${name}:${type}:${size}`;

    if (isImageFile(file)) {
        const digest = await sha256File(file);
        if (digest) return `sha256:${digest}`;
        return `image:${base}`;
    }

    const modified = Number(file.lastModified || 0);
    return `file:${base}:${modified}`;
}

export function editorBatchFingerprint(fileKeys) {
    return Array.from(fileKeys || [])
        .map(value => String(value || ''))
        .sort()
        .join('|');
}

async function sha256File(file) {
    if (!globalThis.crypto?.subtle || typeof file.arrayBuffer !== 'function') return '';

    try {
        const bytes = await file.arrayBuffer();
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (_error) {
        return '';
    }
}

function isImageFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || /\.(?:jpe?g|png|gif|webp)$/i.test(name);
}

function pruneRecentBatches(recentBatches, timestamp, windowMs) {
    for (const [key, completedAt] of recentBatches) {
        if (timestamp - completedAt > windowMs) recentBatches.delete(key);
    }
}
