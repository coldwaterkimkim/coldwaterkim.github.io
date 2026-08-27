import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    BlockNoteSchema,
    createImageBlockConfig,
    defaultBlockSpecs,
    imageParse
} from '@blocknote/core';
import { FormattingToolbarExtension } from '@blocknote/core/extensions';
import {
    createReactBlockSpec,
    FormattingToolbar,
    FormattingToolbarController,
    getFormattingToolbarItems,
    ImageBlock,
    ImageToExternalHTML,
    ResizableFileBlockWrapper,
    useBlockNoteEditor,
    useComponentsContext,
    useCreateBlockNote,
    useEditorState,
    useResolveUrl
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@mantine/core/styles.css';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '../css/editor-crop.css';
import { chatGptShareInfo, normalizeChatGptSnapshot, serializeChatGptSnapshot } from './chatgpt-embeds.mjs';
import { observeEditorMediaDuringUploads } from './editor-media-quiescence.mjs';
import { isYouTubeUrl, pocketBaseImageSources, prepareRichContentHtml } from './media-embeds.js';
import { getChatGptSharePreview } from './pb.js';
import { preferredTransferFiles, preferredTransferImageFiles, uniqueSupportedFiles, uniqueTransferFiles } from './editor-file-transfer.mjs';
import {
    cropAspectFromRect,
    cropPixelWidthFromRect,
    fitImageCropToAspect,
    imageCropBlockProps,
    imageCropFromBlockProps,
    imageCropStyle,
    IMAGE_CROP_DATA_ATTRIBUTE,
    IMAGE_CROP_MIN_FRACTION,
    normalizeImageCrop,
    parseImageCrop,
    serializeImageCrop
} from './image-crop.mjs';
export { createEditorUploadCoordinator } from './editor-upload-coordinator.mjs';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EDITOR_UPLOAD_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'audio/mpeg',
    'audio/mp3',
    'application/pdf'
]);

const CROPPABLE_IMAGE_CONFIG = {
    ...createImageBlockConfig(),
    propSchema: {
        ...createImageBlockConfig().propSchema,
        cropEnabled: { default: false },
        cropX: { default: 0, type: 'number' },
        cropY: { default: 0, type: 'number' },
        cropWidth: { default: 1, type: 'number' },
        cropHeight: { default: 1, type: 'number' },
        cropAspect: { default: 0, type: 'number' },
        cropPixelWidth: { default: 0, type: 'number' }
    }
};

const CroppableImageBlockSpec = createReactBlockSpec(CROPPABLE_IMAGE_CONFIG, {
    meta: {
        fileBlockAccept: ['image/*']
    },
    render: CroppableImageBlock,
    parse: parseCroppableImageElement,
    toExternalHTML: CroppableImageToExternalHTML,
    runsBefore: ['file']
});

const CHATGPT_EMBED_CONFIG = {
    type: 'chatgptEmbed',
    propSchema: {
        url: { default: '' },
        snapshot: { default: '' },
        error: { default: '' }
    },
    content: 'none'
};

const ChatGptEmbedBlockSpec = createReactBlockSpec(CHATGPT_EMBED_CONFIG, {
    render: ChatGptEmbedBlock,
    parse: parseChatGptEmbedElement,
    toExternalHTML: ChatGptEmbedBlock,
    runsBefore: ['default']
});

const CWK_EDITOR_SCHEMA = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,
        image: CroppableImageBlockSpec(),
        chatgptEmbed: ChatGptEmbedBlockSpec()
    }
});

const h = React.createElement;
const CROP_RATIO_OPTIONS = [
    { value: 'free', label: '자유' },
    { value: '1', label: '1:1' },
    { value: String(4 / 3), label: '4:3' },
    { value: String(16 / 9), label: '16:9' }
];

export async function createMarkdownEditor(target, options = {}) {
    const root = typeof target === 'string'
        ? document.querySelector(target)
        : target;

    if (!root) {
        throw new Error('Markdown editor target not found');
    }

    return new BlockNoteMarkdownEditor(root, options);
}

export function hasImageTransfer(dataTransfer) {
    if (!dataTransfer) return false;
    return Array.from(dataTransfer.items || []).some(item => item.type?.startsWith('image/'))
        || Array.from(dataTransfer.files || []).some(file => file.type?.startsWith('image/'));
}

export function hasEditorFileTransfer(dataTransfer) {
    if (!dataTransfer) return false;

    return Array.from(dataTransfer.files || []).some(isSupportedEditorUpload)
        || Array.from(dataTransfer.items || []).some(item => {
            if (item.kind !== 'file') return false;
            return !item.type || EDITOR_UPLOAD_MIME_TYPES.has(String(item.type).toLowerCase());
        });
}

export function editorFilesFromTransfer(dataTransfer, options = {}) {
    if (!dataTransfer) return [];

    return normalizeEditorFiles(preferredTransferFiles(dataTransfer), options);
}

