// Retain native playback controls; random-next shares the same player surface.
export function initBgmPlayer(audio, shuffle) {
  if (!audio || audio._bgmControls) return;
  const controls = document.createElement('div');
  controls.className = 'bgm-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'BGM 플레이어');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'bgm-shuffle';
  next.setAttribute('data-bgm-shuffle', '');
  next.setAttribute('aria-label', '다음 곡 랜덤 재생');
  next.title = '다음 곡 랜덤 재생';
  next.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-5m2-3c2-3 3-4 5-4h3m-4-4 4 4-4 4"/></svg>';
  const status = document.createElement('span');
  status.className = 'bgm-player-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  audio.before(controls);
  controls.append(audio, next);
  controls.after(status);
  audio._bgmControls = controls;
  const update = () => { next.disabled = !(audio._bgmPlaylist?.length > 0); };
  next.addEventListener('click', async () => {
    status.hidden = true;
    try { await shuffle(); }
    catch { status.textContent = '재생하지 못했어. 다시 눌러줘.'; status.hidden = false; }
  });
  audio.addEventListener('bgm-playlist-changed', update);
  update();
}
