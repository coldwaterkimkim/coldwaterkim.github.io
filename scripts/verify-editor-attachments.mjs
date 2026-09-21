import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { directoryUploadMessage, transferDirectories, preferredTransferFiles } from '../js/editor-file-transfer.mjs';

const zip = new File(['zip fixture'], 'My App.app.zip', { type: 'application/zip' });
const transfer = { files: [zip], items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false, name: zip.name }) }] };
assert.deepEqual(transferDirectories(transfer), []);
assert.deepEqual(preferredTransferFiles(transfer), [zip]);
assert.deepEqual(transferDirectories({ items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true, name: 'My App.app' }) }] }), ['My App.app']);
assert.deepEqual(transferDirectories({ items: [{ kind: 'file' }, { kind: 'string' }] }), []);
assert.match(directoryUploadMessage('My App.app'), /My App\.app.*Finder.*ZIP/);

const editor = fs.readFileSync(new URL('../js/markdown-editor.js', import.meta.url), 'utf8');
const mimeSet = editor.match(/const EDITOR_UPLOAD_MIME_TYPES = new Set\(\[([\s\S]*?)\]\);/)[0];
const supported = editor.match(/export function isSupportedEditorUpload\(file\) \{[\s\S]*?\n\}/)[0].replace('export ', '');
const supports = vm.runInNewContext(`${mimeSet}\n${supported}\nisSupportedEditorUpload`);
for (const type of ['', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream']) {
  assert.equal(supports({ name: 'My App.app.zip', type }), true, `ZIP accepted with ${type || 'empty MIME'}`);
}
assert.equal(supports({ name: 'My App.app', type: '' }), false);
assert.equal(supports({ name: 'photo.png', type: 'image/png' }), true);

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const collections = Array.isArray(schema) ? schema : schema.collections;
const mediaFile = collections.find(c => c.name === 'media').fields.find(f => f.name === 'file');
let up, down;
vm.runInNewContext(fs.readFileSync(new URL('../pb_migrations/1789981545_allow_zip_media_attachments.js', import.meta.url), 'utf8'), { migrate: (a, b) => { up = a; down = b; } });
const previous = mediaFile.mimeTypes.filter(type => type !== 'application/zip');
const field = { mimeTypes: [...previous], maxSize: mediaFile.maxSize };
const collection = { fields: { getByName: () => field } };
const app = { findCollectionByNameOrId: () => collection, save: () => {} };
up(app); up(app);
assert.deepEqual(Array.from(field.mimeTypes), mediaFile.mimeTypes);
assert.equal(field.maxSize, 21474836480);
down(app);
assert.deepEqual(Array.from(field.mimeTypes), previous);
console.log('Editor ZIP selection, app directory guidance, and additive MIME migration passed.');
