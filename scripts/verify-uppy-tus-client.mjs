import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

const origin = String(process.env.CWK_TUS_QA_ORIGIN || '').replace(/\/+$/, '');
const token = String(process.env.CWK_TUS_QA_TOKEN || '');
const ownerId = String(process.env.CWK_TUS_QA_OWNER_ID || '');

assert.ok(origin, 'CWK_TUS_QA_ORIGIN is required');
assert.ok(token, 'CWK_TUS_QA_TOKEN is required');
assert.ok(ownerId, 'CWK_TUS_QA_OWNER_ID is required');

const seed = fs.readFileSync(new URL('../assets/profile-crop.jpg', import.meta.url));
const size = (64 * 1024 * 1024) + 1024;
const source = Buffer.concat([seed, Buffer.alloc(size - seed.byteLength)]);
const fileName = 'uppy-resume-client-check.pdf';
const fileType = 'application/pdf';

const progress = [];
const tusCreationRequests = [];
const uppy = new Uppy({
  autoProceed: false,
  restrictions: {
    maxNumberOfFiles: 1,
    maxFileSize: 8_589_934_592,
  },
});

uppy.use(Tus, {
  endpoint: `${origin}/api/cwk/tus/files/`,
  headers: () => ({ Authorization: token }),
  retryDelays: [0, 100, 300],
  removeFingerprintOnSuccess: false,
  allowedMetaFields: ['name', 'type', 'owner_id'],
  parallelUploads: 3,
  onBeforeRequest(request) {
    if (request.getMethod() === 'POST') {
      tusCreationRequests.push(request.getHeader('Upload-Concat') || 'single');
    }
  },
  limit: 1,
});

const fileId = uppy.addFile({
  name: fileName,
  type: fileType,
  data: source,
  meta: { owner_id: ownerId },
});
let createdMedia = null;

uppy.on('upload-progress', (uppyFile, event) => {
  if (uppyFile?.id === fileId) progress.push(Number(event.bytesUploaded || 0));
});

try {
  const result = await uppy.upload();
  assert.equal(result.failed.length, 0, 'Uppy must complete the tus upload');
  const uploaded = result.successful[0];
  assert.ok(uploaded.response?.uploadURL, 'Uppy must expose the completed tus upload URL');
  assert.ok(progress.some(value => value > 0 && value <= source.byteLength), 'Uppy must report byte progress');
  assert.equal(tusCreationRequests.filter(value => value === 'partial').length, 3, 'Uppy must create three parallel partial uploads');
  assert.equal(tusCreationRequests.filter(value => value.startsWith('final;')).length, 1, 'Uppy must create one concatenated final upload');

  const uploadId = new URL(uploaded.response.uploadURL).pathname.split('/').filter(Boolean).at(-1);
  const finalizeResponse = await fetch(`${origin}/api/cwk/tus/finalize`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ upload_id: uploadId }),
  });
  if (finalizeResponse.status !== 200) {
    assert.fail(`finalize failed (${finalizeResponse.status}): ${await finalizeResponse.text()}`);
  }
  const media = await finalizeResponse.json();
  createdMedia = media;
  assert.ok(media.id && media.file, 'finalize must return a PocketBase media record');

  const fileResponse = await fetch(`${origin}/api/files/${media.collectionId}/${media.id}/${encodeURIComponent(media.file)}`);
  assert.equal(fileResponse.status, 200, 'the finalized PocketBase file must be readable');
  const downloaded = new Uint8Array(await fileResponse.arrayBuffer());
  assert.equal(downloaded.byteLength, source.byteLength, 'the finalized file must preserve the entire upload');
  assert.equal(
    createHash('sha256').update(downloaded).digest('hex'),
    createHash('sha256').update(source).digest('hex'),
    'the finalized file checksum must match the Uppy source',
  );

  console.log(`Uppy tus client QA passed (${source.byteLength} bytes, media ${media.id}).`);
} finally {
  uppy.destroy();
  if (createdMedia?.id) {
    const cleanupResponse = await fetch(`${origin}/api/collections/media/records/${createdMedia.id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    assert.equal(cleanupResponse.status, 204, 'QA media record and file must be removed after verification');
  }
}
