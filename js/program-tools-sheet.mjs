import { fileStem, safeOutputFilename } from './program-tools-catalog.mjs';

const SHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMAT_INFO = Object.freeze({
    xlsx: { extension: 'xlsx', mime: SHEET_MIME, bookType: 'xlsx' },
    xls: { extension: 'xls', mime: 'application/vnd.ms-excel', bookType: 'biff8' },
    csv: { extension: 'csv', mime: 'text/csv;charset=utf-8' },
    json: { extension: 'json', mime: 'application/json;charset=utf-8' },
    html: { extension: 'html', mime: 'text/html;charset=utf-8' },
    markdown: { extension: 'md', mime: 'text/markdown;charset=utf-8' },
    md: { extension: 'md', mime: 'text/markdown;charset=utf-8' },
    xml: { extension: 'xml', mime: 'application/xml;charset=utf-8' },
    yaml: { extension: 'yaml', mime: 'text/yaml;charset=utf-8' },
    yml: { extension: 'yaml', mime: 'text/yaml;charset=utf-8' },
    sql: { extension: 'sql', mime: 'text/sql;charset=utf-8' },
});

async function xlsxLib() {
    const module = await import('xlsx');
    return module.default || module;
}

function extensionOf(name) {
    return String(name || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
}

function uniqueSheetName(workbook, requested) {
    const base = String(requested || 'Sheet').replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
    let candidate = base;
    let index = 2;
    while (workbook.SheetNames.includes(candidate)) candidate = `${base.slice(0, 27)}-${index++}`;
    return candidate;
}

function csvRows(text) {
    return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((_, index, rows) => index < rows.length - 1 || rows[index] !== '').map(line => {
        const cells = [];
        let current = '';
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
            else if (char === '"') quoted = !quoted;
            else if (char === ',' && !quoted) { cells.push(current); current = ''; }
            else current += char;
        }
        cells.push(current);
        return cells;
    });
}

function parseMarkdown(text) {
    const lines = String(text).split(/\r?\n/).filter(line => line.includes('|'));
    return lines.filter(line => !/^\s*\|?\s*:?-{3,}/.test(line)).map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/\\\|/g, '|')));
}

function parseSimpleXml(text) {
    const rows = [];
    for (const rowMatch of String(text).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi)) {
        const cells = [...rowMatch[1].matchAll(/<cell(?:\s[^>]*)?>([\s\S]*?)<\/cell>/gi)].map(match => match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
        if (cells.length) rows.push(cells);
    }
    return rows;
}

function parseSimpleYaml(text) {
    const records = [];
    let current = null;
    for (const rawLine of String(text).split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const first = line.match(/^-\s*([^:]+):\s*(.*)$/);
        const continuation = line.match(/^([^:]+):\s*(.*)$/);
        if (first) { current = {}; records.push(current); current[first[1].trim()] = yamlScalar(first[2]); }
        else if (continuation && current) current[continuation[1].trim()] = yamlScalar(continuation[2]);
    }
    if (!records.length) throw new Error('YAML은 `- 열: 값` 형태의 단순 목록만 읽을 수 있어.');
    const headers = [...new Set(records.flatMap(record => Object.keys(record)))];
    return [headers, ...records.map(record => headers.map(header => record[header] ?? ''))];
}

function yamlScalar(value) {
    const trimmed = String(value).trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (trimmed === 'null' || trimmed === '~') return null;
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed);
    return trimmed;
}

