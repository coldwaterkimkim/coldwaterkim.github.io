import { orderedRecordContent, recordTitle, sanitizeLegacyHtml } from './records-v2-model.mjs';
import { serializeImageCrop } from './image-crop.mjs';

// Compose a document without mutating the stored record or deleting its media.
export function documentRecordHtml(record) {
  const root=document.createElement('div');
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;root.append(p);};
  const title = record.legacyHtml?.includes('<!--cwk-document-->') ? '' : recordTitle(record);
  if(title){const h=document.createElement('h1');h.textContent=title;root.append(h);}
  if(record.body)String(record.body).split('\n').forEach(paragraph);
  if(record.legacyHtml){const content=document.createElement('div');content.innerHTML=sanitizeLegacyHtml(record.legacyHtml);root.append(...content.childNodes);}
  for(const item of orderedRecordContent(record)){
    if(item.type){
      if(item.type==='youtube'){const video=document.createElement('video');video.src=item.url;video.controls=true;root.append(video);}
      else {
        const node=document.createElement('div'),a=document.createElement('a');a.href=item.url;a.textContent=item.snapshot?.title||item.url;
        if(item.type==='chatgpt'){node.className='cwk-chatgpt-embed';node.setAttribute('data-cwk-chatgpt-embed','true');node.setAttribute('data-cwk-chatgpt-snapshot',JSON.stringify(item.snapshot||{}));a.setAttribute('data-cwk-chatgpt-link','true');}
        node.append(a);root.append(node);
      }
    }else{
      const node=document.createElement(item.kind==='image'?'img':item.kind==='video'?'video':item.kind==='audio'?'audio':'a');
      if(node.tagName==='A'){node.href=item.url;node.textContent=item.name||'첨부 파일';}
      else {node.src=item.url;if(item.kind==='image'){node.alt=item.name||'';if(item.crop?.enabled)node.setAttribute('data-cwk-image-crop',serializeImageCrop(item.crop));}else node.controls=true;}
      root.append(node);
    }
    if(item.comment)paragraph(item.comment);
  }
  return root.innerHTML;
}
export function documentHasContent(html){
  const root=document.createElement('div');root.innerHTML=html||'';
  return !!(root.textContent.trim()||root.querySelector('img,video,audio,iframe,a[href],[data-cwk-chatgpt-embed]'));
}
