import { pb, isLoggedIn, uploadMedia, getMediaUrl, getChatGptSharePreview, recordContentView, getContentViewCounts } from './pb.js';
import { createEditorUploadCoordinator } from './editor-upload-coordinator.mjs';
import { normalizeRecord, stableOccurrenceId, mediaKind } from './records-v2-model.mjs';
const endpoint = '/api/cwk/records-v2';
export const isOwner = () => isLoggedIn();
export async function initSession() {
  const enabled = typeof __RECORDS_PREVIEW__ !== 'undefined' && __RECORDS_PREVIEW__ === true;
  if(enabled){const params=new URLSearchParams(location.search);if(params.has('guest'))sessionStorage.setItem('cwk:review:guest','1');if(params.has('owner'))sessionStorage.removeItem('cwk:review:guest');if(sessionStorage.getItem('cwk:review:guest')==='1'){pb.authStore.clear();return false;}}
  if (enabled && ['localhost','127.0.0.1','::1'].includes(location.hostname)) {
    const response = await fetch('/__preview/session', {cache:'no-store'});
    if (!response.ok) throw new Error('로컬 미리보기 로그인을 불러오지 못했어.');
    const session = await response.json();
    if (!session.token || !session.record) throw new Error('로컬 미리보기 세션이 비어 있어.');
    pb.authStore.save(session.token, session.record);
  }
  return isOwner();
}
export async function listRecords({page=1,perPage=20,category,status}={}) {
  const query = {page,perPage}; if (category) query.category=category; if (status) query.status=status;
  const result = await pb.send(endpoint, {method:'GET',query,requestKey:null});
  return {...result,items:Array.from(result.items || []).map(normalizeRecord)};
}
export async function getRecord(id) { return normalizeRecord(await pb.send(`${endpoint}/${encodeURIComponent(id)}`,{method:'GET',requestKey:null})); }
// Keep the exact first POST until its outcome is known. The server hashes that
// payload, so edited retries must recover its record before sending an update.
const pendingCreates = new Map();
const editableSnapshot = value => {
  const {id,created,updated,sourceUpdated,firstPublishedAt,revision,legacySource,...content}=normalizeRecord(value);
  // Go omits an empty legacyHtml; the compatibility bridge adds source metadata
  // (including a derived/trimmed title) without changing editable document data.
  if(!content.legacyHtml)delete content.legacyHtml;
  return JSON.stringify(content);
};
async function saveNewRecord(body,clientRequestId) {
  let pending=pendingCreates.get(clientRequestId);
  if(!pending){pending={body:{...body,clientRequestId},uncertain:false,lastUpdate:null};pendingCreates.set(clientRequestId,pending);}
  try{
    const recovered=normalizeRecord(await pb.send(endpoint,{method:'POST',body:pending.body,requestKey:null}));
    pending.uncertain=true;
    let saved=recovered;
    if(editableSnapshot(body)!==editableSnapshot(pending.body)&&editableSnapshot(recovered)!==editableSnapshot(body)){
      // A different tab's edits must not be overwritten while recovering ours.
      if(editableSnapshot(recovered)!==editableSnapshot(pending.body)&&(!pending.lastUpdate||editableSnapshot(recovered)!==editableSnapshot(pending.lastUpdate)))throw new Error('저장된 기록이 다른 곳에서 변경됐어. 현재 작성 내용은 유지돼. 다른 탭의 기록을 확인해줘.');
      const update={...body,id:recovered.id,revision:recovered.revision,firstPublishedAt:recovered.firstPublishedAt,legacySource:recovered.legacySource,sourceUpdated:recovered.sourceUpdated};
      pending.lastUpdate=structuredClone(update);
      saved=normalizeRecord(await pb.send(`${endpoint}/${encodeURIComponent(recovered.id)}`,{method:'PUT',body:update,requestKey:null}));
    }
    pendingCreates.delete(clientRequestId);
    return saved;
  }catch(error){
    // Only a definitive rejection of the first request permits a new payload.
    // Network failures and server failures may have happened after commit.
    if(!pending.uncertain&&error?.status>=400&&error.status<500)pendingCreates.delete(clientRequestId);
    else pending.uncertain=true;
    throw error;
  }
}
export async function saveRecord(record, {replaceLegacyHtml=false,contentEditing=false}={}) {
  if (!isOwner()) throw new Error('OWNER 로그인이 필요해.');
  if(replaceLegacyHtml||contentEditing){
    let capabilities;
    try {capabilities=await pb.send(`${endpoint}/capabilities`,{method:'GET',requestKey:null});}catch{}
    if(contentEditing&&!capabilities?.contentEditing)throw new Error('새 콘텐츠 편집기의 제목·순서·개별 설명 저장을 지원하는 서버가 아직 연결되지 않았어. 작성 내용은 유지돼. 서버 업데이트 후 다시 저장해줘.');
    if(replaceLegacyHtml&&!capabilities?.documentEditing)throw new Error('문서 편집 저장을 지원하는 서버가 아직 연결되지 않았어. 본문을 유지한 채 서버 업데이트 후 다시 저장해줘.');
  }
  const body = normalizeRecord(record);
  if(replaceLegacyHtml)body.replaceLegacyHtml=true;
  if(!body.id&&record.clientRequestId)return saveNewRecord(body,record.clientRequestId);
  return normalizeRecord(await pb.send(body.id ? `${endpoint}/${encodeURIComponent(body.id)}` : endpoint,{method:body.id?'PUT':'POST',body,requestKey:null}));
}
export const deleteRecord = record => pb.send(`${endpoint}/${encodeURIComponent(record.id)}`,{method:'DELETE',query:{revision:record.revision,...(record.id.includes(':')?{sourceUpdated:record.sourceUpdated}:{})},requestKey:null});
export const resolveChatGptShare = url => getChatGptSharePreview(url);
export function recordViewTarget(record) {
  const source=record.legacySource;
  if (!source?.id) return null;
  if(source.collection==='nasajab') return {kind:'nasajab',id:source.id,published:record.status==='published'};
  return source.collection==='daily_entries'
    ? {kind:'daily',id:record.recordDate,slug:record.recordDate,published:record.status==='published'}
    : {kind:'post',id:source.id,slug:source.slug||'',published:record.status==='published'};
}
export async function recordDetailView(record) {
  const target=recordViewTarget(record);if(target)await recordContentView(target);
}
export async function recordDetailCount(record) {
  const target=recordViewTarget(record);if(!target||!isOwner())return null;
  const counts=await getContentViewCounts([target]);return counts[`${target.kind}:${target.id}`]??0;
}
// One coordinator per loaded browser module. UI renders never reset its dedupe or in-flight state.
const coordinator = createEditorUploadCoordinator({uploadFile:(file,options)=>uploadMedia(file,file.name,'Records V2 media',options)});
export async function uploadFiles(files,{onProgress}={}) {
  if (!isOwner()) throw new Error('OWNER 로그인이 필요해.');
  const result = await coordinator.runBatch(files,{onFileProgress:(file,progress,index,total)=>onProgress?.(progress,file,index,total)});
  const attachments = result.uploaded.map(({file,result:media})=>({id:stableOccurrenceId(),mediaId:media.id,url:getMediaUrl(media,media.file),name:file.name,mime:file.type,kind:mediaKind(file.type,file.name),crop:null,comment:''}));
  attachments.errors=result.errors; attachments.duplicate=result.duplicate;
  return attachments;
}
