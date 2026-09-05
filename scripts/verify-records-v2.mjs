import assert from 'node:assert/strict';
import { normalizeRecord, safeMediaUrl, mediaKind } from '../js/records-v2-model.mjs';
const input = {id:'r1',category:'daily',body:'일반 # 글\n**그대로**',status:'published',recordDate:'2026-09-05',firstPublishedAt:'2026-09-05T01:00:00Z',revision:4,legacyHtml:'<table><tr><td>보존</td></tr></table>',legacySource:{collection:'daily_entries',id:'d1'},attachments:[{id:'occ-a',mediaId:'m1',url:'/api/files/media/m1/photo.jpg',name:'photo.jpg',mime:'image/jpeg',kind:'image',crop:{enabled:true,x:.1,y:.2,width:.4,height:.5,aspect:1,pixelWidth:1200},comment:'사진 설명'}, {id:'occ-b',mediaId:'m1',url:'/api/files/media/m1/photo.jpg',kind:'image',comment:'같은 원본 다른 등장'}],embeds:[{id:'chat1',type:'chatgpt',url:'https://chatgpt.com/share/1234567890123456',snapshot:{title:'진짜 대화',messages:[{role:'user',text:'질문 **원문**'},{role:'assistant',text:'답변\n다음 줄'}]}}]};
const normalized = normalizeRecord(input);
assert.deepEqual(normalizeRecord(JSON.parse(JSON.stringify(normalized))),normalized,'serialization must retain all fields and occurrence identity');
assert.equal(normalized.attachments[0].id,'occ-a');
assert.notEqual(normalized.attachments[0].id,normalized.attachments[1].id,'same media can have separate occurrences');
assert.equal(normalized.legacyHtml,input.legacyHtml,'legacy HTML must remain byte-for-byte intact');
assert.equal(normalized.body,input.body,'plain text must not interpret Markdown');
assert.equal(normalized.attachments[0].crop.pixelWidth,1200);
assert.equal(normalized.embeds[0].snapshot.messages[0].text,'질문 **원문**');
assert.equal(safeMediaUrl(''),'');assert.equal(safeMediaUrl('javascript:alert(1)'),'');assert.equal(safeMediaUrl('/a.jpg'),'https://coldwaterkim.com/a.jpg');
assert.equal(mediaKind('application/pdf','x.pdf'),'file');assert.equal(mediaKind('audio/mpeg','x.mp3'),'audio');
console.log('Records V2 model serialization and preservation checks passed.');

// Optional DOM suite: point CWK_DOM_PARSER_MODULE at an installed linkedom module.
if (process.env.CWK_DOM_PARSER_MODULE) {
  const { DOMParser } = await import(process.env.CWK_DOM_PARSER_MODULE);
  const { importHTMLRecord, sanitizeLegacyHtml } = await import('../js/records-v2-model.mjs');
  class Parser {
    parseFromString(html) { return new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html'); }
  }
  const parser = new Parser();
  const plain = importHTMLRecord({id:'source1',day_key:'2026-09-05',status:'published',content:'<p>가 &amp; 나<br>**일반 문자**</p><img src="/api/files/media/photoid/a.jpg" data-cwk-image-crop="0.1,0.2,0.4,0.5,1,1200">'},'daily',Parser);
  assert.equal(plain.body,'가 & 나\n**일반 문자**');
  assert.equal(plain.attachments[0].crop.pixelWidth,1200);
  assert.equal(plain.attachments[0].mediaId,'photoid');
  assert.equal(plain.legacySource.collection,'daily_entries');
  assert.equal(plain.legacySource.url,'https://coldwaterkim.com/daily/2026-09-05/');
  assert.equal(plain.recordDate,'2026-09-05');
  for (const html of ['<p>위</p><img src="/a.jpg"><p>아래</p>','<table><tr><td><b>진짜 내용</b></td></tr></table>','<figure><img src="/a.jpg"><figcaption><strong>중요</strong></figcaption></figure>','<img src="/a.jpg" width="500">','<video src="/a.mp4" poster="/poster.jpg"></video>','<unknown-widget>내용</unknown-widget>']) {
    const result = importHTMLRecord({content:html},'posts',Parser);
    assert.equal(result.legacyHtml,html,'complex source must survive byte-for-byte');
    assert.equal(result.body,'');assert.deepEqual(result.attachments,[]);assert.deepEqual(result.embeds,[]);
  }
  const snapshot = {title:'공유된 대화',messages:[{role:'user',text:'질문 **원문**'},{role:'assistant',text:'답변\n|표|\n|--|\n|값|'}]};
  const escaped = JSON.stringify(snapshot).replaceAll('&','&amp;').replaceAll('"','&quot;');
  const chatHTML = `<div class="cwk-chatgpt-embed" data-cwk-chatgpt-embed="true" data-cwk-chatgpt-snapshot="${escaped}"><a data-cwk-chatgpt-link="true" href="https://chatgpt.com/share/1234567890123456">원본</a><section class="cwk-chatgpt-message" data-role="user"><div class="cwk-chatgpt-message-text">질문</div></section></div>`;
  const chatRecord=importHTMLRecord({content:chatHTML},'posts',Parser);
  assert.deepEqual(chatRecord.embeds[0].snapshot,snapshot);
  const dirty=`<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">위험 링크</a><img src="/a.jpg" data-cwk-image-crop="0.1,0.2,0.4,0.5,1,1200"><iframe src="https://evil.example"></iframe><iframe src="https://www.youtube.com/embed/Abc123" onload="alert(1)"></iframe>${chatHTML}`;
  const clean = sanitizeLegacyHtml(dirty,Parser), document = parser.parseFromString(clean);
  assert.equal(document.querySelectorAll('script,[onerror],[onload]').length,0);
  assert.equal(document.querySelectorAll('iframe').length,1);
  assert.equal(document.querySelectorAll('[src^="javascript:"],[href^="javascript:"]').length,0);
  assert.equal(document.querySelector('[data-cwk-image-crop]').getAttribute('data-cwk-image-crop'),'0.1,0.2,0.4,0.5,1,1200');
  assert.deepEqual(JSON.parse(document.querySelector('[data-cwk-chatgpt-snapshot]').getAttribute('data-cwk-chatgpt-snapshot')),snapshot);
  assert.ok(document.querySelector('.cwk-chatgpt-message .cwk-chatgpt-message-text'),'enhanceChatGPT selectors must survive sanitation');
  console.log('Records V2 real DOM import, crop, ChatGPT fidelity and sanitizer checks passed.');
}
