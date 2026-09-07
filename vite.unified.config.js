import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
const runtime=path.join(os.homedir(),'.local/share/coldwaterkim/unified-feed-review');
const backend='http://127.0.0.1:18107';
function reviewPlugin(){return {name:'isolated-unified-review',configureServer(server){
  server.middlewares.use((req,res,next)=>{
    const oldDetail=/^\/(posts|daily)\/(?!index\.html|view\.html)[^/?]+\/?(?:[?].*)?$/.exec(req.url||'');
    if(oldDetail){req.url=`/${oldDetail[1]}/view.html`;return next();}
    if(!req.url?.startsWith('/__preview/') && !req.url?.startsWith('/api/files/'))return next();
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const host=req.headers.host||'';
    if(!local||! /^(127\.0\.0\.1|localhost):5197$/.test(host)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${host}`)){res.writeHead(403);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    if(req.url==='/__preview/session'){
      try{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(fs.readFileSync(path.join(runtime,'session.json')));}catch{res.writeHead(503);res.end();}return;
    }
    if(!req.url.startsWith('/api/files/')){res.writeHead(404);res.end();return;}
    // Only GET/HEAD media requests may fall back to the live original. No auth or writes forwarded.
    const forward=(origin,fallback)=>{
      const request=http.request(origin+req.url,{method:req.method,headers:req.headers.range?{Range:req.headers.range}:{}},upstream=>{
        if(upstream.statusCode===404&&fallback){upstream.resume();forward('http://127.0.0.1:8090',false);return;}
        res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);
      });request.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});request.end();
    };forward(backend,true);
  });
}};}
export default mergeConfig(base,defineConfig({
 define:{__CMS_TARGET__:JSON.stringify('same-origin'),__LIVE_CMS_URL__:JSON.stringify(''),__RECORDS_PREVIEW__:'true'},
 plugins:[reviewPlugin()],server:{host:'127.0.0.1',port:5197,strictPort:true,proxy:{'/api':{target:backend,changeOrigin:true}}},
 build:{outDir:'dist-unified-review'}
}));
