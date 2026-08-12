import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, extname } from 'node:path';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

const origin = String(process.env.CWK_TUS_QA_ORIGIN || '').replace(/\/+$/, '');
const token = String(process.env.CWK_TUS_QA_TOKEN || '');
const ownerId = String(process.env.CWK_TUS_QA_OWNER_ID || '');
const sourceFilePath = String(process.env.CWK_TUS_QA_FILE || '').trim();

assert.ok(origin, 'CWK_TUS_QA_ORIGIN is required');
assert.ok(token, 'CWK_TUS_QA_TOKEN is required');
assert.ok(ownerId, 'CWK_TUS_QA_OWNER_ID is required');

const seed = sourceFilePath ? null : fs.readFileSync(new URL('../assets/profile-crop.jpg', import.meta.url));
const size = (96 * 1024 * 1024) + 1024;
const source = sourceFilePath ? fs.readFileSync(sourceFilePath) : Buffer.concat([seed, Buffer.alloc(size - seed.byteLength)]);
const fileName = sourceFilePath ? basename(sourceFilePath) : 'uppy-resume-client-check.pdf';
const fileType = sourceFilePath ? mediaTypeForFile(fileName) : 'application/pdf';
assert.ok(fileType, 'CWK_TUS_QA_FILE must be a supported video file');

const progress = [];
const tusCreationRequests = [];
const tusPatchRequests = [];
const tusHeadResponses = [];
const tusResponseStatuses = [];
const tusResourceUrls = new Set();
const tusRequestSessionHeaders = [];
const tusRequestState = new WeakMap();
const acceptedOffsetsByResource = new Map();
const completedChunks = [];
const parallelUploads = 6;
const chunkSize = 4 * 1024 * 1024;
const uploadSession = 'uppy-qa-session-20260811';
let pauseTriggered = false;
let resumeTriggered = false;
let pauseTimer = null;
let resumeTimer = null;
let acceptedPatchBytes = 0;
let pauseControlError = null;
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
  allowedMetaFields: ['name', 'type', 'owner_id', 'upload_session'],
  parallelUploads,
  chunkSize,
  onBeforeRequest(request) {
    request.setHeader('X-Request-ID', uploadSession);
    tusRequestSessionHeaders.push(request.getHeader('X-Request-ID'));
    const method = request.getMethod();
    const resourceUrl = request.getURL();
    const uploadOffset = Number(request.getHeader('Upload-Offset') || 0);
    tusRequestState.set(request, { method, resourceUrl });
    if (method === 'PATCH') {
      const offsetState = acceptedOffsetsByResource.get(resourceUrl) || { hasPatch: false, lastObservedOffset: 0 };
      offsetState.hasPatch = true;
      offsetState.lastObservedOffset = Math.max(offsetState.lastObservedOffset, uploadOffset);
      acceptedOffsetsByResource.set(resourceUrl, offsetState);
    }
    if (request.getMethod() === 'POST') {
      tusCreationRequests.push(request.getHeader('Upload-Concat') || 'single');
    }
    if (request.getMethod() === 'PATCH') tusPatchRequests.push(request.getMethod());
  },
  onAfterResponse(request, response) {
    tusResponseStatuses.push(Number(response.getStatus() || 0));
    const state = tusRequestState.get(request) || { method: request.getMethod(), resourceUrl: request.getURL() };
    const responseOffset = Number(response.getHeader('Upload-Offset') || 0);
    if (state.method === 'HEAD') {
      tusHeadResponses.push(responseOffset);
    }
    if ((state.method === 'PATCH' || state.method === 'HEAD') && responseOffset >= 0) {
      const offsetState = acceptedOffsetsByResource.get(state.resourceUrl) || { hasPatch: false, lastObservedOffset: 0 };
      if (offsetState.hasPatch && responseOffset > offsetState.lastObservedOffset) {
        acceptedPatchBytes += responseOffset - offsetState.lastObservedOffset;
      }
      offsetState.lastObservedOffset = Math.max(offsetState.lastObservedOffset, responseOffset);
      acceptedOffsetsByResource.set(state.resourceUrl, offsetState);
    }
    const location = response.getHeader('Location');
    if (location) tusResourceUrls.add(new URL(location, origin).href);
  },
  onChunkComplete(acceptedChunkSize) {
    completedChunks.push(Number(acceptedChunkSize || 0));
    if (!pauseTimer && !pauseTriggered && completedChunks.length >= 2) {
      pauseTimer = setTimeout(() => {
        try {
          pauseTriggered = true;
          assert.equal(uppy.pauseResume(fileId), true, 'the active tus upload must pause without terminating server state');
          resumeTimer = setTimeout(() => {
            try {
              resumeTriggered = true;
              assert.equal(uppy.pauseResume(fileId), false, 'the paused tus upload must resume from its server offset');
            } catch (error) {
              pauseControlError = error;
              uppy.cancelAll();
            }
          }, 100);
        } catch (error) {
          pauseControlError = error;
          uppy.cancelAll();
        }
      }, 0);
    }
  },
  limit: 1,
});