export function normalizeEditorFiles(files, options = {}) {
    const fallbackNamePrefix = options.fallbackNamePrefix || 'editor-file';

    return uniqueTransferFiles(files)
        .filter(isSupportedEditorUpload)
        .map((file, index) => namedEditorFile(file, index, fallbackNamePrefix));
}

export function imageFilesFromTransfer(dataTransfer, options = {}) {
    if (!dataTransfer) return [];

    const mimeTypes = options.mimeTypes || IMAGE_MIME_TYPES;
    const fallbackNamePrefix = options.fallbackNamePrefix || 'editor-image';
    const transferFiles = preferredTransferImageFiles(dataTransfer);

    return normalizeEditorImageFiles(transferFiles, {
        mimeTypes,
        fallbackNamePrefix
    });
}

export function normalizeEditorImageFiles(files, options = {}) {
    const mimeTypes = options.mimeTypes || IMAGE_MIME_TYPES;
    const fallbackNamePrefix = options.fallbackNamePrefix || 'editor-image';

    return uniqueSupportedFiles(files, mimeTypes)
        .map((file, index) => namedImageFile(file, index, fallbackNamePrefix));
}

export function stopEditorTransferEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
}

export function isSupportedEditorUpload(file) {
    if (!file) return false;

    const type = String(file.type || '').toLowerCase();
    if (EDITOR_UPLOAD_MIME_TYPES.has(type)) return true;

    return /\.(jpe?g|png|gif|webp|mp4|webm|mov|m4v|mp3|pdf)$/i.test(file.name || '');
}

export function editorUploadLabel(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();

    if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(name)) return '영상';
    if (type.startsWith('audio/') || /\.mp3$/i.test(name)) return '오디오';
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF';
    if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)) return '이미지';
    return '파일';
}

class BlockNoteMarkdownEditor {
    constructor(root, options = {}) {
        this.mount = root;
        this.options = options;
        this.editor = null;
        this.currentHtml = '';
        this.pendingHtml = '';
        this.uploadActivityCount = 0;
        this.uploadClassWasPresent = false;
        this.readyPromise = new Promise(resolve => {
            this.resolveReady = resolve;
        });

        this.mount.classList.add('markdown-editor-shell', 'blocknote-editor-shell');
        this.mount.innerHTML = `
            <div class="markdown-editor-inline-toolbar blocknote-editor-toolbar">
                <button type="button" class="markdown-editor-image-button">이미지</button>
                <span class="blocknote-editor-badge">BlockNote test</span>
            </div>
            <div class="blocknote-editor-mount"></div>
            <div class="markdown-editor-crop-dialog-mount"></div>
        `;

        this.inlineToolbar = this.mount.querySelector('.markdown-editor-inline-toolbar');
        this.imageButton = this.mount.querySelector('.markdown-editor-image-button');
        this.editorMount = this.mount.querySelector('.blocknote-editor-mount');
        this.cropDialogMount = this.mount.querySelector('.markdown-editor-crop-dialog-mount');
        this.reactRoot = createRoot(this.editorMount);
        this.cropDialogRoot = createRoot(this.cropDialogMount);
        const uploadContainer = this.mount.closest('.editor-container, .program-editor-container') || this.mount;
        this.uploadContainer = uploadContainer;
        this.mediaQuiescence = observeEditorMediaDuringUploads(uploadContainer, {
            mediaRoot: this.mount
        });

        this.root = {
            addEventListener: (...args) => this.mount.addEventListener(...args),
            removeEventListener: (...args) => this.mount.removeEventListener(...args),
            focus: () => this.focus()
        };

        Object.defineProperty(this.root, 'innerHTML', {
            get: () => this.html(),
            set: html => this.setHtml(html)
        });

        this.editorApi = {
            setPlaceholder: placeholder => this.setPlaceholder(placeholder),
            insertImages: (index, images = []) => this.insertImages(index, images),
            insertFiles: (index, files = []) => this.insertFiles(index, files)
        };
        this.editor = this.editorApi;

        this.reactRoot.render(React.createElement(BlockNoteMount, {
            adapter: this,
            placeholder: options.placeholder || 'Markdown으로 작성하기...'
        }));

        this.imageButton?.addEventListener('click', () => {
            if (typeof options.onImageButton === 'function') {
                options.onImageButton();
            }
        });

        this.mount.addEventListener('click', event => {
            const image = event.target instanceof Element
                ? event.target.closest('.bn-block-content[data-content-type="image"] .bn-visual-media')
                : null;
            if (!image) return;
            this.blockNote?.getExtension?.(FormattingToolbarExtension)?.store?.setState(true);
        });

        this.mount.addEventListener('paste', (event) => {
            const text = event.clipboardData?.getData('text/plain')?.trim();
            const chatGptShare = chatGptShareInfo(text);
            if (!text || (!chatGptShare && !isYouTubeUrl(text))) return;

            event.preventDefault();
            event.stopPropagation();
            if (chatGptShare) {
                void this.insertChatGptEmbed(this.clampIndex(this.getSelection()?.index), chatGptShare.url);
            } else {
                this.insertVideo(this.clampIndex(this.getSelection()?.index), text, 'YouTube video');
            }
        }, true);
    }

