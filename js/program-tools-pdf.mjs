import { fileStem, safeOutputFilename } from './program-tools-catalog.mjs';

const PDF_MIME = 'application/pdf';
const encoder = new TextEncoder();

async function pdfLib() {
    return await import('pdf-lib');
}

async function readPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 5));
    if (signature !== '%PDF-') throw new Error(`${safeOutputFilename(file.name, '파일')}은 정상적인 PDF가 아니야.`);
    return bytes;
}

function result(blob, filename, summary) {
    return { blob, filename: safeOutputFilename(filename), summary };
}

function pdfResult(bytes, filename, summary) {
    return result(new Blob([bytes], { type: PDF_MIME }), filename, summary);
}

export function parsePageSpec(spec, pageCount) {
    const count = Number(pageCount);
    if (!Number.isInteger(count) || count < 1) throw new Error('PDF 페이지 수가 올바르지 않아.');
    const value = String(spec || '').trim();
    if (!value || value.toLowerCase() === 'all') return Array.from({ length: count }, (_, index) => index);
    const pages = [];
    for (const token of value.split(',').map(item => item.trim()).filter(Boolean)) {
        const match = token.match(/^(\d+)\s*-\s*(\d+)$/);
        if (match) {
            const start = Number(match[1]);
            const end = Number(match[2]);
            const step = start <= end ? 1 : -1;
            for (let page = start; page !== end + step; page += step) {
                if (page < 1 || page > count) throw new Error(`${page}페이지는 존재하지 않아.`);
                pages.push(page - 1);
            }
            continue;
        }
        if (!/^\d+$/.test(token)) throw new Error(`페이지 범위를 읽을 수 없어: ${token}`);
        const page = Number(token);
        if (page < 1 || page > count) throw new Error(`${page}페이지는 존재하지 않아.`);
        pages.push(page - 1);
    }
    if (!pages.length) throw new Error('남길 페이지를 하나 이상 골라줘.');
    return pages;
}

function normalizeRotation(value) {
    const number = Number(value || 0);
    return ((Math.round(number / 90) * 90) % 360 + 360) % 360;
}

async function mergePdfs(files, onProgress) {
    const { PDFDocument } = await pdfLib();
    const output = await PDFDocument.create();
    let pageCount = 0;
    for (let index = 0; index < files.length; index += 1) {
        const source = await PDFDocument.load(await readPdf(files[index]), { ignoreEncryption: false });
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach(page => output.addPage(page));
        pageCount += pages.length;
        onProgress({ phase: 'process', completed: index + 1, total: files.length, message: `${index + 1}/${files.length} PDF를 합쳤어.` });
    }
    return pdfResult(await output.save(), `${fileStem(files[0].name)}-외-${files.length - 1}개-합침.pdf`, `${files.length}개 PDF, ${pageCount}페이지를 합쳤어.`);
}

async function organizePdf(file, options) {
    const { PDFDocument, degrees } = await pdfLib();
    const source = await PDFDocument.load(await readPdf(file));
    let indices = parsePageSpec(options.pageSpec, source.getPageCount());
    const deleted = new Set((options.deletePages || []).map(Number).filter(Number.isInteger).map(page => page - 1));
    if (deleted.size) indices = indices.filter(index => !deleted.has(index));
    if (!indices.length) throw new Error('모든 페이지를 지울 수는 없어.');
    const output = await PDFDocument.create();
    const copied = await output.copyPages(source, indices);
    copied.forEach((page, outputIndex) => {
        const sourcePageNumber = indices[outputIndex] + 1;
        const specified = options.rotations?.[sourcePageNumber] ?? options.rotation ?? 0;
        const rotation = normalizeRotation(page.getRotation().angle + Number(specified || 0));
        page.setRotation(degrees(rotation));
        output.addPage(page);
    });
    return pdfResult(await output.save(), `${fileStem(file.name)}-페이지정리.pdf`, `${source.getPageCount()}페이지 중 ${copied.length}페이지를 새 순서로 저장했어.`);
}