const fileId = uppy.addFile({
  name: fileName,
  type: fileType,
  data: source,
  meta: { owner_id: ownerId, upload_session: uploadSession },
});
let createdMedia = null;

uppy.on('upload-progress', (uppyFile, event) => {
  if (uppyFile?.id !== fileId) return;
  const bytesUploaded = Number(event.bytesUploaded || 0);
  progress.push(bytesUploaded);
});

try {
  const result = await uppy.upload();
  if (pauseControlError) throw pauseControlError;
  assert.equal(result.failed.length, 0, 'Uppy must complete the tus upload');
  const uploaded = result.successful[0];
  assert.ok(uploaded.response?.uploadURL, 'Uppy must expose the completed tus upload URL');
  assert.ok(progress.some(value => value > 0 && value <= source.byteLength), 'Uppy must report byte progress');
  assert.equal(tusCreationRequests.filter(value => value === 'partial').length, parallelUploads, 'Uppy must create the balanced parallel partial uploads');
  assert.equal(tusCreationRequests.filter(value => value.startsWith('final;')).length, 1, 'Uppy must create one concatenated final upload');
  assert.ok(tusPatchRequests.length > parallelUploads, 'finite chunks must create multiple retryable PATCH requests');
  assert.ok(completedChunks.length > parallelUploads, 'Uppy must report each accepted finite chunk');
  assert.ok(completedChunks.reduce((total, value) => total + value, 0) <= source.byteLength, 'chunk callbacks must never exceed the original byte length');
  assert.equal(acceptedPatchBytes, source.byteLength, 'PATCH and resume offsets must account for the original byte length exactly');
  assert.ok(pauseTriggered && resumeTriggered, 'the integration upload must exercise interruption and resume');
  assert.ok(tusHeadResponses.some(value => value > 0), 'the resumed upload must confirm a previously accepted server offset');
  assert.ok(tusResponseStatuses.every(status => status >= 200 && status < 300), 'all observed tus responses must succeed');
  assert.ok(tusRequestSessionHeaders.every(value => value === uploadSession), 'every tus request must carry the correlation session id');

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
  if (pauseTimer) clearTimeout(pauseTimer);
  if (resumeTimer) clearTimeout(resumeTimer);
  uppy.destroy();
  if (createdMedia?.id) {
    const cleanupResponse = await fetch(`${origin}/api/collections/media/records/${createdMedia.id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    assert.equal(cleanupResponse.status, 204, 'QA media record and file must be removed after verification');
  } else {
    for (const uploadUrl of tusResourceUrls) {
      const cleanupResponse = await fetch(uploadUrl, {
        method: 'DELETE',
        headers: {
          Authorization: token,
          'Tus-Resumable': '1.0.0',
          'X-Request-ID': uploadSession,
        },
      });
      assert.ok([204, 404].includes(cleanupResponse.status), `failed QA tus resource must be removed (${cleanupResponse.status})`);
    }
  }
}

function mediaTypeForFile(value) {
  switch (extname(value).toLowerCase()) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.m4v': return 'video/x-m4v';
    case '.webm': return 'video/webm';
    default: return '';
  }
}