    bindEditor(editor) {
        this.blockNote = editor;
        this.editor = {
            ...this.editorApi,
            blockNote: editor
        };

        if (this.pendingHtml) {
            this.applyHtml(this.pendingHtml);
            this.pendingHtml = '';
        } else {
            this.currentHtml = this.htmlFromEditor();
        }

        this.resolveReady?.();
    }

    requestImageCrop(blockId) {
        const block = blockId ? this.blockNote?.getBlock?.(blockId) : null;
        if (!block || block.type !== 'image' || !block.props?.url) {
            return;
        }

        const blockElement = this.mount.querySelector(`[data-id="${cssSelectorString(block.id)}"]`);
        const displayedImage = blockElement?.querySelector('.bn-visual-media');
        const target = {
            block,
            displayedWidth: Math.round(displayedImage?.getBoundingClientRect?.().width || block.props.previewWidth || 0)
        };
        this.cropDialogRoot.render(React.createElement(ImageCropDialog, {
            target,
            onCancel: () => this.cropDialogRoot.render(null),
            onSave: crop => {
                this.applyImageCrop(target.block.id, crop, target.displayedWidth);
                this.cropDialogRoot.render(null);
            }
        }));
    }

    applyImageCrop(blockId, crop, displayedWidth = 0) {
        const block = this.blockNote?.getBlock?.(blockId);
        if (!block || block.type !== 'image') return;

        const nextProps = imageCropBlockProps(crop);
        if (nextProps.cropEnabled && !block.props.previewWidth) {
            nextProps.previewWidth = Math.max(64, Math.round(displayedWidth || crop.pixelWidth || 640));
        }
        this.blockNote.updateBlock(block, { props: nextProps });
        this.currentHtml = this.htmlFromEditor();
    }

    async ready() {
        await this.readyPromise;
        return this.blockNote;
    }

    setPlaceholder(placeholder = '') {
        this.mount.style.setProperty('--blocknote-placeholder', `"${cssString(String(placeholder || ''))}"`);
        if (this.blockNote?.dictionary?.placeholders) {
            this.blockNote.dictionary.placeholders.default = placeholder;
            this.blockNote.dictionary.placeholders.emptyDocument = placeholder;
        }
    }

    async withUploadActivity(callback) {
        if (typeof callback !== 'function') return undefined;

        if (this.uploadActivityCount === 0) {
            this.uploadClassWasPresent = this.uploadContainer.classList.contains('is-image-uploading');
            this.uploadContainer.classList.add('is-image-uploading');
            this.mediaQuiescence?.sync?.();
        }
        this.uploadActivityCount += 1;

        try {
            return await callback();
        } finally {
            this.uploadActivityCount = Math.max(0, this.uploadActivityCount - 1);
            if (this.uploadActivityCount === 0) {
                if (!this.uploadClassWasPresent) {
                    this.uploadContainer.classList.remove('is-image-uploading');
                }
                this.uploadClassWasPresent = false;
                this.mediaQuiescence?.sync?.();
            }
        }
    }

    focus() {
        this.blockNote?.focus?.();
        this.blockNote?.prosemirrorView?.focus?.();
    }

    destroy() {
        this.mediaQuiescence?.destroy?.({ restore: false });
        this.reactRoot?.unmount?.();
    }

    getLength() {
        return this.textLength() + 1;
    }

    getSelection() {
        return {
            index: this.textLength(),
            length: 0
        };
    }

    setSelection() {
        this.focus();
    }

    clampIndex(index) {
        const maxIndex = Math.max(0, this.textLength());
        if (!Number.isFinite(index)) return maxIndex;
        return Math.min(Math.max(0, index), maxIndex);
    }

    setHtml(html = '') {
        const normalized = String(html || '').trim();
        if (!this.blockNote) {
            this.pendingHtml = normalized;
            this.currentHtml = normalized;
            return;
        }

        this.applyHtml(normalized);
    }

    applyHtml(html = '') {
        const normalized = String(html || '').trim();
        if (!this.blockNote) return;

        if (!normalized || normalized === '<p><br></p>') {
            this.blockNote.replaceBlocks(this.blockNote.document, [{ type: 'paragraph', content: '' }]);
        } else {
            const blocks = this.blockNote.tryParseHTMLToBlocks(normalized);
            this.blockNote.replaceBlocks(
                this.blockNote.document,
                blocks.length ? blocks : [{ type: 'paragraph', content: '' }]
            );
        }

        this.currentHtml = this.htmlFromEditor();
    }

    html() {
        if (!this.blockNote) return this.currentHtml;
        this.currentHtml = this.htmlFromEditor();
        return this.currentHtml;
    }

    htmlFromEditor() {
        return prepareRichContentHtml(this.blockNote?.blocksToHTMLLossy(this.blockNote.document).trim() || '');
    }

    textLength() {
        const blocks = this.blockNote?.document || [];
        return JSON.stringify(blocks).length;
    }

    insertText(_index, text = '') {
        if (!this.blockNote) return 0;
        this.blockNote.pasteMarkdown(String(text || ''));
        this.currentHtml = this.htmlFromEditor();
        return this.textLength();
    }

