/** Controls for the existing record photo rail; media and captions stay with the caller. */
const installed = new WeakMap();

function arrowButton(direction) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `photo-carousel-arrow photo-carousel-arrow--${direction}`;
  button.setAttribute('aria-label', direction === 'previous' ? '이전 사진·영상' : '다음 사진·영상');
  // Overlapping uneven strokes keep the arrow legible without a polished icon edge.
  button.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M31 7 12 23 30 41 34 36 20 23 35 11 31 7Z" fill="currentColor" opacity=".82"/>
    <path d="M30 9 14 24 31 39M33 8 16 24 33 37" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-dasharray="3.7 1.1 5.4 .8"/>
    <path d="m28 12-9 9m0 6 11 10" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>
  </svg>`;
  return button;
}

export function installPhotoCarousel(carousel) {
  if (!carousel || installed.has(carousel)) return installed.get(carousel);
  const slides = carousel.querySelector('.rv-slides');
  const count = slides?.querySelectorAll(':scope > .rv-slide').length || 0;
  if (count < 2) return;

  const previous = arrowButton('previous');
  const next = arrowButton('next');
  carousel.classList.add('photo-carousel');
  carousel.append(previous, next);
  let drag = null;
  let suppressClick = false;
  let suppressionTimer;
  const removers = [];
  const listen = (node, type, callback, options) => {
    node.addEventListener(type, callback, options);
    removers.push(() => node.removeEventListener(type, callback, options));
  };
  const currentIndex = () => Math.max(0, Math.min(count - 1, Math.round(slides.scrollLeft / (slides.clientWidth || 1))));
  const sync = () => {
    const index = currentIndex();
    previous.disabled = index === 0;
    next.disabled = index === count - 1;
  };
  const go = index => {
    const target = Math.max(0, Math.min(count - 1, index));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    slides.scrollTo({left: target * slides.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth'});
  };
  listen(previous, 'click', () => go(currentIndex() - 1));
  listen(next, 'click', () => go(currentIndex() + 1));
  listen(slides, 'scroll', sync, {passive: true});
  listen(carousel, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    // A video's own arrow-key seeking and form controls retain their native behavior.
    if (event.target.closest('video,audio,input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    go(currentIndex() + (event.key === 'ArrowRight' ? 1 : -1));
  });
  listen(slides, 'pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('video,audio,button,input,textarea,select')) return;
    clearTimeout(suppressionTimer);
    suppressClick = false;
    drag = {id: event.pointerId, x: event.clientX, left: slides.scrollLeft, index: currentIndex(), moved: false};
  });
  listen(slides, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = event.clientX - drag.x;
    if (!drag.moved && Math.abs(distance) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      slides.classList.add('photo-carousel-dragging');
      slides.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    drag.distance = distance;
    slides.scrollLeft = drag.left - distance;
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const state = drag;
    drag = null;
    slides.classList.remove('photo-carousel-dragging');
    if (slides.hasPointerCapture(event.pointerId)) slides.releasePointerCapture(event.pointerId);
    if (!state.moved) return;
    suppressClick = true;
    suppressionTimer = setTimeout(() => { suppressClick = false; }, 400);
    const crossed = Math.abs(state.distance || 0) >= Math.min(50, slides.clientWidth * .12);
    go(state.index + (crossed && event.type !== 'pointercancel' ? (state.distance < 0 ? 1 : -1) : 0));
  };
  listen(slides, 'pointerup', release);
  listen(slides, 'pointercancel', release);
  listen(slides, 'lostpointercapture', event => {
    if (drag?.id === event.pointerId) release(event);
  });
  listen(slides, 'pointerleave', event => {
    if (drag && !drag.moved && event.pointerId === drag.id) drag = null;
  });
  listen(slides, 'dragstart', event => event.preventDefault());
  listen(slides, 'click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  sync();
  const frame = requestAnimationFrame(sync);
  const destroy = () => {
    cancelAnimationFrame(frame);
    clearTimeout(suppressionTimer);
    removers.forEach(remove => remove());
    previous.remove();
    next.remove();
    carousel.classList.remove('photo-carousel');
    slides.classList.remove('photo-carousel-dragging');
    installed.delete(carousel);
  };
  installed.set(carousel, destroy);
  return destroy;
}
