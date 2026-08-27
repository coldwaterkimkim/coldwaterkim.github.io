import { fileStem, safeOutputFilename } from './program-tools-catalog.mjs';

const OUTPUT_TYPES = Object.freeze({
    jpeg: { mime: 'image/jpeg', extension: 'jpg' },
    jpg: { mime: 'image/jpeg', extension: 'jpg' },
    png: { mime: 'image/png', extension: 'png' },
    webp: { mime: 'image/webp', extension: 'webp' },
});

function requireBrowser() {
    if (typeof document === 'undefined') throw new Error('이미지 작업은 브라우저에서 실행해야 해.');
}

function outputType(format, fallbackMime = 'image/jpeg') {
    const normalized = String(format || '').toLowerCase().replace('image/', '');
    return OUTPUT_TYPES[normalized] || Object.values(OUTPUT_TYPES).find(item => item.mime === fallbackMime) || OUTPUT_TYPES.jpeg;
}

async function heicToBlob(blob, type, quality) {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob, toType: type, quality });
    return Array.isArray(converted) ? converted[0] : converted;
}

async function decodeImage(blob) {
    requireBrowser();
    let source = blob;
    const type = String(blob.type || '').toLowerCase();
    const name = String(blob.name || '').toLowerCase();
    if (/hei[cf]/.test(type) || /\.hei[cf]$/.test(name)) source = await heicToBlob(blob, 'image/png', 1);
    if (typeof createImageBitmap === 'function') {
        try { return { image: await createImageBitmap(source), source }; } catch { /* Image 경로로 재시도 */ }
    }
    const url = URL.createObjectURL(source);
    try {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        return { image, source };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function canvas(width, height) {
    requireBrowser();
    const element = document.createElement('canvas');
    element.width = Math.max(1, Math.round(width));
    element.height = Math.max(1, Math.round(height));
    return element;
}

async function canvasBlob(element, type, quality) {
    return await new Promise((resolve, reject) => element.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 결과를 저장하지 못했어.')), type, quality));
}

async function drawSource(blob, transform = {}) {
    const { image } = await decodeImage(blob);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    let targetWidth = Number(transform.width || sourceWidth);
    let targetHeight = Number(transform.height || sourceHeight);
    if (transform.keepAspect !== false && (transform.width || transform.height)) {
        const ratio = Math.min(transform.width ? Number(transform.width) / sourceWidth : Infinity, transform.height ? Number(transform.height) / sourceHeight : Infinity);
        const safeRatio = Number.isFinite(ratio) ? ratio : transform.width ? Number(transform.width) / sourceWidth : Number(transform.height) / sourceHeight;
        if (transform.allowUpscale === false) {
            targetWidth = sourceWidth * Math.min(safeRatio, 1);
            targetHeight = sourceHeight * Math.min(safeRatio, 1);
        } else {
            targetWidth = sourceWidth * safeRatio;
            targetHeight = sourceHeight * safeRatio;
        }
    }
    const output = canvas(targetWidth, targetHeight);
    const context = output.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, output.width, output.height);
    image.close?.();
    return output;
}

async function resizeWithPica(source, width, height) {
    const target = canvas(width, height);
    const pica = (await import('pica')).default();
    await pica.resize(source, target, { quality: 3, alpha: true });
    return target;
}

async function convertOne(file, options) {
    const chosen = outputType(options.format, file.type);
    const quality = Math.min(Math.max(Number(options.quality ?? 0.9), 0.1), 1);
    if ((/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '')) && ['image/jpeg', 'image/png'].includes(chosen.mime)) {
        return { blob: await heicToBlob(file, chosen.mime, quality), extension: chosen.extension };
    }
    const output = await drawSource(file);
    return { blob: await canvasBlob(output, chosen.mime, quality), extension: chosen.extension };
}

async function compressOne(file, options) {
    const maxSizeMB = Math.min(Math.max(Number(options.maxSizeMB ?? 1), 0.05), 50);
    const maxWidthOrHeight = Math.min(Math.max(Number(options.maxWidthOrHeight ?? 4096), 32), 16384);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const initialQuality = Math.min(Math.max(Number(options.quality ?? 0.85), 0.1), 1);
    const chosen = outputType(options.format, file.type);
    const lossy = chosen.mime === 'image/jpeg' || chosen.mime === 'image/webp';
    let output = await drawSource(file);
    const initialScale = Math.min(maxWidthOrHeight / output.width, maxWidthOrHeight / output.height, 1);
    if (initialScale < 1) {
        output = await resizeWithPica(output, output.width * initialScale, output.height * initialScale);
    }

    let quality = initialQuality;
    let result = await canvasBlob(output, chosen.mime, quality);
    for (let attempt = 0; result.size > maxBytes && attempt < 12; attempt += 1) {
        if (lossy && quality > 0.14) {
            quality = Math.max(0.12, quality * 0.78);
        } else {
            const scale = Math.min(0.9, Math.max(0.45, Math.sqrt(maxBytes / result.size) * 0.92));
            const nextWidth = Math.max(1, Math.round(output.width * scale));
            const nextHeight = Math.max(1, Math.round(output.height * scale));
            if (nextWidth === output.width && nextHeight === output.height) break;
            output = await resizeWithPica(output, nextWidth, nextHeight);
            if (lossy) quality = Math.max(0.12, initialQuality * 0.8);
        }
        result = await canvasBlob(output, chosen.mime, quality);
    }
    return { blob: result, extension: chosen.extension };
}

async function resizeOne(file, options) {
    const source = await drawSource(file);
    const maxWidth = Number(options.width || source.width);
    const maxHeight = Number(options.height || source.height);
    let ratio = options.keepAspect === false ? null : Math.min(maxWidth / source.width, maxHeight / source.height);
    if (options.allowUpscale === false) ratio = Math.min(ratio, 1);
    const width = ratio === null ? maxWidth : source.width * ratio;
    const height = ratio === null ? maxHeight : source.height * ratio;
    const resized = Math.round(width) === source.width && Math.round(height) === source.height ? source : await resizeWithPica(source, width, height);
    const chosen = outputType(options.format, file.type);
    return { blob: await canvasBlob(resized, chosen.mime, Number(options.quality ?? 0.9)), extension: chosen.extension };
}

async function cropOne(file, options) {
    const { image } = await decodeImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const targetWidth = Math.max(Number(options.width || 1080), 1);
    const targetHeight = Math.max(Number(options.height || 1080), 1);
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
    } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
    }
    const output = canvas(targetWidth, targetHeight);
    output.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    image.close?.();
    const chosen = outputType(options.format, file.type);
    return { blob: await canvasBlob(output, chosen.mime, Number(options.quality ?? 0.9)), extension: chosen.extension };
}