    insertImage(_index, url, alt = 'image') {
        return this.insertImages(_index, [{ url, alt }]);
    }

    insertImages(_index, images = []) {
        const imageBlocks = Array.from(images || [])
            .filter(image => image?.url)
            .map(image => ({
                type: 'image',
                props: {
                    url: image.url,
                    name: cleanImageName(image.alt || image.name),
                    caption: '',
                    showPreview: true
                }
            }));

        return this.insertBlocksAtCursor(imageBlocks);
    }

    insertFiles(_index, files = []) {
        const blocks = Array.from(files || [])
            .filter(file => file?.url)
            .map(file => editorFileBlock(file));

        return this.insertBlocksAtCursor(blocks);
    }

    insertVideo(_index, url, name = 'video') {
        if (!this.blockNote) return 0;

        return this.insertFileBlock('video', {
            url,
            name: cleanImageName(name),
            caption: '',
            showPreview: true
        });
    }

    async insertChatGptEmbed(_index, url) {
        const share = chatGptShareInfo(url);
        if (!this.blockNote || !share) return 0;

        let insertedBlock = null;
        const insertedLength = this.insertBlocksAtCursor([{
            type: 'chatgptEmbed',
            props: {
                url: share.url,
                snapshot: '',
                error: ''
            }
        }], blocks => {
            insertedBlock = blocks[0] || null;
        });
        if (!insertedBlock?.id) return insertedLength;

        try {
            const resolver = this.options.resolveChatGptShare || getChatGptSharePreview;
            const snapshot = normalizeChatGptSnapshot(await this.withUploadActivity(() => resolver(share.url)));
            if (!snapshot) throw new Error('공개 대화가 비어 있습니다.');
            const currentBlock = this.blockNote?.getBlock?.(insertedBlock.id);
            if (currentBlock) {
                this.blockNote.updateBlock(currentBlock, {
                    props: {
                        url: share.url,
                        snapshot: serializeChatGptSnapshot(snapshot),
                        error: ''
                    }
                });
            }
        } catch (error) {
            const currentBlock = this.blockNote?.getBlock?.(insertedBlock.id);
            if (currentBlock) {
                this.blockNote.updateBlock(currentBlock, {
                    props: {
                        url: share.url,
                        snapshot: '',
                        error: String(error?.message || '공유 대화를 불러오지 못했습니다.').slice(0, 240)
                    }
                });
            }
        }
        this.currentHtml = this.htmlFromEditor();
        return this.textLength();
    }

    insertFileBlock(type, props) {
        return this.insertBlocksAtCursor([{
            type,
            props
        }]);
    }

    insertBlocksAtCursor(blocks = [], onInserted) {
        if (!this.blockNote || !blocks.length) return 0;

        const currentBlock = this.currentBlock();
        let insertedBlocks = [];

        if (currentBlock && isEmptyParagraph(currentBlock)) {
            const [firstBlock, ...restBlocks] = blocks;
            const updatedBlock = this.blockNote.updateBlock(currentBlock, firstBlock);
            insertedBlocks = [updatedBlock];

            if (restBlocks.length) {
                insertedBlocks = insertedBlocks.concat(this.blockNote.insertBlocks(restBlocks, updatedBlock, 'after'));
            }
        } else if (currentBlock) {
            insertedBlocks = this.blockNote.insertBlocks(blocks, currentBlock, 'after');
        } else {
            const lastBlock = this.blockNote.document.at(-1);
            if (lastBlock) {
                insertedBlocks = this.blockNote.insertBlocks(blocks, lastBlock, 'after');
            } else {
                this.blockNote.replaceBlocks(this.blockNote.document, blocks);
                insertedBlocks = this.blockNote.document.slice(-blocks.length);
            }
        }

        const lastInsertedBlock = insertedBlocks.at(-1);
        if (typeof onInserted === 'function') onInserted(insertedBlocks);
        if (lastInsertedBlock) {
            try {
                this.blockNote.setTextCursorPosition(lastInsertedBlock, 'end');
            } catch (_error) {
                // Media blocks may not always accept a text cursor; insertion still succeeded.
            }
        }

        this.currentHtml = this.htmlFromEditor();
        return this.textLength();
    }

    currentBlock() {
        try {
            return this.blockNote.getTextCursorPosition().block;
        } catch (_error) {
            return this.blockNote?.document?.at(-1) || null;
        }
    }
}

