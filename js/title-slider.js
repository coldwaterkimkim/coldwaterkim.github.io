import '../css/title-slider.css';

const categories = [
  ['#posts', '나으 생각', 'thought', [326, 151, 385, 140]],
  ['#daily', '나으 하루', 'daily', [307, 104, 410, 138]],
  ['#nasajab', '나를 사로잡은 것들', 'interests'],
  ['#projects', '내가 만든 것들', 'making'],
];
const wrap = index => (index + categories.length) % categories.length;
const routeIndex = () => categories.findIndex(([hash]) => hash === location.hash);
function artwork([, label, key, box]) {
  if (!box) return `<img src="/assets/sketch/${key}-title.png" alt="${label}" draggable="false">`;
  return `<svg viewBox="${box.join(' ')}" aria-label="${label}" role="img"><image href="/assets/sketch/${key}-wire.png" width="1024" height="1536"/></svg>`;
}

export function installTitleSliders() {
  const root = document.querySelector('#records-app');
  if (!root || document.querySelector('[data-title-navigation]')) return;
  const section = document.createElement('section');
  section.dataset.titleNavigation = '';
  section.className = 'title-navigation';
  section.innerHTML = '<nav class="title-slider title-slider-persistent" aria-label="카테고리 좌우 전환"><div class="title-slider-track"></div></nav>';
  root.before(section);
  const rail = section.firstElementChild;
  const track = rail.firstElementChild;
  const links = [-1, 0, 1].map(() => {
    const link = document.createElement('a');
    link.className = 'title-slide';
    track.append(link);
    return link;
  });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = Math.max(0, routeIndex());
  let stepWidth = 0, timer = 0, busy = false, queued = 0, pointer = null;
  let suppressClick = false, wheelTotal = 0, wheelAt = 0;
  const position = (offset = 0) => {
    const width = rail.clientWidth;
    stepWidth = width * .72;
    track.style.transform = `translate3d(${(width - stepWidth) / 2 - stepWidth + offset}px,0,0)`;
  };
  const paint = () => {
    links.forEach((link, slot) => {
      const item = categories[wrap(index + slot - 1)];
      link.href = item[0];
      link.setAttribute('aria-label', item[1]);
      link.toggleAttribute('aria-current', slot === 1);
      if (slot === 1) link.setAttribute('aria-current', 'page');
      link.innerHTML = artwork(item);
    });
    rail.setAttribute('aria-label', `${categories[index][1]} · 좌우로 밀어 카테고리 전환`);
    position();
  };
  const stop = () => {
    clearTimeout(timer);
    busy = false;
    queued = 0;
    pointer = null;
    track.style.transition = 'none';
    rail.classList.remove('dragging');
  };
  const move = direction => {
    if (section.hidden) return;
    if (busy) { queued = Math.max(-5, Math.min(5, queued + direction)); return; }
    busy = true;
    track.style.transition = motion.matches ? 'none' : 'transform 240ms ease';
    position(-direction * stepWidth);
    const finish = () => {
      index = wrap(index + direction);
      track.style.transition = 'none';
      paint();
      if (direction) location.hash = categories[index][0];
      busy = false;
      if (queued) {
        const next = Math.sign(queued);
        queued -= next;
        // Flush the recentered frame before the next transition starts.
        void track.offsetWidth;
        move(next);
      }
    };
    timer = setTimeout(finish, motion.matches ? 0 : 250);
  };
  const sync = () => {
    const next = routeIndex();
    section.hidden = next < 0;
    root.querySelectorAll('.rv-heading').forEach(heading => { heading.hidden = next >= 0; });
    if (next < 0) { stop(); return; }
    if (index !== next) { stop(); index = next; paint(); }
    else if (!busy && !pointer) position();
  };
  rail.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
    const slot = links.indexOf(event.target.closest('.title-slide'));
    if (slot < 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (slot !== 1) move(slot - 1);
  });
  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  rail.addEventListener('pointerdown', event => {
    if (busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    suppressClick = false;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: false };
    track.style.transition = 'none';
  });
  rail.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { pointer = null; return; }
    if (!pointer.horizontal && Math.abs(dx) > 8) {
      pointer.horizontal = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add('dragging');
    }
    if (!pointer.horizontal) return;
    pointer.dx = Math.max(-stepWidth, Math.min(stepWidth, dx));
    position(pointer.dx);
  });
  const release = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { dx, horizontal } = pointer;
    pointer = null;
    rail.classList.remove('dragging');
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    if (!horizontal) return;
    suppressClick = true;
    move(event.type !== 'pointercancel' && Math.abs(dx) > Math.min(65, stepWidth * .2) ? (dx < 0 ? 1 : -1) : 0);
  };
  rail.addEventListener('pointerup', release);
  rail.addEventListener('pointercancel', release);
  rail.addEventListener('dragstart', event => event.preventDefault());
  rail.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 180) wheelTotal = 0;
    wheelAt = now;
    if (busy) { wheelTotal = 0; return; }
    wheelTotal += event.deltaX;
    if (Math.abs(wheelTotal) > 45) { move(Math.sign(wheelTotal)); wheelTotal = 0; }
  }, { passive: false });
  new MutationObserver(sync).observe(root, { childList: true, subtree: true });
  new ResizeObserver(() => {
    if (section.hidden) return;
    if (Math.abs(rail.clientWidth * .72 - stepWidth) > 1) { stop(); index = Math.max(0, routeIndex()); paint(); }
  }).observe(rail);
  window.addEventListener('hashchange', sync);
  motion.addEventListener('change', () => { stop(); index = Math.max(0, routeIndex()); paint(); });
  paint();
  sync();
}
