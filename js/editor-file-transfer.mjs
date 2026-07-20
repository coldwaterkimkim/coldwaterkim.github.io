export function preferredTransferImageFiles(dataTransfer) {
    if (!dataTransfer) return [];

    const files = Array.from(dataTransfer.files || [])
        .filter(file => file?.type?.startsWith('image/'));
    if (files.length) return files;

    return Array.from(dataTransfer.items || [])
        .filter(item => item.kind === 'file' && item.type?.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);
}

export function uniqueSupportedFiles(files, mimeTypes) {
    const seenFiles = new WeakSet();
    const seenFingerprints = new Set();

    return Array.from(files || []).filter(file => {
        if (!file || !mimeTypes.has(file.type)) return false;
        if (seenFiles.has(file)) return false;
        seenFiles.add(file);

        const fingerprint = namedFileFingerprint(file);
        if (!fingerprint) return true;
        if (seenFingerprints.has(fingerprint)) return false;
        seenFingerprints.add(fingerprint);
        return true;
    });
}

function namedFileFingerprint(file) {
    const name = String(file?.name || '').trim().toLowerCase();
    if (!name) return '';

    const type = String(file?.type || '').trim().toLowerCase();
    const size = Number(file?.size || 0);
    return `${name}:${type}:${size}:${Number(file?.lastModified || 0)}`;
}
