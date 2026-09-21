// Exercise the actual service with an in-memory server: never contacts production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeRecord} from '../js/records-v2-model.mjs';
const source=(await readFile(new URL('../js/records-v2-service.js',import.meta.url),'utf8'))
 .replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
const records=new Map(), requests=new Map();
let sequence=0,dropPost=false,dropPut=false,rejectPost=false,rejectPut=false;
const projectLegacy=value=>{
 const saved=normalizeRecord(value);
 saved.legacySource={collection:saved.category==='daily'?'daily_entries':'posts',id:`legacy-${saved.id}`,title:(saved.title.trim()||saved.body.split('\n')[0].trim()||`${saved.recordDate} 기록`).slice(0,100),slug:`record-${saved.id}`,url:`https://example.test/posts/record-${saved.id}`};
 saved.sourceUpdated=`source-revision-${saved.revision}`;
 // Match recordsV2Document's omitempty JSON representation.
 if(!saved.legacyHtml)delete saved.legacyHtml;
 return saved;
};
const pb={send:async(path,{method,body})=>{
 if(method==='GET'&&path.endsWith('/capabilities'))return {documentEditing:true,contentEditing:true};
 if(method==='POST'){
  if(rejectPost){rejectPost=false;throw Object.assign(new Error('validation'),{status:400});}
  const key=body.clientRequestId, prior=requests.get(key);
  if(prior){assert.equal(JSON.stringify(body),prior.payload,'Retry must repeat the exact first payload');return structuredClone(records.get(prior.id));}
  const saved=projectLegacy({...body,id:`record-${++sequence}`,revision:1,firstPublishedAt:body.status==='published'?'2026-09-21':''});
  records.set(saved.id,saved);requests.set(key,{id:saved.id,payload:JSON.stringify(body)});
  if(dropPost){dropPost=false;throw Object.assign(new Error('response lost'),{status:0});}
  return structuredClone(saved);
 }
 if(method==='PUT'){
  if(rejectPut){rejectPut=false;throw Object.assign(new Error('update validation'),{status:400});}
  const old=records.get(body.id);assert.equal(body.revision,old.revision,'Update uses recovered revision');
  assert.deepEqual(body.legacySource,old.legacySource,'Recovery update preserves the backend-created source');
  assert.equal(body.sourceUpdated,old.sourceUpdated,'Recovery update uses the current source revision');
  const saved=projectLegacy({...body,revision:old.revision+1});records.set(saved.id,saved);
  if(dropPut){dropPut=false;throw Object.assign(new Error('update response lost'),{status:0});}
  return structuredClone(saved);
 }
 throw new Error(`Unexpected request ${method} ${path}`);
}};
const save=new Function('pb','isLoggedIn','normalizeRecord','createEditorUploadCoordinator',`${source}\nreturn saveRecord;`)(pb,()=>true,normalizeRecord,()=>({}));
const draft=(key,body='첫 본문')=>({clientRequestId:key,category:'projects',recordDate:'2026-09-21',body,status:'draft',attachments:[],embeds:[]});
const options={replaceLegacyHtml:true};
let value=draft('same');dropPost=true;await assert.rejects(save({...value},options),/response lost/);
let saved=await save({...value},options);assert.equal(records.size,1);assert.equal(saved.body,value.body);
assert.ok(saved.legacySource,'Generated source metadata does not falsely trigger a conflict');
value=draft('edited');dropPost=true;await assert.rejects(save({...value},options));value.body='응답 유실 후 추가한 긴 본문';value.title='수정 제목';
saved=await save({...value},options);assert.equal(records.size,2);assert.equal(saved.body,value.body);assert.equal(saved.title,value.title);
value=draft('double-loss');dropPost=true;await assert.rejects(save({...value},options));value.body='두 번째 본문';dropPut=true;await assert.rejects(save({...value},options),/update response lost/);value.body='세 번째 본문';
saved=await save({...value},options);assert.equal(records.size,3);assert.equal(saved.body,'세 번째 본문');
value=draft('validation');rejectPost=true;await assert.rejects(save({...value},options),/validation/);value.body='수정 후 재시도';saved=await save({...value},options);assert.equal(saved.body,value.body);assert.equal(records.size,4);
value=draft('put-rejected');dropPost=true;await assert.rejects(save({...value},options));value.body='변경';rejectPut=true;await assert.rejects(save({...value},options),/update validation/);value.body='수정된 변경';saved=await save({...value},options);assert.equal(saved.body,value.body);assert.equal(records.size,5);
value=draft('concurrent');dropPost=true;await assert.rejects(save({...value},options));const concurrent=records.get(requests.get(value.clientRequestId).id);concurrent.body='다른 탭에서 저장한 본문';concurrent.revision++;value.body='이 탭의 미저장 본문';
await assert.rejects(save({...value},options),/다른 곳에서 변경/);assert.equal(concurrent.body,'다른 탭에서 저장한 본문');assert.equal(value.body,'이 탭의 미저장 본문');assert.equal(records.size,6);
value={...draft('normal-source'),title:'   공백 있는 제목   ',legacyHtml:''};saved=await save({...value},options);assert.equal(saved.title,value.title,'Document title is kept; only the source title may be normalized');assert.equal(saved.revision,1,'Ordinary creation does not cause an unnecessary recovery PUT');assert.equal(records.size,7);
console.log('Create retry passed: identical retry, edits after lost POST, lost recovery PUT, validation correction, concurrent edit preservation; one record per draft.');
