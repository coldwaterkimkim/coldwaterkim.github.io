// Shared navigation is static HTML, so the four destinations work before hydration.
const sidebar = document.querySelector('.cwk-unified .rv-shell-sidebar');
if (sidebar) {
  const details = sidebar.querySelector('.profile-details');
  const info = sidebar.querySelector('.profile-info');
  const infoParent = info?.parentElement;
  function moveNode(parent, node) {
    if (!node || !parent) return;
    // State-preserving moves keep the one live audio player and its listeners.
    if (typeof parent.moveBefore === 'function') parent.moveBefore(node, null);
    else {
      const audio = node.querySelector('audio');
      const wasPlaying = audio && !audio.paused;
      parent.append(node);
      if (wasPlaying) audio.play().catch(() => {});
    }
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cwk-profile-more';
  button.textContent = '프로필 전체 보기';
  button.setAttribute('aria-haspopup', 'dialog');
  sidebar.append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'cwk-profile-dialog';
  dialog.setAttribute('aria-label', '김찬수 프로필');
  const header = document.createElement('header');
  const title = document.createElement('b');
  title.textContent = 'PROFILE DATA';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '닫기';
  close.addEventListener('click', () => dialog.close());
  header.append(title, close); dialog.append(header);
  document.body.append(dialog);
  button.addEventListener('click', () => {
    if (sidebar.classList.contains('is-minimal-profile')) moveNode(dialog, info);
    moveNode(dialog, details);
    dialog.showModal();
  });
  let frame;
  function fitProfile() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (dialog.open) return;
      sidebar.classList.remove('is-compact-profile', 'is-minimal-profile');
      if (matchMedia('(min-width:641px)').matches && sidebar.scrollHeight > sidebar.clientHeight + 2) {
        sidebar.classList.add('is-compact-profile');
        if (sidebar.scrollHeight > sidebar.clientHeight + 2) sidebar.classList.add('is-minimal-profile');
      }
    });
  }
  dialog.addEventListener('close', () => {
    if (info?.parentElement === dialog) moveNode(infoParent, info);
    if (details) sidebar.insertBefore(details, button);
    fitProfile();
    button.focus({ preventScroll: true });
  });
  const desktop = matchMedia('(min-width:641px)');
  desktop.addEventListener('change', () => { if (dialog.open) dialog.close(); fitProfile(); });
  window.addEventListener('resize', fitProfile);
  new ResizeObserver(fitProfile).observe(document.querySelector('.rv-shell-table'));
  new MutationObserver(fitProfile).observe(sidebar, { childList:true, subtree:true, characterData:true });
  document.fonts?.ready.then(fitProfile);
  sidebar.querySelectorAll('img').forEach(img => img.addEventListener('load', fitProfile));
  fitProfile();
}
