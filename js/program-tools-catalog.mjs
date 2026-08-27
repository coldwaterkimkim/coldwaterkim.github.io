const MB = 1024 * 1024;
const IMAGE_ACCEPT = Object.freeze(['image/*', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);

export const TOOL_CATEGORIES = Object.freeze([
    { id: 'document', label: '문서 변환', description: '오피스 문서와 PDF를 서로 바꿉니다.' },
    { id: 'pdf', label: 'PDF 작업', description: 'PDF 페이지를 합치고 정리하고 마감합니다.' },
    { id: 'image', label: '이미지 작업', description: '이미지를 일괄 변환하고 크기와 용량을 정리합니다.' },
    { id: 'sheet', label: '엑셀·표 작업', description: '엑셀, CSV와 표 데이터를 변환하고 정리합니다.' },
]);

const tool = (id, category, label, engine, extra = {}) => Object.freeze({
    id,
    category,
    label,
    engine,
    maxFiles: extra.maxFiles ?? (engine === 'server' ? 20 : 100),
    maxFileBytes: extra.maxFileBytes ?? (engine === 'server' ? 200 * MB : 250 * MB),
    accept: extra.accept ?? [],
    description: extra.description ?? '',
    ...extra,
});

export const TOOLS = Object.freeze([
    tool('office-to-pdf', 'document', '문서 → PDF', 'server', { accept: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'], description: '문서의 원래 레이아웃을 최대한 유지하며 PDF로 변환합니다.' }),
    tool('hwp-to-pdf', 'document', 'HWP·HWPX → PDF', 'server', { accept: ['.hwp', '.hwpx'], maxFiles: 1, description: '한글 문서를 PDF로 변환합니다.' }),
    tool('pdf-to-docx', 'document', 'PDF → DOCX', 'local', { accept: ['application/pdf', '.pdf'], description: 'PDF에서 읽을 수 있는 텍스트를 추출해 편집용 DOCX로 만듭니다.' }),
    tool('pdf-to-xlsx', 'document', 'PDF → XLSX', 'local', { accept: ['application/pdf', '.pdf'], description: 'PDF 텍스트를 페이지별 시트로 옮깁니다.' }),
    tool('pdf-to-pptx', 'document', 'PDF → PPTX', 'local', { accept: ['application/pdf', '.pdf'], description: '각 PDF 페이지를 한 장의 슬라이드 이미지로 만듭니다.' }),

    tool('pdf-merge', 'pdf', 'PDF 합치기', 'local', { accept: ['application/pdf', '.pdf'], minFiles: 2 }),
    tool('pdf-organize', 'pdf', '페이지 정리·추출·회전', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('images-to-pdf', 'pdf', '이미지 → PDF', 'local', { accept: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] }),
    tool('pdf-to-images', 'pdf', 'PDF → 이미지', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-page-number', 'pdf', '페이지 번호 넣기', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-watermark', 'pdf', '워터마크 넣기', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-crop', 'pdf', '여백 자르기', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-nup', 'pdf', '여러 페이지 한 장에 배치', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-sanitize', 'pdf', '메타데이터·주석 청소', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-redact-raster', 'pdf', '민감정보 완전 가림', 'local', { accept: ['application/pdf', '.pdf'], maxFiles: 1, description: '선택 영역을 가린 뒤 모든 페이지를 새 이미지 PDF로 만들어 원문 객체를 제거합니다.' }),
    tool('pdf-compare', 'pdf', 'PDF 두 개 비교', 'local', { accept: ['application/pdf', '.pdf'], minFiles: 2, maxFiles: 2 }),
    tool('pdf-ocr', 'pdf', 'OCR·검색 가능한 PDF', 'server', { accept: ['application/pdf', 'image/*', '.pdf', '.jpg', '.jpeg', '.png', '.heic'], maxFiles: 20, description: '스캔 이미지의 글자를 인식해 검색 가능한 PDF로 만듭니다.' }),
    tool('pdf-compress', 'pdf', 'PDF 용량 줄이기', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-protect', 'pdf', 'PDF 암호 설정', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-unlock', 'pdf', 'PDF 암호 해제', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-repair', 'pdf', '손상 PDF 복구', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-grayscale', 'pdf', '흑백 PDF 만들기', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),
    tool('pdf-to-text', 'pdf', 'PDF → 텍스트', 'server', { accept: ['application/pdf', '.pdf'], maxFiles: 1 }),

    tool('image-convert', 'image', '이미지 형식 변환', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-compress', 'image', '이미지 용량 줄이기', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-resize', 'image', '이미지 크기 통일', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-center-crop', 'image', '가운데 맞춰 자르기', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-rotate', 'image', '이미지 회전', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-watermark', 'image', '이미지 워터마크', 'local', { accept: IMAGE_ACCEPT }),
    tool('image-strip-metadata', 'image', '위치·메타데이터 제거', 'local', { accept: IMAGE_ACCEPT, description: '픽셀만 새 파일로 다시 저장해 EXIF와 위치정보를 제거합니다.' }),

    tool('sheet-convert', 'sheet', '표 형식 변환', 'local', { accept: ['.xlsx', '.xls', '.csv', '.json', '.html', '.md', '.xml', '.yaml', '.yml'] }),
    tool('sheet-merge', 'sheet', '엑셀·CSV 합치기', 'local', { accept: ['.xlsx', '.xls', '.csv'] }),
    tool('sheet-split', 'sheet', '시트별 파일 분리', 'local', { accept: ['.xlsx', '.xls'], maxFiles: 1 }),
    tool('sheet-compare', 'sheet', '엑셀·CSV 비교', 'local', { accept: ['.xlsx', '.xls', '.csv'], minFiles: 2, maxFiles: 2 }),
    tool('sheet-clean', 'sheet', '중복·빈 행열 정리', 'local', { accept: ['.xlsx', '.xls', '.csv'] }),
    tool('sheet-select-columns', 'sheet', '필요한 열만 추출', 'local', { accept: ['.xlsx', '.xls', '.csv'] }),
    tool('sheet-transpose', 'sheet', '행과 열 뒤집기', 'local', { accept: ['.xlsx', '.xls', '.csv'] }),
    tool('sheet-extract-media', 'sheet', '엑셀 이미지 추출', 'local', { accept: ['.xlsx'], maxFiles: 1 }),
    tool('sheet-sanitize', 'sheet', '엑셀 메타데이터 제거', 'local', { accept: ['.xlsx', '.xls'], maxFiles: 1 }),
]);

export const TOOL_BY_ID = new Map(TOOLS.map(item => [item.id, item]));

export function safeOutputFilename(value, fallback = 'result') {
    const input = String(value || '').normalize('NFKC');
    const cleaned = input
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\.\.+/g, '.')
        .replace(/^\.+/, '')
        .replace(/[. ]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
    return cleaned || fallback;
}

export function fileStem(filename, fallback = 'result') {
    const safe = safeOutputFilename(filename, fallback);
    const dot = safe.lastIndexOf('.');
    return dot > 0 ? safe.slice(0, dot) : safe;
}

export function validateToolInput(toolId, files) {
    const selected = TOOL_BY_ID.get(toolId);
    if (!selected) throw new Error(`알 수 없는 도구야: ${toolId}`);
    const list = Array.from(files || []);
    if (list.length < (selected.minFiles || 1)) throw new Error(`파일을 ${selected.minFiles || 1}개 이상 골라줘.`);
    if (list.length > selected.maxFiles) throw new Error(`한 번에 ${selected.maxFiles}개까지만 처리할 수 있어.`);
    for (const file of list) {
        if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('올바른 파일만 처리할 수 있어.');
        if (Number(file.size) > selected.maxFileBytes) throw new Error(`${safeOutputFilename(file.name, '파일')}의 크기가 제한을 넘었어.`);
        const extension = String(file.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '';
        const mime = String(file.type || '').toLowerCase();
        const accepted = selected.accept.some(rule => {
            const normalized = String(rule).toLowerCase();
            if (normalized.startsWith('.')) return extension === normalized;
            if (normalized.endsWith('/*')) return mime.startsWith(normalized.slice(0, -1));
            return mime === normalized;
        });
        if (!accepted) throw new Error(`${safeOutputFilename(file.name, '파일')}은 이 도구에서 받을 수 없는 형식이야.`);
    }
    return { tool: selected, files: list };
}

const PDF_IDS = new Set(TOOLS.filter(item => item.engine === 'local' && (item.category === 'pdf' || item.id.startsWith('pdf-'))).map(item => item.id));
const IMAGE_IDS = new Set(TOOLS.filter(item => item.engine === 'local' && item.category === 'image').map(item => item.id));
const SHEET_IDS = new Set(TOOLS.filter(item => item.engine === 'local' && item.category === 'sheet').map(item => item.id));

export async function runLocalTool(toolId, files, options = {}, onProgress = () => {}) {
    const validated = validateToolInput(toolId, files);
    if (validated.tool.engine !== 'local') throw new Error('이 도구는 아이맥 처리 서버에서 실행해야 해.');
    const progress = typeof onProgress === 'function' ? onProgress : () => {};
    progress({ phase: 'prepare', completed: 0, total: 1, message: '파일을 확인하고 있어.' });

    let result;
    if (PDF_IDS.has(toolId) || ['pdf-to-docx', 'pdf-to-xlsx', 'pdf-to-pptx'].includes(toolId) || toolId === 'images-to-pdf') {
        const module = await import('./program-tools-pdf.mjs');
        result = await module.runPdfTool(toolId, validated.files, options, progress);
    } else if (IMAGE_IDS.has(toolId)) {
        const module = await import('./program-tools-image.mjs');
        result = await module.runImageTool(toolId, validated.files, options, progress);
    } else if (SHEET_IDS.has(toolId)) {
        const module = await import('./program-tools-sheet.mjs');
        result = await module.runSheetTool(toolId, validated.files, options, progress);
    } else {
        throw new Error(`로컬 실행기가 아직 연결되지 않았어: ${toolId}`);
    }

    if (!(result?.blob instanceof Blob) || result.blob.size < 1) throw new Error('결과 파일을 만들지 못했어.');
    result.filename = safeOutputFilename(result.filename, 'result.bin');
    progress({ phase: 'done', completed: 1, total: 1, message: '작업이 끝났어.' });
    return result;
}
