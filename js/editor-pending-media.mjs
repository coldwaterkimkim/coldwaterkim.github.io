const MEDIA_RECORD_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function normalizePendingMediaIds(value) {
    let items = value;

    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return [];

        try {
            items = JSON.parse(text);
        } catch (_error) {
            items = text.split(',');
        }
    }

    if (!Array.isArray(items)) return [];

    return [...new Set(items
        .map(item => String(item || '').trim())
        .filter(item => MEDIA_RECORD_ID_PATTERN.test(item)))];
}

export function serializePendingMediaIds(value) {
    return JSON.stringify(normalizePendingMediaIds(value));
}

export function createPendingMediaTracker(initialValue = []) {
    let ids = new Set(normalizePendingMediaIds(initialValue));

    return {
        add(id) {
            const [normalized] = normalizePendingMediaIds([id]);
            if (normalized) ids.add(normalized);
        },
        reset(value = []) {
            ids = new Set(normalizePendingMediaIds(value));
        },
        values() {
            return [...ids];
        },
        serialize() {
            return serializePendingMediaIds([...ids]);
        }
    };
}

export function referencedMediaIds(content = '') {
    const ids = new Set();
    const source = String(content || '').replaceAll('&amp;', '&');
    const pattern = /\/api\/files\/[^/"'<>\s]+\/([^/"'<>\s?#]+)\//g;

    for (const match of source.matchAll(pattern)) {
        let recordId = match[1];
        try {
            recordId = decodeURIComponent(recordId);
        } catch (_error) {
            // Keep the raw path segment when an old URL contains invalid escaping.
        }
        const [normalized] = normalizePendingMediaIds([recordId]);
        if (normalized) ids.add(normalized);
    }

    return [...ids];
}

export function planPublishedMediaCleanup(pendingValue, finalContent = '') {
    const pending = normalizePendingMediaIds(pendingValue);
    const referenced = new Set(referencedMediaIds(finalContent));

    return {
        pending,
        kept: pending.filter(id => referenced.has(id)),
        removable: pending.filter(id => !referenced.has(id))
    };
}