async function readWorkbook(file) {
    const XLSX = await xlsxLib();
    const extension = extensionOf(file.name);
    const bytes = await file.arrayBuffer();
    if (extension === 'json') {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        const records = Array.isArray(value) ? value : value.records || [value];
        const sheet = Array.isArray(records[0]) ? XLSX.utils.aoa_to_sheet(records) : XLSX.utils.json_to_sheet(records);
        return { workbook: { SheetNames: ['Data'], Sheets: { Data: sheet } }, XLSX };
    }
    if (extension === 'md' || extension === 'markdown') {
        const sheet = XLSX.utils.aoa_to_sheet(parseMarkdown(new TextDecoder().decode(bytes)));
        return { workbook: { SheetNames: ['Data'], Sheets: { Data: sheet } }, XLSX };
    }
    if (extension === 'xml') {
        const sheet = XLSX.utils.aoa_to_sheet(parseSimpleXml(new TextDecoder().decode(bytes)));
        return { workbook: { SheetNames: ['Data'], Sheets: { Data: sheet } }, XLSX };
    }
    if (extension === 'yaml' || extension === 'yml') {
        const sheet = XLSX.utils.aoa_to_sheet(parseSimpleYaml(new TextDecoder().decode(bytes)));
        return { workbook: { SheetNames: ['Data'], Sheets: { Data: sheet } }, XLSX };
    }
    if (extension === 'csv') {
        let rows;
        try {
            const PapaModule = await import('papaparse');
            const Papa = PapaModule.default || PapaModule;
            const parsed = Papa.parse(new TextDecoder(optionsEncoding(file) || 'utf-8').decode(bytes), { skipEmptyLines: false });
            if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
            rows = parsed.data;
        } catch {
            rows = csvRows(new TextDecoder().decode(bytes));
        }
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        return { workbook: { SheetNames: ['Data'], Sheets: { Data: sheet } }, XLSX };
    }
    return { workbook: XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: true, cellStyles: false }), XLSX };
}

function optionsEncoding(file) {
    return file?.sheetEncoding || undefined;
}

function rowsFromSheet(XLSX, sheet, raw = false) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw, blankrows: true });
}

function trimMatrix(rows) {
    const nonEmptyRows = rows.filter(row => row.some(value => value !== '' && value !== null && value !== undefined));
    let lastColumn = -1;
    for (const row of nonEmptyRows) for (let index = row.length - 1; index >= 0; index -= 1) if (row[index] !== '' && row[index] !== null && row[index] !== undefined) { lastColumn = Math.max(lastColumn, index); break; }
    return nonEmptyRows.map(row => row.slice(0, lastColumn + 1));
}

function markdownFromRows(rows) {
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const clean = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const normalized = rows.map(row => Array.from({ length: width }, (_, index) => clean(row[index])));
    return [`| ${normalized[0].join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...normalized.slice(1).map(row => `| ${row.join(' | ')} |`)].join('\n');
}

function xmlEscape(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function xmlFromRows(rows) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<table>\n${rows.map((row, rowIndex) => `  <row index="${rowIndex + 1}">${row.map(cell => `<cell>${xmlEscape(cell)}</cell>`).join('')}</row>`).join('\n')}\n</table>\n`;
}

function yamlFromRows(rows) {
    if (!rows.length) return '[]\n';
    const headers = rows[0].map((value, index) => String(value || `column_${index + 1}`));
    const scalar = value => value === null || value === undefined ? 'null' : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(String(value));
    return rows.slice(1).map(row => headers.map((header, index) => `${index ? '  ' : '- '}${JSON.stringify(header)}: ${scalar(row[index])}`).join('\n')).join('\n');
}

function sqlFromRows(rows, tableName) {
    if (!rows.length) return '';
    const safeTable = String(tableName || 'data').replace(/[^a-zA-Z0-9_가-힣]/g, '_') || 'data';
    const headers = rows[0].map((value, index) => String(value || `column_${index + 1}`).replace(/"/g, '""'));
    const columns = headers.map(header => `"${header}" TEXT`).join(', ');
    const value = cell => cell === null || cell === undefined || cell === '' ? 'NULL' : `'${String(cell).replace(/'/g, "''")}'`;
    return [`CREATE TABLE "${safeTable}" (${columns});`, ...rows.slice(1).map(row => `INSERT INTO "${safeTable}" (${headers.map(header => `"${header}"`).join(', ')}) VALUES (${headers.map((_, index) => value(row[index])).join(', ')});`)].join('\n');
}

async function serializeSheet(workbook, format, options = {}) {
    const XLSX = await xlsxLib();
    const info = FORMAT_INFO[format] || FORMAT_INFO.xlsx;
    if (info.bookType) {
        const bytes = XLSX.write(workbook, { type: 'array', bookType: info.bookType, compression: true, Props: {} });
        return { blob: new Blob([bytes], { type: info.mime }), extension: info.extension };
    }
    const selectedName = options.sheetName && workbook.Sheets[options.sheetName] ? options.sheetName : workbook.SheetNames[0];
    const sheet = workbook.Sheets[selectedName];
    const rows = rowsFromSheet(XLSX, sheet, true);
    let text;
    if (format === 'csv') text = `\uFEFF${XLSX.utils.sheet_to_csv(sheet, { FS: options.delimiter || ',', RS: '\n' })}`;
    else if (format === 'json') text = JSON.stringify(XLSX.utils.sheet_to_json(sheet, { defval: '' }), null, 2);
    else if (format === 'html') text = `<!doctype html><meta charset="utf-8"><title>표</title>${XLSX.utils.sheet_to_html(sheet)}`;
    else if (format === 'markdown' || format === 'md') text = markdownFromRows(rows);
    else if (format === 'xml') text = xmlFromRows(rows);
    else if (format === 'yaml' || format === 'yml') text = yamlFromRows(rows);
    else if (format === 'sql') text = sqlFromRows(rows, options.tableName || selectedName);
    else throw new Error(`지원하지 않는 표 형식이야: ${format}`);
    return { blob: new Blob([text], { type: info.mime }), extension: info.extension };
}

async function zipOutputs(outputs, filename) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const output of outputs) zip.file(output.name, await output.blob.arrayBuffer());
    return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), filename };
}

