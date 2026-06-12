import { isProgramImageFilename } from './pb.js';

const ZIP_FILENAME_RE = /\.zip$/i;
const ICNS_FILENAME_RE = /\.icns$/i;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function firstImageFile(files = []) {
    return Array.from(files).find(file => isImageFile(file)) || null;
}

export async function findAutomaticProgramCoverFile(files = []) {
    const directImage = firstImageFile(files);
    if (directImage) return directImage;

    for (const file of Array.from(files)) {
        if (!isZipFile(file)) continue;

        const extracted = await extractCoverFromZip(file);
        if (extracted) return extracted;
    }

    return null;
}

function isImageFile(file) {
    const type = String(file?.type || '');
    return type.startsWith('image/') || isProgramImageFilename(file?.name);
}

function isZipFile(file) {
    const type = String(file?.type || '');
    return ZIP_FILENAME_RE.test(file?.name || '') || type.includes('zip');
}

async function extractCoverFromZip(file) {
    try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter(entry => !entry.dir && !isSystemEntry(entry.name));

        const imageEntry = rankedEntries(entries)
            .find(entry => isProgramImageFilename(entry.name));
        if (imageEntry) {
            const blob = await imageEntry.async('blob');
            return fileFromBlob(blob, coverFilename(file.name, imageEntry.name), imageMimeFromFilename(imageEntry.name));
        }

        const icnsEntry = rankedEntries(entries)
            .find(entry => ICNS_FILENAME_RE.test(entry.name));
        if (icnsEntry) {
            const buffer = await icnsEntry.async('arraybuffer');
            const png = pngFromIcns(buffer);
            if (png) {
                return new File([png.bytes], coverFilename(file.name, icnsEntry.name, 'png'), {
                    type: 'image/png',
                    lastModified: file.lastModified || Date.now()
                });
            }
        }
    } catch (error) {
        console.warn('Program cover extraction failed:', error);
    }

    return null;
}

function rankedEntries(entries) {
    return Array.from(entries).sort((a, b) => entryScore(b.name) - entryScore(a.name));
}

function entryScore(name = '') {
    const value = String(name).toLowerCase();
    let score = 0;

    if (value.includes('.app/contents/resources/')) score += 80;
    if (value.includes('assets.xcassets')) score += 70;
    if (/(appicon|app-icon|icon|logo|cover)/i.test(value)) score += 50;
    if (/(1024|512|256|128|@3x|@2x)/i.test(value)) score += 20;
    if (ICNS_FILENAME_RE.test(value)) score += 10;
    if (isProgramImageFilename(value)) score += 8;
    if (value.includes('__macosx')) score -= 100;

    return score;
}

function isSystemEntry(name = '') {
    const value = String(name).toLowerCase();
    return value.includes('__macosx/') || value.endsWith('.ds_store');
}

function pngFromIcns(buffer) {
    const bytes = new Uint8Array(buffer);
    if (readAscii(bytes, 0, 4) !== 'icns') return null;

    const dataView = new DataView(buffer);
    const totalLength = Math.min(dataView.getUint32(4), bytes.length);
    const pngCandidates = [];
    let offset = 8;

    while (offset + 8 <= totalLength) {
        const type = readAscii(bytes, offset, 4);
        const length = dataView.getUint32(offset + 4);
        const payloadStart = offset + 8;
        const payloadEnd = offset + length;

        if (length < 8 || payloadEnd > bytes.length) break;

        const payload = bytes.slice(payloadStart, payloadEnd);
        if (startsWithPngSignature(payload)) {
            pngCandidates.push({
                type,
                bytes: payload,
                area: pngArea(payload)
            });
        }

        offset = payloadEnd;
    }

    pngCandidates.sort((a, b) => b.area - a.area);
    return pngCandidates[0] || null;
}

function startsWithPngSignature(bytes) {
    return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function pngArea(bytes) {
    if (!startsWithPngSignature(bytes) || bytes.length < 24) return 0;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width * height;
}

function readAscii(bytes, offset, length) {
    return Array.from(bytes.slice(offset, offset + length))
        .map(code => String.fromCharCode(code))
        .join('');
}

function fileFromBlob(blob, filename, type) {
    const typedBlob = type && blob.type !== type
        ? blob.slice(0, blob.size, type)
        : blob;
    return new File([typedBlob], filename, {
        type: type || typedBlob.type || 'application/octet-stream',
        lastModified: Date.now()
    });
}

function coverFilename(archiveName = 'program', entryName = 'cover.png', forcedExtension = '') {
    const base = String(archiveName)
        .replace(/\.(app\.)?zip$/i, '')
        .replace(/[^a-z0-9가-힣._-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'program';
    const extension = forcedExtension || String(entryName).split('.').pop() || 'png';
    return `${base}-cover.${extension.toLowerCase()}`;
}

function imageMimeFromFilename(filename = '') {
    const extension = String(filename).split('.').pop()?.toLowerCase();
    return {
        avif: 'image/avif',
        gif: 'image/gif',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        svg: 'image/svg+xml',
        webp: 'image/webp'
    }[extension] || '';
}
