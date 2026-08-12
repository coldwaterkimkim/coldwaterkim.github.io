import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG = '/Users/kimchansu/Library/Logs/coldwaterkim-pocketbase.err.log';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const options = parseArguments(process.argv.slice(2));
    const logPath = path.resolve(options.log || DEFAULT_LOG);

    if (!fs.existsSync(logPath)) {
        console.error(`PocketBase tus log not found: ${logPath}`);
        process.exitCode = 1;
    } else {
        const sessions = parseLog(fs.readFileSync(logPath, 'utf8'), options.session);
        if (options.json) {
            console.log(JSON.stringify({ logPath, sessions }, null, 2));
        } else {
            printTable(logPath, sessions);
        }
    }
}

function parseArguments(args) {
    const result = { log: '', session: '', json: false };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--log') result.log = String(args[++index] || '');
        else if (argument === '--session') result.session = String(args[++index] || '');
        else if (argument === '--json') result.json = true;
        else if (argument === '--help' || argument === '-h') {
            console.log('Usage: node scripts/summarize-upload-ab-log.mjs [--log PATH] [--session ID_OR_PREFIX] [--json]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return result;
}

export function parseLog(source, requestedSession = '') {
    const bySession = new Map();
    for (const line of source.split(/\r?\n/)) {
        const requestIdMatch = line.match(/\brequestId=(cwk-ab-[^\s]+)/);
        if (!requestIdMatch) continue;
        const sessionId = stripQuotes(requestIdMatch[1]);
        if (requestedSession && !sessionId.startsWith(requestedSession)) continue;
        const parsed = parseLine(line);
        if (!parsed) continue;
        const session = bySession.get(sessionId) || createSession(sessionId);
        session.firstAtMs = Math.min(session.firstAtMs, parsed.atMs);
        session.lastAtMs = Math.max(session.lastAtMs, parsed.atMs);

        if (parsed.event === 'UploadCreated') {
            session.createdResources.add(parsed.fields.id || '');
            const size = numberField(parsed.fields.size);
            if (size > 0) session.createdSizes.push(size);
        }
        if (parsed.event === 'ChunkWriteStart') {
            session.patchStartedAtMs = Math.min(session.patchStartedAtMs, parsed.atMs);
        }
        if (parsed.event === 'ChunkWriteComplete') {
            session.patchCompletedAtMs = Math.max(session.patchCompletedAtMs, parsed.atMs);
            session.patchCount += 1;
            session.bytesWritten += numberField(parsed.fields.bytesWritten);
        }
        if (parsed.event === 'ResponseOutgoing') {
            const status = numberField(parsed.fields.status);
            if (status < 200 || status >= 300) session.nonSuccessResponses += 1;
            if (parsed.fields.method === 'DELETE' && (status === 204 || status === 404)) {
                session.cleanupResponses += 1;
            }
        }
        bySession.set(sessionId, session);
    }

    return Array.from(bySession.values())
        .map(finalizeSession)
        .sort((left, right) => left.firstAt.localeCompare(right.firstAt));
}

function parseLine(line) {
    const head = line.match(/^(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\S+\s+(\S+)\s+(.*)$/);
    if (!head) return null;
    const fields = {};
    for (const match of head[4].matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
        fields[match[1]] = stripQuotes(match[2]);
    }
    return {
        atMs: localTimestamp(`${head[1]} ${head[2]}`),
        event: head[3],
        fields
    };
}

function localTimestamp(value) {
    const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return Number.NaN;
    return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6])
    ).getTime();
}

function createSession(sessionId) {
    const parallelMatch = sessionId.match(/^cwk-ab-(\d+)w-/);
    return {
        sessionId,
        parallelUploads: Number(parallelMatch?.[1] || 0),
        createdResources: new Set(),
        createdSizes: [],
        firstAtMs: Number.POSITIVE_INFINITY,
        lastAtMs: 0,
        patchStartedAtMs: Number.POSITIVE_INFINITY,
        patchCompletedAtMs: 0,
        patchCount: 0,
        bytesWritten: 0,
        nonSuccessResponses: 0,
        cleanupResponses: 0
    };
}

function finalizeSession(session) {
    const patchSeconds = Number.isFinite(session.patchStartedAtMs) && session.patchCompletedAtMs
        ? Math.max(0, (session.patchCompletedAtMs - session.patchStartedAtMs) / 1000)
        : 0;
    const finalBytes = session.createdSizes.length ? Math.max(...session.createdSizes) : 0;
    return {
        sessionId: session.sessionId,
        parallelUploads: session.parallelUploads,
        firstAt: Number.isFinite(session.firstAtMs) ? new Date(session.firstAtMs).toISOString() : '',
        lastAt: session.lastAtMs ? new Date(session.lastAtMs).toISOString() : '',
        serverPatchSeconds: patchSeconds,
        serverBytesWritten: session.bytesWritten,
        serverMBPerSecond: patchSeconds > 0 ? (session.bytesWritten / 1_000_000) / patchSeconds : 0,
        serverMiBPerSecond: patchSeconds > 0 ? (session.bytesWritten / 1024 / 1024) / patchSeconds : 0,
        finalBytes,
        createdResourceCount: session.createdResources.size,
        inferredPartialResourceCount: Math.max(0, session.createdResources.size - (finalBytes > 0 ? 1 : 0)),
        patchCount: session.patchCount,
        nonSuccessResponses: session.nonSuccessResponses,
        cleanupResponses: session.cleanupResponses
    };
}

function printTable(logPath, sessions) {
    console.log(`PocketBase tus A/B log: ${logPath}`);
    if (!sessions.length) {
        console.log('No cwk-ab-* diagnostic sessions found.');
        return;
    }
    console.log('way  server MB/s  server MiB/s  patch sec  bytes accepted  PATCH  resources  cleanup  session');
    for (const session of sessions) {
        console.log([
            String(session.parallelUploads).padStart(3),
            session.serverMBPerSecond.toFixed(3).padStart(11),
            session.serverMiBPerSecond.toFixed(3).padStart(12),
            session.serverPatchSeconds.toFixed(3).padStart(9),
            String(session.serverBytesWritten).padStart(14),
            String(session.patchCount).padStart(5),
            String(session.createdResourceCount).padStart(9),
            String(session.cleanupResponses).padStart(7),
            session.sessionId
        ].join('  '));
    }
}

function numberField(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stripQuotes(value) {
    return String(value || '').replace(/^"|"$/g, '');
}
