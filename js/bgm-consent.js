// A choice lasts for this tab session, including navigation and reloads.
const KEY = 'cwk:bgm:preference';
// Retire the old cross-visit preference without importing it into this session.
try { localStorage.removeItem(KEY); } catch {}
let preference;
try { preference = sessionStorage.getItem(KEY); } catch {}
if (!['on', 'off'].includes(preference)) preference = null;
let revision = 0;
let leaving = false;
const players = new Set();

export function bgmAllowed() { return preference === 'on'; }
function remember(value) {
  preference = value;
  revision += 1;
  try { sessionStorage.setItem(KEY, value); } catch {}
}
function stop() {
  remember('off');
  for (const audio of players) audio.pause();
}
window.addEventListener('pagehide', () => { leaving = true; });
window.addEventListener('pageshow', () => {
  leaving = false;
  // A restored history page must respect a choice made later in this same tab.
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved === 'on' || saved === 'off') {
      preference = saved;
      revision += 1;
      if (saved === 'off') for (const audio of players) audio.pause();
    }
  } catch {}
});

export async function requestBgmPlay(audio, explicit = false) {
  if (explicit) remember('on');
  if (!bgmAllowed() || !audio?.src) return;
  const requestRevision = revision;
  try {
    await audio.play();
    if (requestRevision !== revision && !bgmAllowed()) audio.pause();
  } catch (error) {
    if (bgmAllowed()) throw error;
  }
}

export function initBgmConsent(audio) {
  if (!audio || players.has(audio)) return;
  players.add(audio);
  audio.autoplay = false;
  audio.addEventListener('play', () => {
    if (!audio.paused) remember('on');
  });
  audio.addEventListener('pause', () => {
    // load()/track changes and natural completion are not a visitor stop.
    if (audio._bgmInternalPause) { audio._bgmInternalPause = false; return; }
    if (!leaving && audio.paused && !audio.ended) stop();
  });
  if (preference !== null) return;

  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'bgm-consent';
  dialog.setAttribute('aria-labelledby', 'bgm-consent-title');
  dialog.setAttribute('aria-describedby', 'bgm-consent-copy');
  dialog.innerHTML = `
    <h2 id="bgm-consent-title">주인장 안내문</h2>
    <div class="bgm-consent-body">
      <p id="bgm-consent-copy">주인장이 골라놓은 음악이 있습니다.<br>취향에 안 맞을 수도 있습니다.</p>
      <div class="bgm-consent-actions">
        <button type="button" data-bgm-yes>일단 믿어볼게요</button>
        <button type="button" data-bgm-no autofocus>제 귀는 제가 지킬게요</button>
      </div>
    </div>`;
  document.body.append(dialog);
  const close = () => {
    dialog.close();
    dialog.remove();
    previousFocus?.focus({ preventScroll: true });
  };
  dialog.querySelector('[data-bgm-yes]').addEventListener('click', () => {
    // Call play within the gesture; settings may still be loading.
    requestBgmPlay(audio, true).catch(() => {
      const prompt = audio.closest('.mini-player')?.querySelector('[data-bgm-prompt]');
      if (prompt) prompt.hidden = false;
    });
    close();
  });
  const decline = () => { stop(); close(); };
  dialog.querySelector('[data-bgm-no]').addEventListener('click', decline);
  dialog.addEventListener('cancel', event => { event.preventDefault(); decline(); });
  dialog.showModal();
}

export function pauseBgmInternally(audio) {
  if (audio.paused) return;
  audio._bgmInternalPause = true;
  audio.pause();
}