async function convertSheets(files, options, onProgress) {
    const format = String(options.format || 'xlsx').toLowerCase();
    if (!FORMAT_INFO[format]) throw new Error(`지원하지 않는 변환 형식이야: ${format}`);
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
        const { workbook } = await readWorkbook(files[index]);
        const serialized = await serializeSheet(workbook, format, options);
        outputs.push({ blob: serialized.blob, name: `${fileStem(files[index].name)}.${serialized.extension}` });
        onProgress({ phase: 'process', completed: index + 1, total: files.length, message: `${index + 1}/${files.length} 표 파일을 변환했어.` });
    }
    if (outputs.length === 1) return { blob: outputs[0].blob, filename: outputs[0].name, summary: `${format.toUpperCase()} 파일로 변환했어.` };
    const zipped = await zipOutputs(outputs, `${fileStem(files[0].name)}-변환-${files.length}개.zip`);
    return { ...zipped, summary: `${files.length}개 파일을 ${format.toUpperCase()}로 변환해 ZIP으로 묶었어.` };
}

async function mergeSheets(files, options, onProgress) {
    const XLSX = await xlsxLib();
    const output = XLSX.utils.book_new();
    if (options.mode === 'sheets') {
        for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
            const { workbook } = await readWorkbook(files[fileIndex]);
            for (const sheetName of workbook.SheetNames) {
                const name = uniqueSheetName(output, `${fileStem(files[fileIndex].name)}-${sheetName}`);
                XLSX.utils.book_append_sheet(output, workbook.Sheets[sheetName], name);
            }
            onProgress({ phase: 'process', completed: fileIndex + 1, total: files.length, message: `${fileIndex + 1}/${files.length} 파일의 시트를 넣었어.` });
        }
    } else {
        const combined = [];
        let headers = null;
        for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
            const { workbook } = await readWorkbook(files[fileIndex]);
            const rows = trimMatrix(rowsFromSheet(XLSX, workbook.Sheets[workbook.SheetNames[0]], true));
            if (!rows.length) continue;
            if (!headers) {
                headers = options.sourceColumn ? ['원본 파일', ...rows[0]] : rows[0];
                combined.push(headers);
            }
            const dataRows = options.hasHeader === false ? rows : rows.slice(1);
            combined.push(...dataRows.map(row => options.sourceColumn ? [safeOutputFilename(files[fileIndex].name), ...row] : row));
            onProgress({ phase: 'process', completed: fileIndex + 1, total: files.length, message: `${fileIndex + 1}/${files.length} 파일의 행을 넣었어.` });
        }
        XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(combined), '합친 표');
    }
    const serialized = await serializeSheet(output, options.format || 'xlsx', options);
    return { blob: serialized.blob, filename: `표-${files.length}개-합침.${serialized.extension}`, summary: `${files.length}개 표 파일을 합쳤어.` };
}

