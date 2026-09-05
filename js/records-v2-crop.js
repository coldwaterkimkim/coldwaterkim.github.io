import { normalizeImageCrop, fitImageCropToAspect, cropAspectFromRect, cropPixelWidthFromRect } from './image-crop.mjs';
import './records-v2-crop.css';
export function openPhotoEditor(attachment, {body = ''} = {}) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'rv2-photo-editor';
    dialog.innerHTML = `<form method="dialog"><header><strong>사진 편집</strong><button type="button" data-close aria-label="닫기">×</button></header><p>사진에서 보일 부분을 움직이거나 모서리를 끌어 골라줘.</p><div class="rv2-crop-stage"><img alt="자르기 원본"><div class="rv2-crop-selection" tabindex="0" role="group" aria-label="자르기 영역: 방향키로 이동"><button type="button" data-handle="nw" aria-label="왼쪽 위 모서리"></button><button type="button" data-handle="ne" aria-label="오른쪽 위 모서리"></button><button type="button" data-handle="sw" aria-label="왼쪽 아래 모서리"></button><button type="button" data-handle="se" aria-label="오른쪽 아래 모서리"></button></div></div><p class="rv2-crop-error" role="status"></p><div class="rv2-crop-ratios"><button type="button" data-ratio="0">자유</button><button type="button" data-ratio="1">1:1</button><button type="button" data-ratio="1.3333333333333333">4:3</button><button type="button" data-ratio="1.7777777777777777">16:9</button><button type="button" data-reset>원본 전체로</button></div><label>이 사진에 남길 말<textarea rows="3" maxlength="10000"></textarea></label><small class="rv2-crop-hint"></small><footer><button type="button" data-close>취소</button><button type="submit" data-save>적용</button></footer></form>`;
    document.body.append(dialog);
    const image = dialog.querySelector('img'), selection = dialog.querySelector('.rv2-crop-selection'), stage = dialog.querySelector('.rv2-crop-stage'), save = dialog.querySelector('[data-save]'), comment = dialog.querySelector('textarea'), error = dialog.querySelector('.rv2-crop-error');
    comment.value = attachment.comment || '';
    dialog.querySelector('.rv2-crop-hint').textContent = body.trim() ? '비워두면 게시물의 글과 함께 보여.' : '사진에만 남기고 싶은 말이 있으면 적어줘.';
    let crop = normalizeImageCrop(attachment.crop || {}), ratio = 0, interaction = null, finished = false, ready = false;
    const previousFocus = document.activeElement;
    function draw() { Object.assign(selection.style,{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}); dialog.querySelectorAll('[data-ratio]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.ratio) === ratio))); }
    function finish(value) { if (finished) return; finished = true; image.onload=null; image.onerror=null; dialog.close(); dialog.remove(); previousFocus?.focus?.(); resolve(value); }
    dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click',()=>finish(null)));
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
    dialog.addEventListener('close',()=>{if(!finished)finish(null);});
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(!ready)return; finish({crop:crop.enabled?normalizeImageCrop({...crop,aspect:cropAspectFromRect(crop,image.naturalWidth/image.naturalHeight),pixelWidth:cropPixelWidthFromRect(crop,image.naturalWidth)}):null,comment:comment.value});});
    dialog.querySelectorAll('[data-ratio]').forEach(b=>b.addEventListener('click',()=>{if(!ready)return;ratio=Number(b.dataset.ratio);if(ratio)crop=fitImageCropToAspect(crop,ratio,image.naturalWidth/image.naturalHeight);draw();}));
    dialog.querySelector('[data-reset]').addEventListener('click',()=>{crop=normalizeImageCrop();ratio=0;draw();});
    selection.addEventListener('pointerdown',e=>{if(!ready || e.button!==0)return;e.preventDefault();const bounds=stage.getBoundingClientRect();interaction={id:e.pointerId,handle:e.target.dataset.handle || '',x:e.clientX,y:e.clientY,bounds,crop:{...crop}};selection.setPointerCapture(e.pointerId);});
    selection.addEventListener('pointermove',e=>{
      if(!interaction || interaction.id!==e.pointerId)return;
      const old=interaction.crop, dx=(e.clientX-interaction.x)/interaction.bounds.width,dy=(e.clientY-interaction.y)/interaction.bounds.height,h=interaction.handle;
      if(!h)crop=normalizeImageCrop({...old,enabled:true,x:Math.min(1-old.width,Math.max(0,old.x+dx)),y:Math.min(1-old.height,Math.max(0,old.y+dy))});
      else {
        const anchorX=h.includes('w')?old.x+old.width:old.x,anchorY=h.includes('n')?old.y+old.height:old.y;
        let width=Math.max(.05,h.includes('w')?old.width-dx:old.width+dx),height=Math.max(.05,h.includes('n')?old.height-dy:old.height+dy);
        const maxWidth=h.includes('w')?anchorX:1-anchorX,maxHeight=h.includes('n')?anchorY:1-anchorY;
        if(ratio){const factor=(image.naturalWidth/image.naturalHeight)/ratio;width=Math.min(width,maxWidth,maxHeight/factor);height=width*factor;}else{width=Math.min(width,maxWidth);height=Math.min(height,maxHeight);}
        crop=normalizeImageCrop({...old,enabled:true,x:h.includes('w')?anchorX-width:anchorX,y:h.includes('n')?anchorY-height:anchorY,width,height});
      }draw();
    });
    const end=()=>{interaction=null;};selection.addEventListener('pointerup',end);selection.addEventListener('pointercancel',end);selection.addEventListener('lostpointercapture',end);
    selection.addEventListener('keydown',e=>{if(e.target!==selection || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?.05:.01;crop=normalizeImageCrop({...crop,enabled:true,x:Math.min(1-crop.width,Math.max(0,crop.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0))),y:Math.min(1-crop.height,Math.max(0,crop.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)))});draw();});
    save.disabled=true;
    image.onload=()=>{ready=true;save.disabled=false;stage.style.aspectRatio=String(image.naturalWidth/image.naturalHeight);draw();};
    image.onerror=()=>{error.textContent='원본 사진을 불러오지 못했어. 취소하고 다시 시도해줘.';};
    image.src=attachment.url;draw();dialog.showModal();
  });
}
