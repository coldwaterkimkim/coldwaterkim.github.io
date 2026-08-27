import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import {
    TOOL_BY_ID,
    TOOL_CATEGORIES,
    TOOLS,
    runLocalTool,
    safeOutputFilename,
    validateToolInput,
} from '../js/program-tools-catalog.mjs';
import { parsePageSpec } from '../js/program-tools-pdf.mjs';
import { readWorkbook, rowsFromSheet } from '../js/program-tools-sheet.mjs';
import {
    createServerToolJob,
    getServerToolCapabilities,
    runServerToolClient,
} from '../js/program-tools-server.mjs';

let assertions = 0;
function check(condition, message) {
    assert.ok(condition, message);
    assertions += 1;
}

function equal(actual, expected, message) {
    assert.deepEqual(actual, expected, message);
    assertions += 1;
}

async function makePdf(name, pageTexts, metadata = false) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const text of pageTexts) {
        const page = doc.addPage([300, 400]);
        page.drawText(text, { x: 30, y: 340, size: 18, font });
    }
    if (metadata) {
        doc.setTitle('Secret title');
        doc.setAuthor('Private author');
    }
    return new File([await doc.save()], name, { type: 'application/pdf' });
}

async function loadPdfResult(output) {
    check(output.blob.type === 'application/pdf', `${output.filename} MIME이 PDF여야 해.`);
    check(output.blob.size > 100, `${output.filename} 결과가 비어 있으면 안 돼.`);
    return await PDFDocument.load(await output.blob.arrayBuffer());
}

async function catalogTests() {
    equal(TOOL_CATEGORIES.map(item => item.id), ['document', 'pdf', 'image', 'sheet'], '카테고리 계약이 달라졌어.');
    equal(new Set(TOOLS.map(item => item.id)).size, TOOLS.length, '도구 ID가 중복되면 안 돼.');
    check(TOOLS.length >= 35, '고정한 1~4 범주의 도구가 충분히 등록돼야 해.');
    for (const required of ['office-to-pdf', 'pdf-merge', 'pdf-redact-raster', 'image-strip-metadata', 'sheet-extract-media']) check(TOOL_BY_ID.has(required), `${required}가 카탈로그에 없어.`);
    equal(TOOL_BY_ID.get('pdf-redact-raster').engine, 'local', '완전 가림은 래스터 로컬 엔진이어야 해.');
    equal(TOOL_BY_ID.get('pdf-ocr').engine, 'server', 'OCR은 서버 엔진이어야 해.');
    equal(TOOL_BY_ID.get('office-to-pdf').maxFiles, 20, 'Office 서버 작업은 최대 20파일이어야 해.');
    equal(TOOL_BY_ID.get('pdf-ocr').maxFiles, 20, 'OCR 서버 작업은 최대 20파일이어야 해.');
    for (const item of TOOLS.filter(item => item.engine === 'server')) check(item.maxFileBytes <= 200 * 1024 * 1024, `${item.id} 서버 파일 상한은 200MiB 이하여야 해.`);
    for (const item of TOOLS.filter(item => item.engine === 'server' && !['office-to-pdf', 'pdf-ocr'].includes(item.id))) equal(item.maxFiles, 1, `${item.id} 서버 작업은 한 파일씩이어야 해.`);
    equal(safeOutputFilename('../../악성:파일?.pdf'), '-.-악성-파일-.pdf', '파일명에서 경로와 예약 문자를 제거해야 해.');
    assert.throws(() => validateToolInput('no-such-tool', []), /알 수 없는 도구/);
    assertions += 1;
    assert.throws(() => validateToolInput('pdf-organize', [new File(['MZ'], 'malware.exe', { type: 'application/octet-stream' })]), /받을 수 없는 형식/);
    assertions += 1;
}

