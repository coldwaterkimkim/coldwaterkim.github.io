import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/i18n/ko-kr';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function createMarkdownEditor(target, options = {}) {
    const root = typeof target === 'string'
        ? document.querySelector(target)
        : target;

    if (!root) {
        throw new Error('Markdown editor target not found');
    }

    return new MarkdownEditor(root, options);
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

class MarkdownEditor {
    constructor(root, options = {}) {
        this.mount = root;
        this.options = options;
        this.mount.classList.add('markdown-editor-shell');
        this.mount.innerHTML = `
            <div class="markdown-editor-inline-toolbar">
                <button type="button" class="markdown-editor-image-button">이미지</button>
            </div>
            <div class="markdown-editor-toast"></div>
        `;

        this.inlineToolbar = this.mount.querySelector('.markdown-editor-inline-toolbar');
        this.imageButton = this.mount.querySelector('.markdown-editor-image-button');
        this.editorMount = this.mount.querySelector('.markdown-editor-toast');

        this.editor = new Editor({
            el: this.editorMount,
            height: options.height || '360px',
            minHeight: options.minHeight || '260px',
            initialValue: '',
            initialEditType: 'wysiwyg',
            previewStyle: 'vertical',
            hideModeSwitch: true,
            language: 'ko-KR',
            usageStatistics: false,
            placeholder: options.placeholder || 'Markdown으로 작성하기...',
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task'],
                ['table', 'link'],
                ['code', 'codeblock']
            ]
        });

        this.root = {
            addEventListener: (...args) => this.mount.addEventListener(...args),
            removeEventListener: (...args) => this.mount.removeEventListener(...args),
            focus: () => this.editor.focus(),
            get innerHTML() {
                return '';
            },
            set innerHTML(_html) {
            }
        };

        Object.defineProperty(this.root, 'innerHTML', {
            get: () => this.html(),
            set: html => this.setHtml(html)
        });

        this.imageButton?.addEventListener('click', () => {
            if (typeof options.onImageButton === 'function') {
                options.onImageButton();
            }
        });
    }

    getLength() {
        return this.editor.getMarkdown().length + 1;
    }

    getSelection() {
        return {
            index: Math.max(0, this.editor.getMarkdown().length),
            length: 0
        };
    }

    setSelection() {
        this.editor.focus();
    }

    clampIndex(index) {
        const maxIndex = Math.max(0, this.editor.getMarkdown().length);
        if (!Number.isFinite(index)) return maxIndex;
        return Math.min(Math.max(0, index), maxIndex);
    }

    setHtml(html = '') {
        const normalized = String(html || '').trim();
        if (!normalized || normalized === '<p><br></p>') {
            this.editor.setMarkdown('', false);
            return;
        }
        this.editor.setHTML(normalized, false);
    }

    html() {
        return this.editor.getHTML().trim();
    }

    insertText(_index, text = '') {
        this.editor.insertText(text);
        return this.editor.getMarkdown().length;
    }

    insertImage(_index, url, alt = 'image') {
        const safeAlt = String(alt || 'image')
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[[\]\n\r]/g, ' ')
            .trim() || 'image';

        try {
            this.editor.exec('addImage', {
                imageUrl: url,
                altText: safeAlt
            });
        } catch (_error) {
            this.editor.insertText(`\n![${safeAlt}](${url})\n`);
        }

        return this.editor.getMarkdown().length;
    }
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
