import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@mantine/core/styles.css';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

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

export function imageFilesFromTransfer(dataTransfer, options = {}) {
    if (!dataTransfer) return [];

    const mimeTypes = options.mimeTypes || IMAGE_MIME_TYPES;
    const fallbackNamePrefix = options.fallbackNamePrefix || 'editor-image';
    const files = Array.from(dataTransfer.files || []);
    const itemFiles = Array.from(dataTransfer.items || [])
        .filter(item => item.kind === 'file' && item.type?.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);

    return [...files, ...itemFiles]
        .filter((file, index, allFiles) => {
            if (!file || !mimeTypes.has(file.type)) return false;
            return allFiles.findIndex(candidate =>
                candidate.name === file.name
                && candidate.size === file.size
                && candidate.lastModified === file.lastModified
            ) === index;
        })
        .map((file, index) => namedImageFile(file, index, fallbackNamePrefix));
}

class BlockNoteMarkdownEditor {
    constructor(root, options = {}) {
        this.mount = root;
        this.options = options;
        this.editor = null;
        this.currentHtml = '';
        this.pendingHtml = '';
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
        `;

        this.inlineToolbar = this.mount.querySelector('.markdown-editor-inline-toolbar');
        this.imageButton = this.mount.querySelector('.markdown-editor-image-button');
        this.editorMount = this.mount.querySelector('.blocknote-editor-mount');
        this.reactRoot = createRoot(this.editorMount);

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
            setPlaceholder: placeholder => this.setPlaceholder(placeholder)
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

    focus() {
        this.blockNote?.focus?.();
        this.blockNote?.prosemirrorView?.focus?.();
    }

    destroy() {
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
        return this.blockNote?.blocksToHTMLLossy(this.blockNote.document).trim() || '';
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
        if (!this.blockNote) return 0;

        const currentBlock = this.currentBlock();
        const imageBlock = {
            type: 'image',
            props: {
                url,
                name: cleanImageName(alt),
                caption: '',
                showPreview: true
            }
        };

        if (currentBlock && isEmptyParagraph(currentBlock)) {
            this.blockNote.updateBlock(currentBlock, imageBlock);
        } else if (currentBlock) {
            this.blockNote.insertBlocks([imageBlock], currentBlock, 'after');
        } else {
            this.blockNote.insertBlocks([imageBlock], this.blockNote.document.at(-1), 'after');
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

function BlockNoteMount({ adapter, placeholder }) {
    const editor = useCreateBlockNote({
        placeholders: {
            default: placeholder,
            emptyDocument: placeholder
        },
        uploadFile: async file => {
            if (typeof adapter.options.uploadFile === 'function') {
                return adapter.options.uploadFile(file);
            }
            throw new Error('File upload is handled by the site image button.');
        }
    });

    useEffect(() => {
        adapter.bindEditor(editor);
        adapter.setPlaceholder(placeholder);
    }, [adapter, editor, placeholder]);

    return React.createElement(BlockNoteView, {
        editor,
        theme: 'light',
        className: 'blocknote-editor-view',
        onChange: () => {
            adapter.currentHtml = adapter.htmlFromEditor();
        }
    });
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