async function pdfTests() {
    equal(parsePageSpec('3-1,2', 3), [2, 1, 0, 1], '역순과 중복 페이지 지정을 보존해야 해.');
    assert.throws(() => parsePageSpec('4', 3), /존재하지 않아/);
    assertions += 1;

    const alpha = await makePdf('alpha.pdf', ['ALPHA-1', 'ALPHA-2'], true);
    const beta = await makePdf('beta.pdf', ['BETA-1']);
    const merge = await runLocalTool('pdf-merge', [alpha, beta]);
    equal((await loadPdfResult(merge)).getPageCount(), 3, 'PDF 합치기 페이지 수가 달라.');

    const organize = await runLocalTool('pdf-organize', [alpha], { pageSpec: '2,1,2', deletePages: [1], rotation: 90 });
    const organized = await loadPdfResult(organize);
    equal(organized.getPageCount(), 2, '삭제·중복 페이지 정리 결과가 달라.');
    equal(organized.getPage(0).getRotation().angle, 90, '페이지 회전이 반영돼야 해.');

    const numbered = await runLocalTool('pdf-page-number', [alpha], { start: 7, position: 'top', align: 'right' });
    equal((await loadPdfResult(numbered)).getPageCount(), 2, '페이지 번호 결과 페이지 수가 달라.');

    const watermarked = await runLocalTool('pdf-watermark', [alpha], { text: 'PRIVATE', opacity: 0.4 });
    equal((await loadPdfResult(watermarked)).getPageCount(), 2, '워터마크 결과 페이지 수가 달라.');

    const cropped = await runLocalTool('pdf-crop', [alpha], { left: 10, right: 20, top: 30, bottom: 40 });
    const croppedDoc = await loadPdfResult(cropped);
    const cropBox = croppedDoc.getPage(0).getCropBox();
    equal([Math.round(cropBox.x), Math.round(cropBox.y), Math.round(cropBox.width), Math.round(cropBox.height)], [10, 40, 270, 330], 'PDF crop box가 정확해야 해.');

    const nup = await runLocalTool('pdf-nup', [mergeAsFile(merge)], { perPage: 2, orientation: 'landscape' });
    equal((await loadPdfResult(nup)).getPageCount(), 2, '3페이지 2-up은 2장이 되어야 해.');

    const sanitized = await runLocalTool('pdf-sanitize', [alpha]);
    const sanitizedDoc = await loadPdfResult(sanitized);
    check(!sanitizedDoc.getTitle(), 'PDF 제목 메타데이터가 지워져야 해.');
    check(!sanitizedDoc.getAuthor(), 'PDF 작성자 메타데이터가 지워져야 해.');

    const compareSame = await runLocalTool('pdf-compare', [alpha, alpha]);
    const sameReport = JSON.parse(await compareSame.blob.text());
    equal(sameReport.changedPages, 0, '같은 PDF는 변경 페이지가 없어야 해.');
    const compareDifferent = await runLocalTool('pdf-compare', [alpha, beta], { format: 'html' });
    check((await compareDifferent.blob.text()).includes('변경됨'), '다른 PDF 비교 HTML에 변경 결과가 있어야 해.');

    const docx = await runLocalTool('pdf-to-docx', [alpha]);
    const docxZip = await JSZip.loadAsync(await docx.blob.arrayBuffer());
    const docXml = await docxZip.file('word/document.xml').async('text');
    check(docXml.includes('ALPHA-1') && docXml.includes('ALPHA-2'), 'PDF 텍스트가 DOCX에 들어가야 해.');

    const xlsx = await runLocalTool('pdf-to-xlsx', [alpha]);
    const parsed = XLSX.read(await xlsx.blob.arrayBuffer(), { type: 'array' });
    equal(parsed.SheetNames, ['페이지 1', '페이지 2'], 'PDF 페이지별 XLSX 시트를 만들어야 해.');

    const tinyPng = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], 'pixel.png', { type: 'image/png' });
    const imagePdf = await runLocalTool('images-to-pdf', [tinyPng]);
    equal((await loadPdfResult(imagePdf)).getPageCount(), 1, 'PNG 한 장이 PDF 한 페이지가 되어야 해.');
}

function mergeAsFile(output) {
    return new File([output.blob], output.filename, { type: 'application/pdf' });
}

async function makeSheetFile() {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['이름', '점수', '비고'],
        ['김', 10, ''],
        ['김', 10, ''],
        ['', '', ''],
        ['이', 20, '좋음'],
    ]), '성적');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['도시'], ['서울']]), '도시');
    workbook.Props = { Author: 'Private author', Title: 'Secret title' };
    return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], '성적표.xlsx', { type: SHEET_MIME });
}

const SHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function firstRows(blob, name = 'result.xlsx') {
    const file = new File([blob], name, { type: blob.type });
    const { workbook, XLSX: lib } = await readWorkbook(file);
    return rowsFromSheet(lib, workbook.Sheets[workbook.SheetNames[0]], true);
}

async function sheetTests() {
    const csv = new File(['이름,점수\n김,10\n이,20\n'], 'data.csv', { type: 'text/csv' });
    const toXlsx = await runLocalTool('sheet-convert', [csv], { format: 'xlsx' });
    equal((await firstRows(toXlsx.blob))[2], ['이', '20'], 'CSV→XLSX 데이터 왕복이 정확해야 해.');

    for (const format of ['csv', 'json', 'html', 'markdown', 'xml', 'yaml', 'sql']) {
        const converted = await runLocalTool('sheet-convert', [csv], { format, tableName: 'scores' });
        check(converted.blob.size > 20, `${format} 변환 결과가 비어 있으면 안 돼.`);
        const text = await converted.blob.text();
        check(text.includes('김'), `${format} 변환 결과에 원본 값이 있어야 해.`);
    }

    const json = new File([JSON.stringify([{ 이름: '박', 점수: 30 }])], 'data.json', { type: 'application/json' });
    const jsonToXlsx = await runLocalTool('sheet-convert', [json], { format: 'xlsx' });
    equal((await firstRows(jsonToXlsx.blob))[1], ['박', 30], 'JSON→XLSX 데이터 왕복이 정확해야 해.');

    const markdown = new File(['| 이름 | 점수 |\n| --- | --- |\n| 최 | 40 |'], 'data.md', { type: 'text/markdown' });
    const markdownToXlsx = await runLocalTool('sheet-convert', [markdown], { format: 'xlsx' });
    equal((await firstRows(markdownToXlsx.blob))[1], ['최', '40'], 'Markdown 표를 읽어야 해.');

    const xml = new File(['<table><row><cell>이름</cell><cell>점수</cell></row><row><cell>정</cell><cell>50</cell></row></table>'], 'data.xml', { type: 'application/xml' });
    const xmlToXlsx = await runLocalTool('sheet-convert', [xml], { format: 'xlsx' });
    equal((await firstRows(xmlToXlsx.blob))[1], ['정', '50'], 'XML 표를 읽어야 해.');

    const yaml = new File(['- "이름": "윤"\n  "점수": 60\n'], 'data.yaml', { type: 'text/yaml' });
    const yamlToXlsx = await runLocalTool('sheet-convert', [yaml], { format: 'xlsx' });
    equal((await firstRows(yamlToXlsx.blob))[1], ['윤', 60], 'YAML 목록을 읽어야 해.');

    const csv2 = new File(['이름,점수\n박,30\n'], 'data2.csv', { type: 'text/csv' });
    const merged = await runLocalTool('sheet-merge', [csv, csv2], { sourceColumn: true });
    const mergedRows = await firstRows(merged.blob);
    equal(mergedRows.length, 4, '헤더 1개와 데이터 3행을 합쳐야 해.');
    equal(mergedRows[0][0], '원본 파일', '원본 파일 열을 넣어야 해.');

    const workbookFile = await makeSheetFile();
    const split = await runLocalTool('sheet-split', [workbookFile]);
    const splitZip = await JSZip.loadAsync(await split.blob.arrayBuffer());
    equal(Object.keys(splitZip.files).filter(name => name.endsWith('.xlsx')).length, 2, '2개 시트를 각각 분리해야 해.');

    const compared = await runLocalTool('sheet-compare', [csv, csv2]);
    check((await compared.blob.text()).includes('개 셀이 달라'), '표 비교 리포트를 만들어야 해.');

    const cleaned = await runLocalTool('sheet-clean', [workbookFile]);
    const cleanRows = await firstRows(cleaned.blob);
    equal(cleanRows.length, 3, '빈 행과 중복 행을 제거해야 해.');

    const selected = await runLocalTool('sheet-select-columns', [workbookFile], { columns: ['이름', '비고'] });
    equal((await firstRows(selected.blob))[0], ['이름', '비고'], '선택한 열만 남겨야 해.');

    const transposed = await runLocalTool('sheet-transpose', [csv]);
    equal((await firstRows(transposed.blob))[0], ['이름', '김', '이'], '행과 열을 정확히 뒤집어야 해.');

    const mediaSource = new JSZip();
    mediaSource.file('xl/media/image1.png', Buffer.from([137, 80, 78, 71]));
    mediaSource.file('[Content_Types].xml', '<Types/>');
    const fakeXlsx = new File([await mediaSource.generateAsync({ type: 'uint8array' })], 'media.xlsx', { type: SHEET_MIME });
    const media = await runLocalTool('sheet-extract-media', [fakeXlsx]);
    const mediaZip = await JSZip.loadAsync(await media.blob.arrayBuffer());
    check(Boolean(mediaZip.file('image1.png')), 'XLSX 안의 미디어를 추출해야 해.');

    const sanitized = await runLocalTool('sheet-sanitize', [workbookFile]);
    const sanitizedWorkbook = XLSX.read(await sanitized.blob.arrayBuffer(), { type: 'array' });
    check(!sanitizedWorkbook.Props?.Author, '엑셀 작성자 메타데이터를 제거해야 해.');
}

