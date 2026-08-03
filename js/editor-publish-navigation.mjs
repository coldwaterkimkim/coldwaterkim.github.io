export function publishedEntryViewerUrl(category, record = {}) {
    if (category === 'posts') {
        return record.slug ? `/posts/view.html?slug=${encodeURIComponent(record.slug)}` : '';
    }

    if (category === 'daily') {
        const dayKey = record.day_key || record.published_at;
        if (dayKey) return `/daily/view.html?day=${encodeURIComponent(String(dayKey).slice(0, 10))}`;
        return record.slug ? `/daily/view.html?slug=${encodeURIComponent(record.slug)}` : '';
    }

    if (category === 'programs') {
        return record.slug ? `/programs/view.html?slug=${encodeURIComponent(record.slug)}` : '';
    }

    return '';
}

export function navigateToPublishedEntry(category, record, locationObject = globalThis.window?.location) {
    const url = publishedEntryViewerUrl(category, record);
    if (!url) throw new Error('발행된 글의 공개 주소를 만들 수 없어.');

    if (typeof locationObject?.assign === 'function') {
        locationObject.assign(url);
    } else if (locationObject) {
        locationObject.href = url;
    }

    return url;
}