async function splitSheets(file, options, onProgress) {
    const { workbook, XLSX } = await readWorkbook(file);
    const format = options.format || 'xlsx';
    const outputs = [];
    for (let index = 0; index < workbook.SheetNames.length; index += 1) {
        const name = workbook.SheetNames[index];
        const single = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(single, workbook.Sheets[name], name.slice(0, 31));
        const serialized = await serializeSheet(single, format, options);
        outputs.push({ name: `${fileStem(file.name)}-${safeOutputFilename(name, `시트-${index + 1}`)}.${serialized.extension}`, blob: serialized.blob });
        onProgress({ phase: 'process', completed: index + 1, total: workbook.SheetNames.length, message: `${index + 1}/${workbook.SheetNames.length} 시트를 분리했어.` });
    }
    const zipped = await zipOutputs(outputs, `${fileStem(file.name)}-시트분리.zip`);
    return { ...zipped, summary: `${outputs.length}개 시트를 각각 분리했어.` };
}

function compareRows(left, right) {
    const maxRows = Math.max(left.length, right.length);
    const differences = [];
    for (let row = 0; row < maxRows; row += 1) {
        const maxColumns = Math.max(left[row]?.length || 0, right[row]?.length || 0);
        for (let column = 0; column < maxColumns; column += 1) {
            const a = left[row]?.[column] ?? '';
            const b = right[row]?.[column] ?? '';
            if (String(a) !== String(b)) differences.push({ row: row + 1, column: column + 1, before: a, after: b });
        }
    }
    return differences;
}