async function imagesToPdf(files, options, onProgress) {
    const { PDFDocument } = await pdfLib();
    const output = await PDFDocument.create();
    const fit = options.fit || 'contain';
    const pageSize = options.pageSize || 'image';
    const sizes = { a4: [595.28, 841.89], letter: [612, 792] };
    for (let index = 0; index < files.length; index += 1) {
        let blob = files[index];
        let type = String(blob.type || '').toLowerCase();
        if (!['image/jpeg', 'image/png'].includes(type)) {
            const imageTools = await import('./program-tools-image.mjs');
            blob = await imageTools.normalizeImageBlobToJpegOrPng(blob, { type: 'image/jpeg', quality: options.quality ?? 0.92 });
            type = blob.type;
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const embedded = type === 'image/png' ? await output.embedPng(bytes) : await output.embedJpg(bytes);
        const [pageWidth, pageHeight] = sizes[pageSize] || [embedded.width, embedded.height];
        const page = output.addPage([pageWidth, pageHeight]);
        const scale = fit === 'cover'
            ? Math.max(pageWidth / embedded.width, pageHeight / embedded.height)
            : Math.min(pageWidth / embedded.width, pageHeight / embedded.height);
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
        onProgress({ phase: 'process', completed: index + 1, total: files.length, message: `${index + 1}/${files.length} 이미지를 넣었어.` });
    }
    return pdfResult(await output.save(), `${fileStem(files[0].name)}-${files.length}장.pdf`, `${files.length}장의 이미지를 PDF로 만들었어.`);
}

async function loadPdfJs(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    }
    return await pdfjs.getDocument({ data: bytes, disableWorker: true, useSystemFonts: true }).promise;
}

async function renderPdfPages(file, options = {}, onProgress = () => {}) {
    if (typeof document === 'undefined') throw new Error('PDF 페이지 렌더링은 브라우저에서 실행해야 해.');
    const bytes = await readPdf(file);
    const pdf = await loadPdfJs(bytes);
    const scale = Math.min(Math.max(Number(options.scale || 2), 0.5), 4);
    const format = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = Math.min(Math.max(Number(options.quality ?? 0.9), 0.1), 1);
    const outputs = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: context, viewport }).promise;
        outputs.push({ pageNumber, canvas, blob: await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('페이지 이미지를 만들지 못했어.')), format, quality)) });
        onProgress({ phase: 'process', completed: pageNumber, total: pdf.numPages, message: `${pageNumber}/${pdf.numPages}페이지를 렌더링했어.` });
    }
    return outputs;
}

async function zipBlobs(items, filename, summary) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const item of items) zip.file(item.name, await item.blob.arrayBuffer());
    return result(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), filename, summary);
}

async function pdfToImages(file, options, onProgress) {
    const pages = await renderPdfPages(file, options, onProgress);
    const extension = options.format === 'jpeg' ? 'jpg' : 'png';
    if (pages.length === 1) return result(pages[0].blob, `${fileStem(file.name)}-1.${extension}`, 'PDF 1페이지를 이미지로 만들었어.');
    return await zipBlobs(pages.map(page => ({ name: `${fileStem(file.name)}-${String(page.pageNumber).padStart(3, '0')}.${extension}`, blob: page.blob })), `${fileStem(file.name)}-이미지.zip`, `PDF ${pages.length}페이지를 이미지로 만들었어.`);
}