function ChatGptEmbedBlock(props) {
    const share = chatGptShareInfo(props.block.props.url);
    if (!share) {
        return h('p', null, '올바른 ChatGPT 공유 링크가 아닙니다.');
    }

    const snapshot = normalizeChatGptSnapshot(props.block.props.snapshot);
    const error = String(props.block.props.error || '').trim();
    const status = snapshot
        ? h('div', { className: 'cwk-chatgpt-embed-scroll' },
            snapshot.messages.map((message, index) => h('section', {
                className: 'cwk-chatgpt-message',
                'data-role': message.role,
                key: `${message.role}-${index}`
            },
            h('div', { className: 'cwk-chatgpt-message-label' }, message.role === 'user' ? '나' : '지피띠니'),
            h('div', { className: 'cwk-chatgpt-message-text' }, message.text)
            )))
        : error
            ? h('div', { className: 'cwk-chatgpt-embed-error' },
            h('strong', null, '미리보기를 불러오지 못했어.'),
            h('span', null, ` ${error}`)
            )
            : h('div', { className: 'cwk-chatgpt-embed-loading' }, '공유 대화를 불러오는 중...');

    return h('div', {
        className: 'cwk-chatgpt-embed',
        contentEditable: false,
        'data-cwk-chatgpt-embed': 'true',
        'data-cwk-chatgpt-snapshot': serializeChatGptSnapshot(snapshot),
        'data-cwk-chatgpt-error': snapshot ? '' : props.block.props.error
    },
    h('div', { className: 'cwk-chatgpt-embed-titlebar' },
        h('strong', null, snapshot?.title || 'ChatGPT 공유 대화'),
        h('a', {
            href: share.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            'data-cwk-chatgpt-link': 'true'
        }, '[ 새 창으로 보기 ]')
    ),
    status,
    h('p', { className: 'cwk-chatgpt-embed-fallback' },
        '미리보기가 보이지 않으면 ',
        h('a', {
            href: share.url,
            target: '_blank',
            rel: 'noopener noreferrer'
        }, '공유 대화를 새 창에서 열어주세요.'),
    ));
}

function parseChatGptEmbedElement(element) {
    if (!(element instanceof HTMLElement)) return undefined;
    if (!element.matches('[data-cwk-chatgpt-embed="true"], .cwk-chatgpt-embed')) return undefined;

    const candidate = element.querySelector('a[data-cwk-chatgpt-link]')?.getAttribute('href')
        || '';
    const share = chatGptShareInfo(candidate);
    if (!share) return undefined;

    const snapshot = element.getAttribute('data-cwk-chatgpt-snapshot') || '';
    return {
        url: share.url,
        snapshot: serializeChatGptSnapshot(snapshot),
        error: element.getAttribute('data-cwk-chatgpt-error') || ''
    };
}

function CroppableImageBlock(props) {
    const crop = imageCropFromBlockProps(props.block.props);
    const resolved = useResolveUrl(props.block.props.url);
    const cropStyles = imageCropStyle(crop);
    if (!props.block.props.showPreview) return h(ImageBlock, props);

    const originalImageUrl = resolved.loadingState === 'loading'
        ? props.block.props.url
        : resolved.downloadUrl;
    const imageUrl = pocketBaseImageSources(originalImageUrl)?.editorPreviewUrl || originalImageUrl;

    const image = h('img', {
        className: crop.enabled && cropStyles
            ? 'bn-visual-media cwk-image-crop-source'
            : 'bn-visual-media',
        src: imageUrl,
        alt: props.block.props.name || '',
        loading: 'lazy',
        decoding: 'async',
        contentEditable: false,
        draggable: false,
        style: crop.enabled && cropStyles ? cropStyles.image : undefined
    });

    const preview = crop.enabled && cropStyles
        ? h('span', {
            className: 'cwk-editor-image-crop-frame',
            style: {
                aspectRatio: cropStyles.frame.aspectRatio,
                width: '100%'
            }
        }, image)
        : image;

    return h(ResizableFileBlockWrapper, {
        ...props,
        key: crop.enabled ? 'cwk-cropped' : 'cwk-full',
        buttonIcon: h('span', { 'aria-hidden': 'true' }, '🖼️')
    }, preview);
}

function CroppableImageToExternalHTML(props) {
    const crop = imageCropFromBlockProps(props.block.props);
    const serializedCrop = serializeImageCrop(crop);
    if (!crop.enabled || !serializedCrop) return h(ImageToExternalHTML, props);
    if (!props.block.props.url || !props.block.props.showPreview) {
        return h(ImageToExternalHTML, props);
    }

    const image = h('img', {
        src: props.block.props.url,
        alt: props.block.props.name || '',
        width: props.block.props.previewWidth,
        [IMAGE_CROP_DATA_ATTRIBUTE]: serializedCrop
    });

    if (!props.block.props.caption) return image;
    return h('figure', null,
        image,
        h('figcaption', null, props.block.props.caption)
    );
}

function ImageCropToolbarButton({ adapter }) {
    const Components = useComponentsContext();
    const editor = useBlockNoteEditor();
    const block = useEditorState({
        editor,
        selector: ({ editor: currentEditor }) => {
            if (!currentEditor.isEditable) return undefined;
            const selectedBlocks = currentEditor.getSelection()?.blocks || [
                currentEditor.getTextCursorPosition().block
            ];
            if (selectedBlocks.length !== 1 || selectedBlocks[0]?.type !== 'image') return undefined;
            return selectedBlocks[0];
        }
    });

    if (!Components || !block?.props?.url) return null;
    const cropped = imageCropFromBlockProps(block.props).enabled;
    return h(Components.FormattingToolbar.Button, {
        className: 'bn-button cwk-image-crop-toolbar-button',
        label: cropped ? '이미지 다시 자르기' : '이미지 자르기',
        mainTooltip: cropped ? '이 이미지 다시 자르기' : '이 이미지 자르기',
        icon: h('span', { 'aria-hidden': 'true' }, '✂'),
        onClick: () => adapter.requestImageCrop(block.id)
    });
}

