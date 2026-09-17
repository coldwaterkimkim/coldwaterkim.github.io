const categories=[['#home','전체 보기','all',[374,88,282,88]],['#posts','나으 생각','thought',[326,151,385,140]],['#daily','나으 하루','daily',[307,104,410,138]],['#nasajab','나를 사로잡은 것들','interests'],['#projects','내가 만든 것들','making']];
function artwork(item){
 const [,label,key,box]=item;
 if(!box)return `<img src="/assets/sketch/${key}-title.png" alt="${label}" draggable="false">`;
 return `<svg viewBox="${box.join(' ')}" aria-label="${label}" role="img"><image href="/assets/sketch/${key}-wire.png" width="1024" height="1536"/></svg>`;
}
export function installTitleSliders(){
 const root=document.querySelector('#records-app');if(!root)return;
 const enhance=()=>{
  const heading=root.querySelector('.rv-heading');if(!heading||heading.dataset.slider)return;
  const index=categories.findIndex(c=>c[0]===location.hash);if(index<0)return;
  heading.dataset.slider='true';
  const rail=document.createElement('nav');rail.className='title-slider';rail.setAttribute('aria-label','카테고리 좌우 전환');
  const items=[categories[(index+4)%5],categories[index],categories[(index+1)%5]];
  rail.innerHTML=items.map((item,i)=>`<a href="${item[0]}" class="title-slide" ${i===1?'aria-current="page"':''} aria-label="${item[1]}">${artwork(item)}</a>`).join('');
  heading.replaceChildren(rail);
  let ready=false,timer,drag=null,moved=false;
  const center=()=>{rail.scrollLeft=(rail.scrollWidth-rail.clientWidth)/2;};
  requestAnimationFrame(()=>{center();setTimeout(()=>{center();ready=true;},250);});
  new ResizeObserver(()=>{ready=false;clearTimeout(timer);center();setTimeout(()=>{if(rail.isConnected){center();ready=true;}},250);}).observe(rail);
  rail.addEventListener('scroll',()=>{if(!ready||drag)return;clearTimeout(timer);timer=setTimeout(()=>{if(!rail.isConnected||location.hash!==categories[index][0])return;const centerX=rail.scrollLeft+rail.clientWidth/2;const links=[...rail.children];const closest=links.reduce((a,b)=>Math.abs(a.offsetLeft+a.offsetWidth/2-centerX)<Math.abs(b.offsetLeft+b.offsetWidth/2-centerX)?a:b);if(closest!==links[1])location.hash=closest.hash;},180);});
  rail.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;drag={x:event.clientX,left:rail.scrollLeft};moved=false;rail.setPointerCapture(event.pointerId);rail.classList.add('dragging');});
  rail.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x;drag.dx=dx;if(Math.abs(dx)>6)moved=true;rail.scrollLeft=drag.left-dx;});
  const release=event=>{if(!drag)return;const dx=drag.dx||0;drag=null;rail.classList.remove('dragging');if(Math.abs(dx)>50){location.hash=items[dx<0?2:0][0];return;}if(!moved){const link=document.elementFromPoint(event.clientX,event.clientY)?.closest('.title-slide');if(link)location.hash=link.hash;}rail.dispatchEvent(new Event('scroll'));};
  rail.addEventListener('pointerup',release);rail.addEventListener('pointercancel',release);
  rail.addEventListener('click',event=>{if(moved){event.preventDefault();moved=false;}});
  rail.addEventListener('dragstart',event=>event.preventDefault());
  rail.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();location.hash=items[event.key==='ArrowLeft'?0:2][0];});
 };
 new MutationObserver(enhance).observe(root,{childList:true,subtree:true});enhance();
}
