import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const previewRoot = process.env.CWK_RECORDS_PREVIEW_DIR || path.join(os.homedir(), '.local/share/coldwaterkim/records-v2-preview');
const backend = 'http://127.0.0.1:18096';
function previewPlugin() {
  return {
    name: 'cwk-isolated-records-review',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/') req.url = '/records/index.html';
        if (!req.url?.startsWith('/__preview/')) return next();
        const host = req.headers.host || '';
        const origin = req.headers.origin;
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
        if (!local || !/^(localhost|127\.0\.0\.1):5196$/.test(host) || (origin && origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
          res.writeHead(403); res.end('Local review only'); return;
        }
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const source = req.url === '/__preview/session' ? 'session.json' : req.url === '/__preview/sources' ? 'sources.json' : null;
        if (!source) { res.writeHead(404); res.end(); return; }
        try {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(fs.readFileSync(path.join(previewRoot, source)));
        } catch { res.writeHead(503); res.end(JSON.stringify({error:'검토 서버 준비 중'})); }
      });
    },
  };
}

export default mergeConfig(base, defineConfig({
  define: { __CMS_TARGET__: JSON.stringify('same-origin'), __LIVE_CMS_URL__: JSON.stringify(''), __RECORDS_PREVIEW__: 'true' },
  plugins: [previewPlugin()],
  server: { host:'127.0.0.1',port:5196,strictPort:true,proxy:{'/api':{target:backend,changeOrigin:true}} },
  build: { outDir: 'dist-records-preview', rollupOptions: {input:{records:path.resolve('records/index.html')}} },
}));
