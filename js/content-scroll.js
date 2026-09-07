// One scroll owner on desktop; normal document scrolling on mobile.
export function getContentScroller() {
  return matchMedia('(min-width: 641px)').matches ? document.querySelector('.cwk-scroll-content') : null;
}
export function readContentScroll() { return getContentScroller()?.scrollTop ?? window.scrollY; }
export function scrollContentTo(top = 0) {
  const scroller = getContentScroller();
  if (scroller) scroller.scrollTo({top, behavior:'instant'});
  else window.scrollTo({top, behavior:'instant'});
}
export function scrollContentIntoView(node) {
  if (!node) return;
  const scroller = getContentScroller();
  if (scroller) scrollContentTo(scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  else node.scrollIntoView({block:'start'});
}