async function serverClientTests() {
    const id = '0123456789abcdef01234567';
    const calls = [];
    const pbClient = {
        authStore: { token: 'test-owner-token' },
        buildUrl: path => `https://example.test${path}`,
        async send(path, options) {
            calls.push({ path, method: options.method, body: options.body });
            if (path.endsWith('/capabilities')) return { operations: [{ name: 'pdf-ocr', available: true }] };
            if (path === '/api/cwk/tools/jobs' && options.method === 'POST') return { id, status: 'queued' };
            if (path.endsWith(`/${id}`) && options.method === 'GET') return { id, status: 'done', result_name: '../safe.pdf', result_url: `/api/cwk/tools/jobs/${id}/result` };
            if (path.endsWith(`/${id}`) && options.method === 'DELETE') return { id, deleted: true };
            throw new Error(`unexpected call: ${options.method} ${path}`);
        },
    };
    const capabilities = await getServerToolCapabilities({ pbClient });
    check(capabilities.operations[0].available, '서버 capabilities를 읽어야 해.');
    const input = await makePdf('input.pdf', ['SERVER']);
    const job = await createServerToolJob('pdf-ocr', [input], { language: 'kor' }, { pbClient });
    equal(job.status, 'queued', '서버 작업 생성 결과를 읽어야 해.');
    const form = calls.find(call => call.method === 'POST').body;
    equal(form.get('operation'), 'pdf-ocr', '서버 multipart operation 계약이 정확해야 해.');
    equal(JSON.parse(form.get('options')).language, 'kor', '서버 multipart options 계약이 정확해야 해.');
    equal(form.getAll('files').length, 1, '서버 multipart files 계약이 정확해야 해.');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
        equal(options.headers.get('Authorization'), 'test-owner-token', '결과 다운로드에 OWNER 토큰이 있어야 해.');
        return new Response(new Blob(['%PDF-test'], { type: 'application/pdf' }), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="server-result.pdf"' } });
    };
    try {
        const output = await runServerToolClient('pdf-ocr', [input], { language: 'kor' }, { pbClient, pollIntervalMs: 1 });
        equal(output.filename, 'server-result.pdf', '서버 결과 파일명을 안전하게 읽어야 해.');
        check(output.blob.size > 0, '서버 결과 Blob이 비어 있으면 안 돼.');
        check(calls.some(call => call.method === 'DELETE' && call.path.endsWith(`/${id}`)), '다운로드 뒤 서버 임시 job을 즉시 지워야 해.');
    } finally {
        globalThis.fetch = originalFetch;
    }
}

await catalogTests();
await pdfTests();
await sheetTests();
await serverClientTests();

console.log(`program tools QA passed: ${assertions} assertions`);
