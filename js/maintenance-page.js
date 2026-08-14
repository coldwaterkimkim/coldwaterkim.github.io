(function initMaintenancePage() {
  const dialogMessages = [
    '거 참. 공사중이라니까여?',
    '새로고침으로 고쳐질 거였으면 망치를 왜 들었겠어여.',
    'DB가 아직 삐졌습니다. 조금만 기다려주세여.',
  ];
  const refreshLabels = [
    '새로고침',
    '진짜 새로고침',
    '그래도 새로고침',
    '버튼도 공사중',
  ];
  const repairAsset = new URL('../assets/maintenance-worker.gif', import.meta.url).href;
  const repairStillAsset = new URL('../assets/maintenance-worker-still.png', import.meta.url).href;
  const glareAsset = new URL('../assets/maintenance-worker-glare.gif', import.meta.url).href;
  const glareStillAsset = new URL('../assets/maintenance-worker-glare-still.png', import.meta.url).href;
  const recoveryIntervalMs = 5000;

  const refreshButton = document.querySelector('[data-maintenance-refresh]');
  const dialog = document.querySelector('[data-maintenance-dialog]');
  const dialogMessage = document.querySelector('[data-maintenance-dialog-message]');
  const dialogClose = document.querySelector('[data-maintenance-dialog-close]');
  const dialogConfirm = document.querySelector('[data-maintenance-dialog-confirm]');
  const worker = document.querySelector('[data-maintenance-worker]');
  const workerFallback = document.querySelector('[data-maintenance-worker-fallback]');
  let refreshCount = 0;
  let reactionTimer = 0;

  function stopReaction() {
    worker.src = repairAsset;
    worker.alt = '안전모를 쓴 주인장이 서버를 바라보며 망치로 수리하는 16비트 픽셀 애니메이션';
    workerFallback.src = repairStillAsset;
    workerFallback.alt = '안전모를 쓴 주인장이 서버를 바라보며 수리하는 16비트 픽셀 그림';
  }

  function playReaction() {
    window.clearTimeout(reactionTimer);
    worker.src = `${glareAsset}?play=${refreshCount}`;
    worker.alt = '망치질을 멈춘 주인장이 방문자를 잠깐 째려보는 16비트 픽셀 애니메이션';
    workerFallback.src = glareStillAsset;
    workerFallback.alt = '망치질을 멈추고 방문자를 바라보는 주인장의 16비트 픽셀 그림';
    reactionTimer = window.setTimeout(stopReaction, 1320);
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  refreshButton.addEventListener('click', () => {
    refreshCount += 1;
    refreshButton.textContent = refreshLabels[Math.min(refreshCount, refreshLabels.length - 1)];
    dialogMessage.textContent = refreshCount >= 4
      ? '방금 누른 사람: 1명\n고쳐진 서버: 0대'
      : dialogMessages[refreshCount - 1];

    if (refreshCount >= 3) playReaction();
    dialog.showModal();
    dialogConfirm.focus();
  });

  dialogClose.addEventListener('click', closeDialog);
  dialogConfirm.addEventListener('click', closeDialog);

  const search = new URLSearchParams(window.location.search);
  const previewEnabled = search.get('maintenance-preview') === '1';
  const rawReturnPath = search.get('return');
  let returnPath = '/';
  try {
    const returnUrl = new URL(rawReturnPath || '/', window.location.origin);
    if (returnUrl.origin === window.location.origin) {
      returnPath = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
    }
  } catch {
    returnPath = '/';
  }

  async function waitForRecovery() {
    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        window.location.replace(returnPath);
        return;
      }
    } catch {
      // 공사 화면을 유지하고 다음 주기에 다시 확인한다.
    }
    window.setTimeout(waitForRecovery, recoveryIntervalMs);
  }

  if (!previewEnabled) waitForRecovery();
})();