async function pageNumberPdf(file, options) {
    const { PDFDocument, StandardFonts, rgb } = await pdfLib();
    const doc = await PDFDocument.load(await readPdf(file));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const start = Number(options.start || 1);
    const fontSize = Math.min(Math.max(Number(options.fontSize || 10), 6), 72);
    const margin = Math.max(Number(options.margin || 24), 0);
    pages.forEach((page, index) => {
        const text = String(start + index);
        const width = font.widthOfTextAtSize(text, fontSize);
        const x = options.align === 'left' ? margin : options.align === 'right' ? page.getWidth() - margin - width : (page.getWidth() - width) / 2;
        const y = options.position === 'top' ? page.getHeight() - margin - fontSize : margin;
        page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.15, 0.15, 0.15) });
    });
    return pdfResult(await doc.save(), `${fileStem(file.name)}-페이지번호.pdf`, `${pages.length}페이지에 번호를 넣었어.`);
}

async function watermarkPdf(file, options) {
    const { PDFDocument, StandardFonts, degrees, rgb } = await pdfLib();
    const doc = await PDFDocument.load(await readPdf(file));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const text = String(options.text || 'WATERMARK').slice(0, 100);
    const opacity = Math.min(Math.max(Number(options.opacity ?? 0.2), 0.02), 1);
    for (const page of doc.getPages()) {
        const size = Math.min(Math.max(Number(options.fontSize || Math.min(page.getWidth(), page.getHeight()) / 8), 8), 180);
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: (page.getWidth() - textWidth) / 2, y: page.getHeight() / 2, size, font, rotate: degrees(Number(options.angle ?? -35)), opacity, color: rgb(0.35, 0.35, 0.35) });
    }
    return pdfResult(await doc.save(), `${fileStem(file.name)}-워터마크.pdf`, `${doc.getPageCount()}페이지에 워터마크를 넣었어.`);
}

async function cropPdf(file, options) {
    const { PDFDocument } = await pdfLib();
    const doc = await PDFDocument.load(await readPdf(file));
    const uniform = Number(options.margin || 0);
    const margins = {
        left: Math.max(Number(options.left ?? uniform), 0),
        right: Math.max(Number(options.right ?? uniform), 0),
        top: Math.max(Number(options.top ?? uniform), 0),
        bottom: Math.max(Number(options.bottom ?? uniform), 0),
    };
    for (const page of doc.getPages()) {
        const width = page.getWidth() - margins.left - margins.right;
        const height = page.getHeight() - margins.top - margins.bottom;
        if (width < 36 || height < 36) throw new Error('자른 뒤 페이지가 너무 작아져. 여백 값을 줄여줘.');
        page.setCropBox(margins.left, margins.bottom, width, height);
    }
    return pdfResult(await doc.save(), `${fileStem(file.name)}-여백정리.pdf`, `${doc.getPageCount()}페이지의 보이는 영역을 정리했어.`);
}

async function nupPdf(file, options) {
    const { PDFDocument } = await pdfLib();
    const bytes = await readPdf(file);
    const source = await PDFDocument.load(bytes);
    const output = await PDFDocument.create();
    const perPage = [2, 4].includes(Number(options.perPage)) ? Number(options.perPage) : 2;
    const landscape = options.orientation !== 'portrait';
    const outputSize = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const columns = perPage === 4 ? 2 : landscape ? 2 : 1;
    const rows = Math.ceil(perPage / columns);
    const margin = 18;
    const cellWidth = (outputSize[0] - margin * (columns + 1)) / columns;
    const cellHeight = (outputSize[1] - margin * (rows + 1)) / rows;
    const embedded = await output.embedPdf(bytes, source.getPageIndices());
    for (let start = 0; start < embedded.length; start += perPage) {
        const page = output.addPage(outputSize);
        embedded.slice(start, start + perPage).forEach((item, offset) => {
            const col = offset % columns;
            const row = Math.floor(offset / columns);
            const scale = Math.min(cellWidth / item.width, cellHeight / item.height);
            const width = item.width * scale;
            const height = item.height * scale;
            const x = margin + col * (cellWidth + margin) + (cellWidth - width) / 2;
            const y = outputSize[1] - margin - (row + 1) * cellHeight - row * margin + (cellHeight - height) / 2;
            page.drawPage(item, { x, y, width, height });
        });
    }
    return pdfResult(await output.save(), `${fileStem(file.name)}-${perPage}쪽모아찍기.pdf`, `${source.getPageCount()}페이지를 ${output.getPageCount()}장에 배치했어.`);
}