function CroppingFormattingToolbar({ adapter }) {
    const editor = useBlockNoteEditor();
    const chatGptBlock = useEditorState({
        editor,
        selector: ({ editor: currentEditor }) => {
            if (!currentEditor.isEditable) return undefined;
            const selectedBlocks = currentEditor.getSelection()?.blocks || [
                currentEditor.getTextCursorPosition().block
            ];
            if (selectedBlocks.length !== 1 || selectedBlocks[0]?.type !== 'chatgptEmbed') return undefined;
            return selectedBlocks[0];
        }
    });

    if (chatGptBlock) {
        return h(FormattingToolbar, null,
            h(ChatGptEmbedDeleteButton, {
                key: 'cwkChatGptDeleteButton',
                block: chatGptBlock,
                editor
            })
        );
    }

    const items = getFormattingToolbarItems();
    items.splice(8, 0, h(ImageCropToolbarButton, {
        key: 'cwkImageCropButton',
        adapter
    }));
    return h(FormattingToolbar, null, items);
}

function ChatGptEmbedDeleteButton({ block, editor }) {
    const Components = useComponentsContext();
    if (!Components || !block) return null;

    return h(Components.FormattingToolbar.Button, {
        className: 'bn-button',
        label: 'ChatGPT 미리보기 삭제',
        mainTooltip: 'ChatGPT 미리보기 삭제',
        icon: h('span', { 'aria-hidden': 'true' }, '✕'),
        onClick: () => {
            editor.focus();
            editor.removeBlocks([block.id]);
        }
    });
}

function parseCroppableImageElement(element) {
    const base = imageParse()(element);
    if (!base) return undefined;

    const image = element.tagName === 'IMG' ? element : element.querySelector('img');
    const crop = parseImageCrop(image?.getAttribute(IMAGE_CROP_DATA_ATTRIBUTE) || '');
    return {
        ...base,
        ...imageCropBlockProps(crop)
    };
}

