// Native marquees need an explicit stop; CSS handles the blinking text.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
function updateMarquee(node) {
  if (node.nodeType !== 1) return;
  const marquees = node.matches('marquee') ? [node] : node.querySelectorAll('marquee');
  marquees.forEach(marquee => {
    if (motionPreference.matches) marquee.stop?.();
    else marquee.start?.();
  });
}
function updateMotion() { updateMarquee(document.documentElement); }
motionPreference.addEventListener('change', updateMotion);
new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(updateMarquee)))
  .observe(document.documentElement, { childList:true, subtree:true });
updateMotion();