async function sanitizePdf(file, options) {
    const { PDFDocument, PDFName } = await pdfLib();
    const doc = await PDFDocument.load(await readPdf(file));
    if (options.flatten !== false) {
        try { doc.getForm().flatten(); } catch { /* 양식이 없는 문서는 그대로 진행 */ }
    }
    let annotations = 0;
    if (options.removeAnnotations !== false) {
        for (const page of doc.getPages()) {
            if (page.node.has(PDFName.of('Annots'))) {
                annotations += 1;
                page.node.delete(PDFName.of('Annots'));
            }
        }
    }
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
    doc.setCreationDate(new Date(0));
    doc.setModificationDate(new Date(0));
    return pdfResult(await doc.save({ updateFieldAppearances: false }), `${fileStem(file.name)}-청소.pdf`, `메타데이터를 지우고 주석이 있던 ${annotations}페이지를 정리했어.`);
}

async function redactRasterPdf(file, options, onProgress) {
    const pages = await renderPdfPages(file, { scale: options.scale || 2, format: 'jpeg', quality: options.quality ?? 0.92 }, onProgress);
    const redactions = Array.isArray(options.redactions) ? options.redactions : [];
    if (!redactions.length) throw new Error('가릴 영역을 하나 이상 지정해줘.');
    const { PDFDocument } = await pdfLib();
    const output = await PDFDocument.create();
    for (const rendered of pages) {
        const context = rendered.canvas.getContext('2d');
        const pageAreas = redactions.filter(item => Number(item.page) === rendered.pageNumber);
        for (const area of pageAreas) {
            const ratio = area.unit !== 'pixel';
            const x = ratio ? Number(area.x) * rendered.canvas.width : Number(area.x);
            const y = ratio ? Number(area.y) * rendered.canvas.height : Number(area.y);
            const width = ratio ? Number(area.width) * rendered.canvas.width : Number(area.width);
            const height = ratio ? Number(area.height) * rendered.canvas.height : Number(area.height);
            context.fillStyle = String(area.color || '#000000');
            context.fillRect(x, y, width, height);
        }
        const redactedBlob = await new Promise((resolve, reject) => rendered.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('가림 페이지를 저장하지 못했어.')), 'image/jpeg', Number(options.quality ?? 0.92)));
        const image = await output.embedJpg(await redactedBlob.arrayBuffer());
        const page = output.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    return pdfResult(await output.save(), `${fileStem(file.name)}-완전가림.pdf`, `${pages.length}페이지를 새 이미지로 만들고 ${redactions.length}개 영역을 완전히 가렸어.`);
}

async function extractPdfText(file) {
    const pdf = await loadPdfJs(await readPdf(file));
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const lines = [];
        let currentY = null;
        for (const item of content.items) {
            const y = Math.round(item.transform?.[5] || 0);
            if (currentY !== null && Math.abs(y - currentY) > 3) lines.push('\n');
            else if (lines.length) lines.push(' ');
            lines.push(String(item.str || ''));
            currentY = y;
        }
        pages.push(lines.join('').replace(/[ \t]+\n/g, '\n').trim());
    }
    return pages;
}

