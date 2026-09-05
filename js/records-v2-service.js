import { pb, isLoggedIn, uploadMedia, getMediaUrl, getChatGptSharePreview } from './pb.js';
import { createEditorUploadCoordinator } from './editor-upload-coordinator.mjs';
import { normalizeRecord, stableOccurrenceId, mediaKind } from './records-v2-model.mjs';
const endpoint = '/api/cwk/records-v2';
export const isOwner = () => isLoggedIn();
export async function initSession() {
  const enabled = typeof __RECORDS_PREVIEW__ !== 'undefined' && __RECORDS_PREVIEW__ === true;
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
export async function saveRecord(record) {
  if (!isOwner()) throw new Error('OWNER 로그인이 필요해.');
  const body = normalizeRecord(record);
  return normalizeRecord(await pb.send(body.id ? `${endpoint}/${encodeURIComponent(body.id)}` : endpoint,{method:body.id?'PUT':'POST',body,requestKey:null}));
}
export const resolveChatGptShare = url => getChatGptSharePreview(url);
// One coordinator per loaded browser module. UI renders never reset its dedupe or in-flight state.
const coordinator = createEditorUploadCoordinator({uploadFile:(file,options)=>uploadMedia(file,file.name,'Records V2 media',options)});
export async function uploadFiles(files,{onProgress}={}) {
  if (!isOwner()) throw new Error('OWNER 로그인이 필요해.');
  const result = await coordinator.runBatch(files,{onFileProgress:(file,progress,index,total)=>onProgress?.(progress,file,index,total)});
  const attachments = result.uploaded.map(({file,result:media})=>({id:stableOccurrenceId(),mediaId:media.id,url:getMediaUrl(media,media.file),name:file.name,mime:file.type,kind:mediaKind(file.type,file.name),crop:null,comment:''}));
  attachments.errors=result.errors; attachments.duplicate=result.duplicate;
  return attachments;
}