async function compareSheets(files) {
    const left = await readWorkbook(files[0]);
    const right = await readWorkbook(files[1]);
    const names = [...new Set([...left.workbook.SheetNames, ...right.workbook.SheetNames])];
    const report = names.map(name => {
        const leftRows = left.workbook.Sheets[name] ? rowsFromSheet(left.XLSX, left.workbook.Sheets[name], true) : [];
        const rightRows = right.workbook.Sheets[name] ? rowsFromSheet(right.XLSX, right.workbook.Sheets[name], true) : [];
        return { sheet: name, differences: compareRows(leftRows, rightRows) };
    });
    const total = report.reduce((sum, sheet) => sum + sheet.differences.length, 0);
    const escape = value => xmlEscape(value);
    const rows = report.flatMap(sheet => sheet.differences.map(item => `<tr><td>${escape(sheet.sheet)}</td><td>${item.row}</td><td>${item.column}</td><td>${escape(item.before)}</td><td>${escape(item.after)}</td></tr>`)).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>표 비교 결과</title><style>body{font-family:system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:.4rem;text-align:left}</style><h1>표 비교 결과</h1><p>${total}개 셀이 달라.</p><table><thead><tr><th>시트</th><th>행</th><th>열</th><th>이전</th><th>이후</th></tr></thead><tbody>${rows}</tbody></table>`;
    return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), filename: `${fileStem(files[0].name)}-비교.html`, summary: `${total}개 셀이 달라.` };
}

async function transformWorkbook(file, options, transform) {
    const { workbook, XLSX } = await readWorkbook(file);
    const output = XLSX.utils.book_new();
    for (const name of workbook.SheetNames) {
        const rows = rowsFromSheet(XLSX, workbook.Sheets[name], true);
        XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(transform(rows, name)), uniqueSheetName(output, name));
    }
    const serialized = await serializeSheet(output, options.format || 'xlsx', options);
    return { blob: serialized.blob, extension: serialized.extension, sheetCount: output.SheetNames.length };
}

async function cleanSheet(file, options) {
    const transformed = await transformWorkbook(file, options, rows => {
        let cleaned = options.removeBlank === false ? rows : trimMatrix(rows);
        if (options.dedupe !== false && cleaned.length) {
            const header = options.hasHeader === false ? [] : [cleaned[0]];
            const seen = new Set();
            const data = (header.length ? cleaned.slice(1) : cleaned).filter(row => {
                const key = JSON.stringify(row.map(value => value ?? ''));
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            cleaned = [...header, ...data];
        }
        return cleaned;
    });
    return { blob: transformed.blob, filename: `${fileStem(file.name)}-정리.${transformed.extension}`, summary: `${transformed.sheetCount}개 시트의 빈 행열과 중복을 정리했어.` };
}

async function selectColumns(file, options) {
    const requested = Array.isArray(options.columns) ? options.columns : String(options.columns || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!requested.length) throw new Error('남길 열 이름이나 번호를 골라줘.');
    const { workbook, XLSX } = await readWorkbook(file);
    const output = XLSX.utils.book_new();
    for (const name of workbook.SheetNames) {
        const rows = rowsFromSheet(XLSX, workbook.Sheets[name], true);
        if (!rows.length) continue;
        const header = rows[0].map(String);
        const indices = requested.map(value => /^\d+$/.test(String(value)) ? Number(value) - 1 : header.indexOf(String(value))).filter(index => index >= 0 && index < header.length);
        if (!indices.length) continue;
        const selected = rows.map(row => indices.map(index => row[index] ?? ''));
        XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(selected), uniqueSheetName(output, name));
    }
    if (!output.SheetNames.length) throw new Error('고른 열을 찾지 못했어.');
    const serialized = await serializeSheet(output, options.format || 'xlsx', options);
    return { blob: serialized.blob, filename: `${fileStem(file.name)}-열추출.${serialized.extension}`, summary: `${requested.length}개 열을 추출했어.` };
}

async function transposeSheet(file, options) {
    const transformed = await transformWorkbook(file, options, rows => {
        const width = Math.max(0, ...rows.map(row => row.length));
        return Array.from({ length: width }, (_, column) => rows.map(row => row[column] ?? ''));
    });
    return { blob: transformed.blob, filename: `${fileStem(file.name)}-행열전환.${transformed.extension}`, summary: `${transformed.sheetCount}개 시트의 행과 열을 뒤집었어.` };
}

async function extractMedia(file) {
    const JSZip = (await import('jszip')).default;
    const source = await JSZip.loadAsync(await file.arrayBuffer());
    const output = new JSZip();
    const names = Object.keys(source.files).filter(name => /^xl\/media\//i.test(name) && !source.files[name].dir);
    for (const name of names) output.file(name.replace(/^xl\/media\//i, ''), await source.files[name].async('uint8array'));
    if (!names.length) output.file('README.txt', '이 엑셀 파일에서 포함된 이미지나 미디어를 찾지 못했어.\n');
    return { blob: await output.generateAsync({ type: 'blob' }), filename: `${fileStem(file.name)}-미디어.zip`, summary: `${names.length}개 미디어 파일을 추출했어.` };
}

async function sanitizeSheet(file) {
    const { workbook } = await readWorkbook(file);
    workbook.Props = {};
    workbook.Custprops = {};
    workbook.Workbook ||= {};
    workbook.Workbook.Names = [];
    const serialized = await serializeSheet(workbook, 'xlsx');
    return { blob: serialized.blob, filename: `${fileStem(file.name)}-메타데이터제거.xlsx`, summary: '문서 속성과 사용자 지정 메타데이터를 제거했어.' };
}

export async function runSheetTool(toolId, files, options = {}, onProgress = () => {}) {
    switch (toolId) {
        case 'sheet-convert': return await convertSheets(files, options, onProgress);
        case 'sheet-merge': return await mergeSheets(files, options, onProgress);
        case 'sheet-split': return await splitSheets(files[0], options, onProgress);
        case 'sheet-compare': return await compareSheets(files);
        case 'sheet-clean': return await cleanSheet(files[0], options);
        case 'sheet-select-columns': return await selectColumns(files[0], options);
        case 'sheet-transpose': return await transposeSheet(files[0], options);
        case 'sheet-extract-media': return await extractMedia(files[0]);
        case 'sheet-sanitize': return await sanitizeSheet(files[0]);
        default: throw new Error(`지원하지 않는 표 작업이야: ${toolId}`);
    }
}

export { readWorkbook, rowsFromSheet, serializeSheet };