async function comparePdfPixels(files, options = {}) {
    if (typeof document === 'undefined') return [];
    const [left, right] = await Promise.all(files.map(file => renderPdfPages(file, { scale: options.pixelScale || 1, format: 'png' })));
    const pixelmatchModule = await import('pixelmatch');
    const pixelmatch = pixelmatchModule.default || pixelmatchModule;
    const pageCount = Math.max(left.length, right.length);
    const comparisons = [];
    for (let index = 0; index < pageCount; index += 1) {
        const width = Math.max(left[index]?.canvas.width || 1, right[index]?.canvas.width || 1);
        const height = Math.max(left[index]?.canvas.height || 1, right[index]?.canvas.height || 1);
        const normalized = [left[index], right[index]].map(rendered => {
            const target = document.createElement('canvas');
            target.width = width;
            target.height = height;
            const context = target.getContext('2d', { willReadFrequently: true });
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            if (rendered) context.drawImage(rendered.canvas, 0, 0);
            return context.getImageData(0, 0, width, height);
        });
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = width;
        diffCanvas.height = height;
        const diffContext = diffCanvas.getContext('2d');
        const diff = diffContext.createImageData(width, height);
        const mismatchedPixels = pixelmatch(normalized[0].data, normalized[1].data, diff.data, width, height, {
            threshold: Math.min(Math.max(Number(options.pixelThreshold ?? 0.1), 0), 1),
            includeAA: Boolean(options.includeAntialiasing),
        });
        diffContext.putImageData(diff, 0, 0);
        comparisons.push({
            page: index + 1,
            width,
            height,
            mismatchedPixels,
            mismatchRatio: mismatchedPixels / (width * height),
            diffImage: mismatchedPixels ? diffCanvas.toDataURL('image/png') : '',
        });
    }
    return comparisons;
}

async function comparePdfs(files, options, onProgress) {
    const [[leftPages, rightPages], pixels] = await Promise.all([
        Promise.all(files.map(extractPdfText)),
        comparePdfPixels(files, options),
    ]);
    const { diffLines } = await import('diff');
    const max = Math.max(leftPages.length, rightPages.length);
    const pages = [];
    for (let index = 0; index < max; index += 1) {
        const changes = diffLines(leftPages[index] || '', rightPages[index] || '');
        pages.push({ page: index + 1, changed: changes.some(item => item.added || item.removed), additions: changes.filter(item => item.added).reduce((sum, item) => sum + (item.count || 0), 0), removals: changes.filter(item => item.removed).reduce((sum, item) => sum + (item.count || 0), 0), changes });
        onProgress({ phase: 'compare', completed: index + 1, total: max, message: `${index + 1}/${max}페이지를 비교했어.` });
    }
    const changedPages = pages.filter(page => page.changed).length;
    const pixelChangedPages = pixels.filter(page => page.mismatchedPixels > 0).length;
    const payload = {
        files: files.map(file => safeOutputFilename(file.name)),
        pageCounts: [leftPages.length, rightPages.length],
        changedPages,
        pixelChangedPages,
        pages: pages.map(page => ({ ...page, pixel: pixels[page.page - 1] ? { ...pixels[page.page - 1], diffImage: undefined } : null })),
    };
    if (options.format === 'html') {
        const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        const body = pages.map(page => {
            const pixel = pixels[page.page - 1];
            const image = pixel?.diffImage ? `<details><summary>픽셀 차이 보기 (${(pixel.mismatchRatio * 100).toFixed(3)}%)</summary><img src="${pixel.diffImage}" alt="${page.page}페이지 픽셀 차이" loading="lazy"></details>` : '<p>픽셀 차이 없음</p>';
            return `<section><h2>${page.page}페이지 ${page.changed || pixel?.mismatchedPixels ? '변경됨' : '같음'}</h2><pre>${page.changes.map(change => `<span class="${change.added ? 'add' : change.removed ? 'remove' : ''}">${escape(change.value)}</span>`).join('')}</pre>${image}</section>`;
        }).join('');
        const html = `<!doctype html><meta charset="utf-8"><title>PDF 비교 결과</title><style>body{font-family:system-ui;max-width:960px;margin:2rem auto;padding:0 1rem}.add{background:#d9fbd9}.remove{background:#ffdada;text-decoration:line-through}pre{white-space:pre-wrap;border:1px solid #aaa;padding:1rem}img{max-width:100%;border:1px solid #999}</style><h1>PDF 비교 결과</h1><p>텍스트 차이 ${changedPages}/${max}페이지, 픽셀 차이 ${pixelChangedPages}/${max}페이지.</p>${body}`;
        return result(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fileStem(files[0].name)}-비교.html`, `텍스트 ${changedPages}페이지, 픽셀 ${pixelChangedPages}페이지에서 차이를 찾았어.`);
    }
    return result(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${fileStem(files[0].name)}-비교.json`, `${changedPages}/${max}페이지에서 텍스트 차이를 찾았어.`);
}

