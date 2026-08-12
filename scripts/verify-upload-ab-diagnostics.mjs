import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLog } from './summarize-upload-ab-log.mjs';

const html = fs.readFileSync(new URL('../admin/upload-diagnostics.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../js/upload-diagnostics.js', import.meta.url), 'utf8');
const cliSource = fs.readFileSync(new URL('./run-upload-ab-cli.mjs', import.meta.url), 'utf8');
const uppyQaSource = fs.readFileSync(new URL('./verify-uppy-tus-client.mjs', import.meta.url), 'utf8');
const summarySource = fs.readFileSync(new URL('./summarize-upload-ab-log.mjs', import.meta.url), 'utf8');

assert.match(html, /id="diagnosticFile"[^>]+type="file"/, 'diagnostic page must select one local File');
assert.match(html, /id="startDiagnostic"/, 'diagnostic page must have an explicit start action');
assert.match(html, /미디어 레코드를 만들거나 글에 첨부하지 않고/, 'diagnostic page must state its non-publishing boundary');
assert.match(source, /const PARALLEL_VARIANTS = \[3, 6, 8\]/, 'A/B must cover 3, 6, and 8-way uploads');
assert.match(source, /chunkSize: capability\.chunkSize/, 'A/B must hold the server-advertised chunk size constant');
assert.match(source, /'X-Request-ID': sessionId/, 'every diagnostic session must be correlatable in iMac logs');
assert.match(source, /acceptedPatchBytes !== file\.size/, 'transport accounting must equal the original byte length');
assert.match(source, /offsetState\.hasPatch && responseOffset > offsetState\.lastObservedOffset/, 'HEAD recovery must account for a PATCH accepted before a lost response');
assert.match(source, /lastAcceptedOffsetObservedAt = completedAt/, 'throughput time must include the HEAD that recovers an accepted PATCH offset');
assert.match(source, /finalOffset !== file\.size/, 'the concatenated tus resource must equal the original byte length');
assert.match(source, /method: 'DELETE'/, 'the harness must terminate its own staging resources');
assert.match(source, /normalizeTusResourceUrl\(location\)/, 'cleanup targets must come from this run response locations');
assert.doesNotMatch(source, /\/api\/collections\/media|collection\(['"]media['"]\)|\/api\/cwk\/tus\/finalize/, 'A/B must never create, finalize, or delete PocketBase media records');
assert.match(source, /removeFingerprintOnSuccess: true/, 'completed A/B runs must not pollute browser resume storage');
assert.match(source, /storeFingerprintForResuming: false/, 'failed A/B runs must not leak into the next variant');
assert.match(source, /sourceReadMiBPerSecond/, 'the report must separate source read speed from network transport');
assert.match(source, /medianMBPerSecond/, 'goal classification must aggregate decimal MB per second by median');
assert.match(source, /cleanupComplete/, 'the report must expose staging cleanup status');
assert.match(summarySource, /requestId=\(cwk-ab-/, 'server log summary must only select A/B correlation ids');
assert.match(summarySource, /ChunkWriteComplete/, 'server log summary must count accepted tus chunks');
assert.match(summarySource, /serverMiBPerSecond/, 'server log summary must calculate independent throughput');
assert.match(summarySource, /serverMBPerSecond/, 'server log summary must also expose the user-facing decimal MB per second');
assert.match(cliSource, /DEFAULT_VARIANTS = \[3, 6, 8\]/, 'the iMac CLI must exercise the same 3/6/8 variants');
assert.match(cliSource, /originUrl\.protocol, 'https:'/, 'the iMac CLI must never transmit OWNER credentials over plain HTTP');
assert.match(cliSource, /originUrl\.hostname, 'coldwaterkim\.com'/, 'the iMac CLI must restrict OWNER credentials to the production host');
assert.match(cliSource, /CWK_TUS_AB_FILE/, 'the CLI must accept an actual local media file for client-side read and transport measurement');
assert.match(cliSource, /randomUUID\(\)\.replaceAll\('-', ''\)\.slice\(0, 16\)/, 'CLI request ids must fit the server log correlation limit');
assert.match(cliSource, /statSync\(sourceFilePath\)\.size/, 'the CLI must validate the selected file size before loading it');
assert.match(cliSource, /readFileSync\(sourceFilePath\)/, 'the CLI must upload the selected file bytes without transforming them');
assert.match(cliSource, /name: fileName[\s\S]*type: fileType/, 'the CLI must preserve the selected media name and MIME type in tus metadata');
assert.match(cliSource, /acceptedBytes, fileBytes/, 'the iMac CLI must verify every accepted source byte');
assert.match(cliSource, /finalOffset, fileBytes/, 'the iMac CLI must verify the concatenated tus offset');
assert.match(cliSource, /method: 'DELETE'/, 'the iMac CLI must terminate its own staging resources');
assert.match(cliSource, /deleteWithRetry/, 'the iMac CLI must retry bounded staging cleanup');
assert.doesNotMatch(cliSource, /\/api\/collections\/media|\/api\/cwk\/tus\/finalize/, 'the iMac CLI must never create or finalize a media record');
assert.match(uppyQaSource, /CWK_TUS_QA_FILE/, 'the resumable finalize QA must accept an actual local video file');
assert.match(uppyQaSource, /createHash\('sha256'\)[\s\S]*createHash\('sha256'\)/, 'the resumable finalize QA must compare source and stored SHA-256');

const syntheticSessions = parseLog(`
2026/08/12 10:00:00 INFO UploadCreated method=POST path=/ requestId=cwk-ab-3w-fixture id=part-a size=100 url=https://coldwaterkim.com/api/cwk/tus/files/part-a
2026/08/12 10:00:00 INFO UploadCreated method=POST path=/ requestId=cwk-ab-3w-fixture id=part-b size=100 url=https://coldwaterkim.com/api/cwk/tus/files/part-b
2026/08/12 10:00:01 INFO ChunkWriteStart method=PATCH path=/part-a requestId=cwk-ab-3w-fixture id=part-a maxSize=100 offset=0
2026/08/12 10:00:02 INFO ChunkWriteComplete method=PATCH path=/part-a requestId=cwk-ab-3w-fixture id=part-a bytesWritten=100
2026/08/12 10:00:02 INFO ResponseOutgoing method=DELETE path=/part-a requestId=cwk-ab-3w-fixture id=part-a status=204 body=""
2026/08/12 10:00:02 INFO RequestIncoming method=PATCH path=/unrelated requestId=normal-owner-upload
`);
assert.equal(syntheticSessions.length, 1, 'server log summary must isolate one diagnostic session');
assert.equal(syntheticSessions[0].parallelUploads, 3, 'server log summary must decode the requested parallelism');
assert.equal(syntheticSessions[0].serverBytesWritten, 100, 'server log summary must sum accepted PATCH bytes');
assert.equal(syntheticSessions[0].patchCount, 1, 'server log summary must count PATCH completions');
assert.equal(syntheticSessions[0].cleanupResponses, 1, 'server log summary must count successful cleanup responses');
assert.equal(parseLog(`
2026/08/12 10:00:00 INFO ChunkWriteComplete method=PATCH path=/part-a requestId=cwk-ab-3w-macbook-1234567890abcdef id=part-a bytesWritten=100
`, 'cwk-ab-3w-macbook-1234567890abcdef-extra-client-suffix').length, 1, 'server log summary must match a full client id to its server-truncated prefix');

console.log('Upload A/B diagnostic harness verification passed.');