function ImageCropDialog({ target, onCancel, onSave }) {
    const initialCrop = imageCropFromBlockProps(target.block.props);
    const [crop, setCrop] = useState(initialCrop.enabled
        ? initialCrop
        : normalizeImageCrop({ enabled: true, x: 0, y: 0, width: 1, height: 1 }));
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [ratioMode, setRatioMode] = useState('free');
    const [loadError, setLoadError] = useState(false);
    const stageRef = useRef(null);
    const canvasRef = useRef(null);
    const interactionRef = useRef(null);

    const naturalAspect = naturalSize.width > 0 && naturalSize.height > 0
        ? naturalSize.width / naturalSize.height
        : 0;

    const updateCanvasSize = useCallback(() => {
        const stageWidth = Math.max(0, stageRef.current?.clientWidth || 0);
        if (!stageWidth || !naturalAspect) return;

        const maxHeight = Math.min(480, Math.max(240, globalThis.innerHeight * 0.52));
        let width = stageWidth;
        let height = width / naturalAspect;
        if (height > maxHeight) {
            height = maxHeight;
            width = height * naturalAspect;
        }
        setCanvasSize({ width: Math.round(width), height: Math.round(height) });
    }, [naturalAspect]);

    useLayoutEffect(() => {
        updateCanvasSize();
        if (!stageRef.current || typeof ResizeObserver !== 'function') return undefined;
        const observer = new ResizeObserver(updateCanvasSize);
        observer.observe(stageRef.current);
        return () => observer.disconnect();
    }, [updateCanvasSize]);

    useEffect(() => {
        const onKeyDown = event => {
            if (event.key === 'Escape') onCancel();
        };
        globalThis.addEventListener('keydown', onKeyDown);
        return () => globalThis.removeEventListener('keydown', onKeyDown);
    }, [onCancel]);

    useEffect(() => {
        const onPointerMove = event => {
            const interaction = interactionRef.current;
            if (!interaction || !interaction.canvasWidth || !interaction.canvasHeight) return;

            const dx = (event.clientX - interaction.clientX) / interaction.canvasWidth;
            const dy = (event.clientY - interaction.clientY) / interaction.canvasHeight;
            if (interaction.mode === 'move') {
                setCrop(normalizeImageCrop({
                    ...interaction.crop,
                    enabled: true,
                    x: clampCrop(interaction.crop.x + dx, 0, 1 - interaction.crop.width),
                    y: clampCrop(interaction.crop.y + dy, 0, 1 - interaction.crop.height)
                }));
                return;
            }

            const pointer = {
                x: clampCrop(interaction.pointerX + dx, 0, 1),
                y: clampCrop(interaction.pointerY + dy, 0, 1)
            };
            setCrop(resizeImageCrop(interaction.crop, interaction.handle, pointer, interaction.aspect, naturalAspect));
        };
        const onPointerUp = () => {
            interactionRef.current = null;
            document.body.classList.remove('is-cwk-image-cropping');
        };

        globalThis.addEventListener('pointermove', onPointerMove);
        globalThis.addEventListener('pointerup', onPointerUp);
        globalThis.addEventListener('pointercancel', onPointerUp);
        return () => {
            globalThis.removeEventListener('pointermove', onPointerMove);
            globalThis.removeEventListener('pointerup', onPointerUp);
            globalThis.removeEventListener('pointercancel', onPointerUp);
            document.body.classList.remove('is-cwk-image-cropping');
        };
    }, [naturalAspect]);

    const beginInteraction = (event, mode, handle = '') => {
        event.preventDefault();
        event.stopPropagation();
        const canvasRect = canvasRef.current?.getBoundingClientRect?.();
        interactionRef.current = {
            mode,
            handle,
            crop,
            clientX: event.clientX,
            clientY: event.clientY,
            pointerX: crop.x + (handle.includes('e') ? crop.width : 0),
            pointerY: crop.y + (handle.includes('s') ? crop.height : 0),
            aspect: ratioMode === 'free' ? 0 : Number(ratioMode),
            canvasWidth: canvasRect?.width || canvasSize.width,
            canvasHeight: canvasRect?.height || canvasSize.height
        };
        document.body.classList.add('is-cwk-image-cropping');
    };

    const chooseRatio = value => {
        setRatioMode(value);
        if (value !== 'free' && naturalAspect) {
            setCrop(fitImageCropToAspect(crop, Number(value), naturalAspect));
        }
    };

    const saveCrop = () => {
        if (!naturalAspect) return;
        onSave(normalizeImageCrop({
            ...crop,
            enabled: true,
            aspect: cropAspectFromRect(crop, naturalAspect),
            pixelWidth: cropPixelWidthFromRect(crop, naturalSize.width)
        }));
    };

    const cropBoxStyle = {
        left: `${crop.x * 100}%`,
        top: `${crop.y * 100}%`,
        width: `${crop.width * 100}%`,
        height: `${crop.height * 100}%`
    };

    const selection = naturalAspect > 0
        ? h('div', {
            className: 'cwk-image-crop-selection',
            style: cropBoxStyle,
            onPointerDown: event => beginInteraction(event, 'move')
        }, ['nw', 'ne', 'sw', 'se'].map(handle => h('button', {
            key: handle,
            type: 'button',
            className: `cwk-image-crop-handle cwk-image-crop-handle--${handle}`,
            'aria-label': `${handle} 모서리 조절`,
            onPointerDown: event => beginInteraction(event, 'resize', handle)
        })))
        : null;

    const stageContent = loadError
        ? h('p', { className: 'cwk-image-crop-error' }, '이미지를 불러오지 못했어. 원본 주소를 확인해줘.')
        : h('div', {
            className: 'cwk-image-crop-canvas',
            ref: canvasRef,
            style: {
                width: `${canvasSize.width}px`,
                height: `${canvasSize.height}px`
            }
        }, h('img', {
            src: target.block.props.url,
            alt: target.block.props.name || '',
            draggable: false,
            onLoad: event => {
                const image = event.currentTarget;
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                setLoadError(false);
            },
            onError: () => setLoadError(true)
        }), selection);

    return h('div', {
        className: 'cwk-image-crop-backdrop',
        role: 'presentation',
        onMouseDown: event => {
            if (event.target === event.currentTarget) onCancel();
        }
    }, h('section', {
        className: 'cwk-image-crop-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'cwk-image-crop-title'
    },
    h('div', { className: 'cwk-image-crop-titlebar' },
        h('strong', { id: 'cwk-image-crop-title' }, '이미지 자르기'),
        h('button', { type: 'button', onClick: onCancel, 'aria-label': '닫기' }, '×')
    ),
    h('p', { className: 'cwk-image-crop-help' }, '점선 영역을 움직이거나 모서리를 끌어 보여줄 부분을 골라.'),
    h('div', { className: 'cwk-image-crop-stage', ref: stageRef }, stageContent),
    h('div', { className: 'cwk-image-crop-ratios', 'aria-label': '자르기 비율' },
        h('span', null, '비율:'),
        CROP_RATIO_OPTIONS.map(option => h('button', {
            key: option.value,
            type: 'button',
            className: ratioMode === option.value ? 'is-active' : '',
            onClick: () => chooseRatio(option.value)
        }, option.label))
    ),
    h('div', { className: 'cwk-image-crop-actions' },
        h('button', {
            type: 'button',
            onClick: () => onSave(normalizeImageCrop())
        }, '원본 전체로'),
        h('span', { className: 'cwk-image-crop-action-spacer' }),
        h('button', { type: 'button', onClick: onCancel }, '취소'),
        h('button', { type: 'button', disabled: !naturalAspect || loadError, onClick: saveCrop }, '이대로 보이기')
    )));
}