async function pdfToDocx(file) {
    const texts = await extractPdfText(file);
    const { Document, Packer, PageBreak, Paragraph, TextRun } = await import('docx');
    const children = [];
    texts.forEach((text, index) => {
        for (const line of text.split('\n')) children.push(new Paragraph({ children: [new TextRun(line)] }));
        if (index < texts.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    });
    const doc = new Document({ sections: [{ properties: {}, children }] });
    return result(await Packer.toBlob(doc), `${fileStem(file.name)}.docx`, `${texts.length}페이지의 읽을 수 있는 텍스트를 DOCX로 옮겼어.`);
}

async function pdfToXlsx(file) {
    const texts = await extractPdfText(file);
    const XLSXModule = await import('xlsx');
    const XLSX = XLSXModule.default || XLSXModule;
    const workbook = XLSX.utils.book_new();
    texts.forEach((text, index) => {
        const rows = text.split('\n').map(line => [line]);
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), `페이지 ${index + 1}`.slice(0, 31));
    });
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    return result(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileStem(file.name)}.xlsx`, `${texts.length}페이지의 읽을 수 있는 텍스트를 페이지별 시트로 옮겼어.`);
}

const xmlEscape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

async function makePptxFromImages(images) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const slideIds = images.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('');
    const overrides = images.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${overrides}</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
    zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${images.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')}</Relationships>`);
    for (let index = 0; index < images.length; index += 1) {
        zip.file(`ppt/media/image${index + 1}.png`, await images[index].blob.arrayBuffer());
        zip.file(`ppt/slides/slide${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${index + 1}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
        zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${index + 1}.png"/></Relationships>`);
    }
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function pdfToPptx(file, options, onProgress) {
    const images = await renderPdfPages(file, { scale: options.scale || 1.5, format: 'png' }, onProgress);
    return result(await makePptxFromImages(images), `${fileStem(file.name)}.pptx`, `${images.length}페이지를 슬라이드 이미지로 옮겼어.`);
}

export async function runPdfTool(toolId, files, options = {}, onProgress = () => {}) {
    switch (toolId) {
        case 'pdf-merge': return await mergePdfs(files, onProgress);
        case 'pdf-organize': return await organizePdf(files[0], options);
        case 'images-to-pdf': return await imagesToPdf(files, options, onProgress);
        case 'pdf-to-images': return await pdfToImages(files[0], options, onProgress);
        case 'pdf-page-number': return await pageNumberPdf(files[0], options);
        case 'pdf-watermark': return await watermarkPdf(files[0], options);
        case 'pdf-crop': return await cropPdf(files[0], options);
        case 'pdf-nup': return await nupPdf(files[0], options);
        case 'pdf-sanitize': return await sanitizePdf(files[0], options);
        case 'pdf-redact-raster': return await redactRasterPdf(files[0], options, onProgress);
        case 'pdf-compare': return await comparePdfs(files, options, onProgress);
        case 'pdf-to-docx': return await pdfToDocx(files[0]);
        case 'pdf-to-xlsx': return await pdfToXlsx(files[0]);
        case 'pdf-to-pptx': return await pdfToPptx(files[0], options, onProgress);
        default: throw new Error(`지원하지 않는 PDF 작업이야: ${toolId}`);
    }
}

export { extractPdfText, renderPdfPages };