async function rotateOne(file, options) {
    const { image } = await decodeImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const angle = ((Number(options.angle || 90) % 360) + 360) % 360;
    const radians = angle * Math.PI / 180;
    const rightAngle = angle === 90 || angle === 270;
    const width = rightAngle ? sourceHeight : angle === 180 || angle === 0 ? sourceWidth : Math.abs(sourceWidth * Math.cos(radians)) + Math.abs(sourceHeight * Math.sin(radians));
    const height = rightAngle ? sourceWidth : angle === 180 || angle === 0 ? sourceHeight : Math.abs(sourceWidth * Math.sin(radians)) + Math.abs(sourceHeight * Math.cos(radians));
    const output = canvas(width, height);
    const context = output.getContext('2d');
    context.translate(output.width / 2, output.height / 2);
    context.rotate(radians);
    context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);
    image.close?.();
    const chosen = outputType(options.format, file.type);
    return { blob: await canvasBlob(output, chosen.mime, Number(options.quality ?? 0.9)), extension: chosen.extension };
}

async function watermarkOne(file, options) {
    const output = await drawSource(file);
    const context = output.getContext('2d');
    const text = String(options.text || 'coldwaterkim').slice(0, 120);
    const fontSize = Math.max(Number(options.fontSize || Math.round(Math.min(output.width, output.height) / 18)), 10);
    const margin = Math.max(Number(options.margin || fontSize), 0);
    context.save();
    context.globalAlpha = Math.min(Math.max(Number(options.opacity ?? 0.55), 0.02), 1);
    context.font = `${options.bold === false ? '' : 'bold '}${fontSize}px sans-serif`;
    context.textBaseline = 'bottom';
    context.fillStyle = String(options.color || '#ffffff');
    context.shadowColor = 'rgba(0,0,0,.6)';
    context.shadowBlur = Math.max(fontSize / 8, 1);
    const width = context.measureText(text).width;
    const x = options.position?.includes('left') ? margin : options.position?.includes('center') ? (output.width - width) / 2 : output.width - margin - width;
    const y = options.position?.includes('top') ? margin + fontSize : output.height - margin;
    context.fillText(text, x, y);
    context.restore();
    const chosen = outputType(options.format, file.type);
    return { blob: await canvasBlob(output, chosen.mime, Number(options.quality ?? 0.9)), extension: chosen.extension };
}

async function stripMetadataOne(file, options) {
    const output = await drawSource(file);
    const chosen = outputType(options.format, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
    return { blob: await canvasBlob(output, chosen.mime, Number(options.quality ?? 0.94)), extension: chosen.extension };
}

export async function normalizeImageBlobToJpegOrPng(blob, options = {}) {
    const chosen = options.type === 'image/png' ? OUTPUT_TYPES.png : OUTPUT_TYPES.jpeg;
    const converted = await convertOne(blob, { format: chosen.extension, quality: options.quality });
    return new Blob([await converted.blob.arrayBuffer()], { type: chosen.mime });
}

async function zipResults(outputs, filename) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const output of outputs) zip.file(output.name, await output.blob.arrayBuffer());
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function runImageTool(toolId, files, options = {}, onProgress = () => {}) {
    const handlers = {
        'image-convert': convertOne,
        'image-compress': compressOne,
        'image-resize': resizeOne,
        'image-center-crop': cropOne,
        'image-rotate': rotateOne,
        'image-watermark': watermarkOne,
        'image-strip-metadata': stripMetadataOne,
    };
    const handler = handlers[toolId];
    if (!handler) throw new Error(`지원하지 않는 이미지 작업이야: ${toolId}`);
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
        const processed = await handler(files[index], options);
        outputs.push({ blob: processed.blob, name: `${fileStem(files[index].name)}-${toolId.replace('image-', '')}.${processed.extension}` });
        onProgress({ phase: 'process', completed: index + 1, total: files.length, message: `${index + 1}/${files.length} 이미지를 처리했어.` });
    }
    if (outputs.length === 1) return { blob: outputs[0].blob, filename: outputs[0].name, summary: '이미지 1장을 처리했어.' };
    return { blob: await zipResults(outputs, `${fileStem(files[0].name)}-외-${files.length - 1}개.zip`), filename: safeOutputFilename(`${fileStem(files[0].name)}-외-${files.length - 1}개.zip`), summary: `이미지 ${files.length}장을 처리해서 ZIP으로 묶었어.` };
}