function resizeImageCrop(value, handle, pointer, targetAspect = 0, naturalAspect = 0) {
    const crop = normalizeImageCrop(value);
    const anchorX = handle.includes('w') ? crop.x + crop.width : crop.x;
    const anchorY = handle.includes('n') ? crop.y + crop.height : crop.y;
    const maxWidth = handle.includes('w') ? anchorX : 1 - anchorX;
    const maxHeight = handle.includes('n') ? anchorY : 1 - anchorY;
    let width = Math.abs(pointer.x - anchorX);
    let height = Math.abs(pointer.y - anchorY);

    if (targetAspect > 0 && naturalAspect > 0) {
        const heightPerWidth = naturalAspect / targetAspect;
        const minimumWidth = Math.max(IMAGE_CROP_MIN_FRACTION, IMAGE_CROP_MIN_FRACTION / heightPerWidth);
        const maximumWidth = Math.min(maxWidth, maxHeight / heightPerWidth);
        width = Math.min(Math.max(Math.min(width, height / heightPerWidth), minimumWidth), maximumWidth);
        height = width * heightPerWidth;
    } else {
        width = Math.min(Math.max(width, IMAGE_CROP_MIN_FRACTION), maxWidth);
        height = Math.min(Math.max(height, IMAGE_CROP_MIN_FRACTION), maxHeight);
    }

    const x = handle.includes('w') ? anchorX - width : anchorX;
    const y = handle.includes('n') ? anchorY - height : anchorY;
    return normalizeImageCrop({ ...crop, enabled: true, x, y, width, height });
}

function clampCrop(value, min, max) {
    return Math.min(Math.max(Number(value), min), max);
}

function BlockNoteMount({ adapter, placeholder }) {
    const editor = useCreateBlockNote({
        schema: CWK_EDITOR_SCHEMA,
        placeholders: {
            default: placeholder,
            emptyDocument: placeholder
        },
        pasteHandler: ({ event, defaultPasteHandler }) => {
            if (!hasEditorFileTransfer(event.clipboardData) || typeof adapter.options.onFilesPaste !== 'function') {
                return defaultPasteHandler();
            }

            event.stopPropagation();
            event.stopImmediatePropagation?.();
            const files = editorFilesFromTransfer(event.clipboardData, {
                fallbackNamePrefix: adapter.options.fallbackNamePrefix || 'editor-file'
            });
            Promise.resolve(adapter.options.onFilesPaste(files, event)).catch(error => {
                adapter.options.onFilesPasteError?.(error);
                console.error('Editor file paste failed:', error);
            });
            return true;
        },
        uploadFile: async file => {
            if (typeof adapter.options.uploadFile === 'function') {
                return adapter.withUploadActivity(() => adapter.options.uploadFile(file));
            }
            throw new Error('File upload is handled by the site image button.');
        }
    });

    useEffect(() => {
        adapter.bindEditor(editor);
        adapter.setPlaceholder(placeholder);
    }, [adapter, editor, placeholder]);

    const formattingToolbar = useCallback(
        () => h(CroppingFormattingToolbar, { adapter }),
        [adapter]
    );

    return React.createElement(BlockNoteView, {
        editor,
        theme: 'light',
        className: 'blocknote-editor-view',
        formattingToolbar: false,
        onChange: () => {
            adapter.currentHtml = adapter.htmlFromEditor();
            adapter.options.onChange?.(adapter.currentHtml);
        }
    }, React.createElement(FormattingToolbarController, {
        formattingToolbar
    }));
}

function namedImageFile(file, index, fallbackNamePrefix) {
    if (file.name) return file;

    const extensionByType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
    };
    const extension = extensionByType[file.type] || 'png';

    return new File([file], `${fallbackNamePrefix}-${Date.now()}-${index + 1}.${extension}`, {
        type: file.type
    });
}

function namedEditorFile(file, index, fallbackNamePrefix) {
    if (file.name) return file;

    const extensionByType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'video/x-m4v': 'm4v',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'application/pdf': 'pdf'
    };
    const extension = extensionByType[file.type] || 'bin';

    return new File([file], `${fallbackNamePrefix}-${Date.now()}-${index + 1}.${extension}`, {
        type: file.type
    });
}

function editorFileBlock(file) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || file.alt || 'file');
    const props = {
        url: file.url,
        name: cleanImageName(name),
        caption: '',
        showPreview: true
    };

    if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)) {
        return { type: 'image', props };
    }
    if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(name)) {
        return { type: 'video', props };
    }
    if (type.startsWith('audio/') || /\.mp3$/i.test(name)) {
        return { type: 'audio', props };
    }
    return { type: 'file', props };
}

function cleanImageName(value = '') {
    return String(value || 'image')
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[[\]\n\r]/g, ' ')
        .trim() || 'image';
}

function isEmptyParagraph(block) {
    return block?.type === 'paragraph'
        && (!block.content || (Array.isArray(block.content) && block.content.length === 0));
}

function cssString(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cssSelectorString(value) {
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value || ''));
    return String(value || '').replace(/["\\]/g, '\\$&');
}
