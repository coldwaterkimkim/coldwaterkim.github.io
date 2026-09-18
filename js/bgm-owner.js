import {getSetting,getSettingStrict,setSetting,isLoggedIn,cmsErrorMessage,uploadMedia,trimBgmMedia,getMediaUrl,deleteMediaIfUnreferenced,escapeHtml} from './pb.js';
import {pauseBgmInternally,requestBgmPlay} from './bgm-consent.js';
import {reviewMediaValue} from './review-media.js';
import {getSavedBgmPlaylist, initBgmAutoplay, ensureBgmPrompt, setBgmPromptVisible, getBgmPlaylist, bgmTrackKeys, getBgmSchedule, setBgmSchedule, setBgmPlaylist, normalizeBgmTracks, dedupeBgmTracks, bgmTrackKey, loadBgmTrack, advanceBgmTrack, defaultBgmTitle, fileNameFromUrl} from './bgm-runtime.js';
import {
  BGM_TIME_ZONE,
  activeBgmTimeSlot,
  bgmMediaRecordId,
  bgmMinuteInTimeZone,
  bgmSlotEndMinute,
  formatBgmMinute,
  normalizeBgmSchedule,
  remapBgmScheduleTrack,
  randomBgmCandidateIndex,
  scheduledBgmTrackIndexes,
} from './bgm-playlist-logic.mjs';
const BGM_URL_SETTING_KEY = 'bgm_audio_url';
const BGM_TITLE_SETTING_KEY = 'bgm_audio_title';
const BGM_PLAYLIST_SETTING_KEY = 'bgm_playlist';
const BGM_SCHEDULE_SETTING_KEY = 'bgm_schedule';
function prependBgmTracks(tracks, playlist) {
  return dedupeBgmTracks([...normalizeBgmTracks(tracks), ...normalizeBgmTracks(playlist)]);
}

async function getBgmLibrarySettingSnapshot() {
  const values = await Promise.all([
    getSettingStrict(BGM_URL_SETTING_KEY),
    getSettingStrict(BGM_TITLE_SETTING_KEY),
    getSettingStrict(BGM_SCHEDULE_SETTING_KEY),
    getSettingStrict(BGM_PLAYLIST_SETTING_KEY),
  ]);
  return values.map(value => value || '');
}

async function restoreBgmLibrarySettings(snapshot) {
  const keys = [
    BGM_URL_SETTING_KEY,
    BGM_TITLE_SETTING_KEY,
    BGM_SCHEDULE_SETTING_KEY,
    BGM_PLAYLIST_SETTING_KEY,
  ];
  const results = await Promise.allSettled(keys.map((key, index) => setSetting(key, snapshot[index] || '')));
  return results.every(result => result.status === 'fulfilled');
}

async function saveBgmLibrarySettings(playlist, schedule) {
  const snapshot = await getBgmLibrarySettingSnapshot();
  const latestTrack = playlist[0] || null;
  const values = [
    latestTrack?.url || '',
    latestTrack?.title || '',
    JSON.stringify(schedule),
    JSON.stringify(playlist),
  ];
  const keys = [
    BGM_URL_SETTING_KEY,
    BGM_TITLE_SETTING_KEY,
    BGM_SCHEDULE_SETTING_KEY,
    BGM_PLAYLIST_SETTING_KEY,
  ];

  try {
    for (let index = 0; index < keys.length; index += 1) {
      await setSetting(keys[index], values[index]);
    }
  } catch (error) {
    const restored = await restoreBgmLibrarySettings(snapshot);
    if (!restored) error.bgmRollbackFailed = true;
    throw error;
  }

  return snapshot;
}
function initBgmOwnerTools(player, audio, trackTitle) {
  if (!player || !audio) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,.mp3';
  input.multiple = true;
  input.hidden = true;
  document.body.appendChild(input);

  const ownerRow = document.createElement('div');
  ownerRow.className = 'bgm-owner-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'owner-btn bgm-owner-btn';
  button.textContent = 'MP3 추가';
  button.setAttribute('data-bgm-upload', '');

  const scheduleButton = document.createElement('button');
  scheduleButton.type = 'button';
  scheduleButton.className = 'owner-btn bgm-owner-btn';
  scheduleButton.textContent = 'BGM 편성표';

  const status = document.createElement('span');
  status.className = 'bgm-upload-status';
  status.setAttribute('aria-live', 'polite');

  ownerRow.append(button, ' ', scheduleButton, status);
  player.appendChild(ownerRow);

  button.addEventListener('click', () => input.click());
  scheduleButton.addEventListener('click', () => toggleBgmScheduleEditor(audio, button));

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    const openEditor = document.querySelector('[data-bgm-schedule-editor]');
    if (isBgmScheduleEditorDirty(openEditor)) {
      alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 추가해줘.');
      return;
    }

    const invalidFiles = files.filter(file => !isMp3(file));
    if (invalidFiles.length > 0) {
      alert(`MP3 파일만 올릴 수 있어요.\n\n확인할 파일: ${invalidFiles.map(file => file.name).join(', ')}`);
      return;
    }

    button.disabled = true;
    setBgmScheduleEditorBusy(openEditor, true);
    status.textContent = `업로드 준비 중 (총 ${files.length}곡)`;
    const uploadedTracks = [];
    const failedFiles = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        status.textContent = `업로드 중 (${index + 1}/${files.length}) ${file.name}`;
        try {
          const media = await uploadMedia(file, file.name, 'Home BGM');
          uploadedTracks.push({
            url: getMediaUrl(media, media.file),
            title: file.name,
            uploadedAt: new Date().toISOString(),
            mediaId: media.id,
          });
        } catch (error) {
          failedFiles.push({ file, error });
        }
      }

      if (uploadedTracks.length === 0) {
        throw failedFiles[0]?.error || new Error('올라간 MP3가 없음');
      }

      const savedPlaylist = await getSavedBgmPlaylist(audio);
      const nextPlaylist = prependBgmTracks(uploadedTracks, savedPlaylist.length > 0 ? savedPlaylist : getBgmPlaylist(audio));
      const nextSchedule = normalizeBgmSchedule(getBgmSchedule(audio), bgmTrackKeys(nextPlaylist));

      await saveBgmLibrarySettings(nextPlaylist, nextSchedule);

      setBgmSchedule(audio, nextSchedule, nextPlaylist);
      setBgmPlaylist(audio, trackTitle, nextPlaylist, 0);
      initBgmAutoplay(audio);
      status.textContent = failedFiles.length > 0
        ? `${uploadedTracks.length}곡 추가 / ${failedFiles.length}곡 실패`
        : `${uploadedTracks.length}곡 추가됨 (총 ${nextPlaylist.length}곡)`;
      const editor = document.querySelector('[data-bgm-schedule-editor]');
      if (editor) {
        openBgmScheduleEditor(audio, button, {
          replace: true,
          message: `새 MP3 ${uploadedTracks.length}곡을 모든 시간대에 추가했음. 원하는 시간대만 남기시오.`,
        });
      }
      if (failedFiles.length > 0) {
        alert(`일부 MP3 업로드 실패 (${failedFiles.length}곡)\n\n${failedFiles.map(item => `${item.file.name}: ${cmsErrorMessage(item.error)}`).join('\n')}`);
      }
      setTimeout(() => status.textContent = '', 1600);
    } catch (e) {
      await Promise.allSettled(uploadedTracks.map(track => deleteMediaIfUnreferenced(track.mediaId)));
      status.textContent = '실패';
      const rollbackNote = e.bgmRollbackFailed ? '\n설정 복구도 끝나지 않았으니 다시 열어 상태를 확인해줘.' : '';
      alert('MP3 묶음 저장 실패: ' + cmsErrorMessage(e) + rollbackNote);
    } finally {
      button.disabled = false;
      setBgmScheduleEditorBusy(openEditor, false);
    }
  });
}

function toggleBgmScheduleEditor(audio, uploadButton) {
  const existing = document.querySelector('[data-bgm-schedule-editor]');
  if (existing) {
    if (isBgmScheduleEditorDirty(existing) && !confirm('저장하지 않은 BGM 편성이 있어. 닫을까?')) return;
		removeBgmScheduleEditor(existing, audio);
    return;
  }

  openBgmScheduleEditor(audio, uploadButton);
}

function openBgmScheduleEditor(audio, uploadButton, options = {}) {
  const content = document.querySelector('.sketch-content');
  if (!content || !audio) return;

  const existing = document.querySelector('[data-bgm-schedule-editor]');
  if (existing) {
    if (!options.replace && isBgmScheduleEditorDirty(existing)) return;
		removeBgmScheduleEditor(existing, audio);
  }

  const playlist = getBgmPlaylist(audio);
  const schedule = getBgmSchedule(audio);
  const currentMinute = bgmMinuteInTimeZone(new Date(), BGM_TIME_ZONE);
  const activeSlot = activeBgmTimeSlot(schedule.slots, currentMinute);
  const panel = document.createElement('section');
  panel.className = 'bgm-schedule-editor';
  panel.setAttribute('data-bgm-schedule-editor', '');
  panel.setAttribute('aria-labelledby', 'bgmScheduleTitle');

  const slotHeaders = schedule.slots.map((slot, index) => `
    <th class="bgm-schedule-slot${slot.id === activeSlot.id ? ' is-active' : ''}" scope="col">
      ${escapeHtml(slot.label)}<br>
      <span>${formatBgmMinute(slot.startMinute)}–${formatBgmMinute(bgmSlotEndMinute(schedule.slots, index))}</span><br>
      <small>${playlist.filter(track => schedule.assignments[bgmTrackKey(track)]?.includes(slot.id)).length}곡</small>
    </th>
  `).join('');

  const trackRows = playlist.map((track, trackIndex) => {
    const trackKey = bgmTrackKey(track);
    const assignedSlotIds = schedule.assignments[trackKey] || [];
    const assignmentCells = schedule.slots.map(slot => `
      <td class="${slot.id === activeSlot.id ? 'is-active' : ''}">
        <input type="checkbox" data-bgm-assignment data-track-index="${trackIndex}" data-slot-id="${slot.id}"
          aria-label="${escapeHtml(track.title)} ${escapeHtml(slot.label)} 시간대"
          ${assignedSlotIds.includes(slot.id) ? 'checked' : ''}>
      </td>
    `).join('');
    const unassigned = assignedSlotIds.length === 0 ? '<small class="bgm-unassigned">미배정</small>' : '';
	const mediaId = track.mediaId || bgmMediaRecordId(track.url);

    return `
      <tr>
        <th scope="row" class="bgm-schedule-track">
          <span class="bgm-track-actions">
            <button type="button" class="owner-btn bgm-preview-btn" data-bgm-preview="${trackIndex}" title="이 곡 미리듣기">▶</button>
			<button type="button" class="owner-btn bgm-trim-btn" data-bgm-trim="${trackIndex}"
			  aria-label="${escapeHtml(track.title)} 자르기"
			  ${mediaId ? '' : 'disabled title="PocketBase에 올린 MP3만 자를 수 있음"'}>자르기</button>
            <button type="button" class="owner-btn owner-btn-danger bgm-delete-btn" data-bgm-delete="${trackIndex}"
			  ${mediaId ? '' : 'disabled title="PocketBase에 올린 MP3만 삭제할 수 있음"'}>삭제</button>
          </span>
          <span>${escapeHtml(track.title || defaultBgmTitle(audio))}</span>
          ${unassigned}
        </th>
        ${assignmentCells}
      </tr>
	  <tr class="bgm-trim-row" data-bgm-trim-row="${trackIndex}" hidden>
		<td colspan="${schedule.slots.length + 1}"></td>
	  </tr>
    `;
  }).join('');

  const timeRows = schedule.slots.map((slot, index) => `
    <tr>
      <th scope="row">${index + 1}</th>
      <td><input type="text" maxlength="20" value="${escapeHtml(slot.label)}" data-bgm-slot-label="${slot.id}" aria-label="${escapeHtml(slot.label)} 이름"></td>
      <td><input type="time" value="${formatBgmMinute(slot.startMinute)}" data-bgm-slot-start="${slot.id}" ${index === 0 ? 'disabled' : ''}></td>
      <td>${formatBgmMinute(bgmSlotEndMinute(schedule.slots, index))}</td>
    </tr>
  `).join('');

  panel.innerHTML = `
    <div class="bgm-schedule-heading">
      <div>
        <b id="bgmScheduleTitle">★ BGM TIME TABLE</b>
        <span class="note">한국 시간 기준 · 현재 ${formatBgmMinute(currentMinute)} / ${escapeHtml(activeSlot.label)}</span>
      </div>
      <button type="button" class="owner-btn" data-bgm-editor-close>편집 닫기</button>
    </div>
    <p class="bgm-schedule-help">곡을 여러 시간대에 중복 체크할 수 있음. 현재 곡은 끊지 않고 다음 곡부터 새 편성을 적용함.</p>
    <div class="bgm-schedule-table-wrap">
      <table class="bgm-schedule-table" border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th scope="col">곡 / 시간대</th>${slotHeaders}</tr></thead>
        <tbody>${trackRows || '<tr><td colspan="6">등록된 MP3가 없음.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="bgm-time-settings" data-bgm-time-settings hidden>
      <b>시간대 설정</b>
      <span class="note">시작 시각만 수정하면 앞 시간대의 종료 시각도 함께 바뀜.</span>
      <table border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th>No.</th><th>이름</th><th>시작</th><th>종료</th></tr></thead>
        <tbody>${timeRows}</tbody>
      </table>
    </div>
    <div class="bgm-schedule-actions">
      <button type="button" class="owner-btn" data-bgm-editor-upload>+ MP3 추가</button>
      <button type="button" class="owner-btn" data-bgm-time-toggle>시간대 설정</button>
      <button type="button" class="owner-btn" data-bgm-editor-save>편성 저장</button>
      <span class="bgm-schedule-status" data-bgm-editor-status aria-live="polite">${escapeHtml(options.message || '')}</span>
    </div>
  `;

  const anchor = content.querySelector('#homeOwnerTools') || content.querySelector('.top-nav')?.parentElement;
  if (anchor) anchor.insertAdjacentElement('afterend', panel);
  else content.prepend(panel);

  bindBgmScheduleEditor(panel, audio, uploadButton);
  panel.scrollIntoView({ block: 'start' });
}

function bindBgmScheduleEditor(panel, audio, uploadButton) {
  const status = panel.querySelector('[data-bgm-editor-status]');
  const saveButton = panel.querySelector('[data-bgm-editor-save]');

  panel.querySelector('[data-bgm-editor-close]')?.addEventListener('click', () => {
    if (isBgmScheduleEditorDirty(panel) && !confirm('저장하지 않은 BGM 편성이 있어. 닫을까?')) return;
		removeBgmScheduleEditor(panel, audio);
  });
  panel.querySelector('[data-bgm-editor-upload]')?.addEventListener('click', () => uploadButton?.click());
  panel.querySelector('[data-bgm-time-toggle]')?.addEventListener('click', event => {
    const settings = panel.querySelector('[data-bgm-time-settings]');
    settings.hidden = !settings.hidden;
    event.currentTarget.textContent = settings.hidden ? '시간대 설정' : '시간대 설정 닫기';
  });

  panel.querySelectorAll('[data-bgm-preview]').forEach(button => {
    button.addEventListener('click', async () => {
      const trackIndex = Number(button.dataset.bgmPreview);
      loadBgmTrack(audio, trackIndex);
      try {
        await audio.play();
        status.textContent = '미리듣기 재생 중';
      } catch (error) {
        status.textContent = '미리듣기 실패. BGM ON을 눌러보시오.';
      }
    });
  });

	panel.querySelectorAll('[data-bgm-trim]').forEach(button => {
		button.addEventListener('click', () => openBgmTrimEditor(panel, audio, uploadButton, button));
	});

  panel.querySelectorAll('[data-bgm-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (isBgmScheduleEditorDirty(panel)) {
        alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 삭제해줘.');
        return;
      }

      const playlist = getBgmPlaylist(audio);
      const trackIndex = Number(button.dataset.bgmDelete);
      const track = playlist[trackIndex];
      const mediaId = track?.mediaId || bgmMediaRecordId(track?.url);
      if (!track || !mediaId) return;
      if (!confirm(`“${track.title || defaultBgmTitle(audio)}” MP3를 BGM에서 삭제할까?\n\n다른 글에서 쓰지 않는 파일이면 서버에서도 영구 삭제됨.`)) return;

      setBgmScheduleEditorBusy(panel, true);
      status.classList.remove('is-error');
      status.textContent = 'MP3 삭제 중...';
      const currentTrackKey = bgmTrackKey(playlist[audio._bgmTrackIndex]);
      const nextPlaylist = playlist.filter((_, index) => index !== trackIndex);
      const nextSchedule = normalizeBgmSchedule(getBgmSchedule(audio), bgmTrackKeys(nextPlaylist));

      try {
        await saveBgmLibrarySettings(nextPlaylist, nextSchedule);
        let deleted = false;
        let cleanupFailed = false;
        try {
          deleted = await deleteMediaIfUnreferenced(mediaId);
        } catch (error) {
          cleanupFailed = true;
          console.warn('BGM media cleanup failed:', cmsErrorMessage(error));
        }

        setBgmSchedule(audio, nextSchedule, nextPlaylist);
        const retainedIndex = nextPlaylist.findIndex(item => bgmTrackKey(item) === currentTrackKey);
        setBgmPlaylist(audio, audio._bgmTrackTitle, nextPlaylist, Math.max(0, retainedIndex));
        if (nextPlaylist.length > 0 && currentTrackKey === bgmTrackKey(track)) initBgmAutoplay(audio);
        openBgmScheduleEditor(audio, uploadButton, {
          replace: true,
          message: cleanupFailed
            ? `“${track.title}”을 BGM에서 제거함. 서버 파일 정리 여부는 확인하지 못했음.`
            : deleted
            ? `“${track.title}” 삭제 완료.`
            : `“${track.title}”을 BGM에서 제거함. 다른 콘텐츠에서 사용 중인 원본 파일은 보존했음.`,
        });
      } catch (error) {
        status.textContent = `삭제 실패: ${cmsErrorMessage(error)}`;
        if (error.bgmRollbackFailed) status.textContent += ' · 설정 복구 상태 확인 필요';
        status.classList.add('is-error');
        setBgmScheduleEditorBusy(panel, false);
      }
    });
  });

  panel.addEventListener('input', event => {
    if (!event.target.matches('[data-bgm-assignment], [data-bgm-slot-label], [data-bgm-slot-start]')) return;
    setBgmScheduleEditorDirty(panel, true);
    status.textContent = '저장 안 됨';
  });

  saveButton?.addEventListener('click', async () => {
    let nextSchedule;
    try {
      nextSchedule = collectBgmScheduleEditorValue(panel, audio, getBgmPlaylist(audio));
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('is-error');
      return;
    }

    saveButton.disabled = true;
    status.classList.remove('is-error');
    status.textContent = '저장 중...';
    try {
      await setSetting(BGM_SCHEDULE_SETTING_KEY, JSON.stringify(nextSchedule));
      setBgmSchedule(audio, nextSchedule);
      setBgmScheduleEditorDirty(panel, false);
      openBgmScheduleEditor(audio, uploadButton, { replace: true, message: '편성 저장 완료.' });
    } catch (error) {
      status.textContent = `저장 실패: ${cmsErrorMessage(error)}`;
      status.classList.add('is-error');
      saveButton.disabled = false;
    }
  });
}

async function openBgmTrimEditor(panel, audio, uploadButton, triggerButton) {
	const trackIndex = Number(triggerButton.dataset.bgmTrim);
	const playlist = getBgmPlaylist(audio);
	const track = playlist[trackIndex];
	const mediaId = track?.mediaId || bgmMediaRecordId(track?.url);
	const row = panel.querySelector(`[data-bgm-trim-row="${trackIndex}"]`);
	const cell = row?.querySelector('td');
	if (!track || !mediaId || !row || !cell) return;

	const openRow = panel.querySelector('[data-bgm-trim-row]:not([hidden])');
	if (openRow && openRow !== row) closeBgmTrimEditor(openRow, audio, false);
	if (!row.hidden) {
		closeBgmTrimEditor(row, audio, true);
		return;
	}

	row.hidden = false;
	cell.innerHTML = `
		<div class="bgm-trim-editor" data-bgm-trim-editor>
			<div class="bgm-trim-heading">
				<b>✂ ${escapeHtml(track.title)} 자르기</b>
				<button type="button" class="owner-btn" data-bgm-trim-close>닫기</button>
			</div>
			<div class="bgm-trim-waveform" data-bgm-trim-waveform aria-label="${escapeHtml(track.title)} 파형"></div>
			<div class="bgm-trim-fields">
				<label>시작(초) <input type="number" min="0" step="0.01" value="0" data-bgm-trim-start></label>
				<label>끝(초) <input type="number" min="0.25" step="0.01" value="" data-bgm-trim-end></label>
				<span class="note" data-bgm-trim-length>파형 불러오는 중...</span>
			</div>
			<div class="bgm-trim-actions">
				<button type="button" class="owner-btn" data-bgm-trim-preview disabled>▶ 선택 구간</button>
				<button type="button" class="owner-btn" data-bgm-trim-replace disabled>이 구간으로 교체</button>
				<span class="bgm-schedule-status" data-bgm-trim-status aria-live="polite">곡 하나만 불러오는 중...</span>
			</div>
		</div>
	`;
	const editor = cell.querySelector('[data-bgm-trim-editor]');
	const waveform = editor.querySelector('[data-bgm-trim-waveform]');
	const startInput = editor.querySelector('[data-bgm-trim-start]');
	const endInput = editor.querySelector('[data-bgm-trim-end]');
	const length = editor.querySelector('[data-bgm-trim-length]');
	const previewButton = editor.querySelector('[data-bgm-trim-preview]');
	const replaceButton = editor.querySelector('[data-bgm-trim-replace]');
	const trimStatus = editor.querySelector('[data-bgm-trim-status]');
	let region = null;
	let duration = 0;
	let resumeMainAudio = false;
	let trimRequestId = '';

	const updateFields = (start, end, updateInputs = true) => {
		const safeStart = Math.max(0, Math.min(Number(start) || 0, duration));
		const safeEnd = Math.max(safeStart, Math.min(Number(end) || 0, duration));
		if (updateInputs) {
			startInput.value = safeStart.toFixed(2);
			endInput.value = safeEnd.toFixed(2);
		}
		length.textContent = `전체 ${formatBgmDuration(duration)} · 선택 ${formatBgmDuration(safeEnd - safeStart)}`;
	};

	try {
		const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
			import('wavesurfer.js'),
			import('wavesurfer.js/dist/plugins/regions.esm.js'),
		]);
		if (!row.isConnected || row.hidden) return;
		const regions = RegionsPlugin.create();
		const waveSurfer = WaveSurfer.create({
			container: waveform,
			url: track.url,
			height: 72,
			waveColor: '#777777',
			progressColor: '#000080',
			cursorColor: '#cc0000',
			barWidth: 2,
			barGap: 1,
			plugins: [regions],
		});
		row._bgmWaveSurfer = waveSurfer;
		row._bgmResumeMainAudio = () => resumeMainAudio;

		waveSurfer.on('decode', decodedDuration => {
			duration = decodedDuration;
			endInput.max = duration.toFixed(3);
			startInput.max = Math.max(0, duration - 0.25).toFixed(3);
			region = regions.addRegion({
				start: 0,
				end: duration,
				drag: true,
				resize: true,
				minLength: 0.25,
				color: 'rgba(255, 233, 122, 0.45)',
			});
			updateFields(0, duration);
			previewButton.disabled = false;
			replaceButton.disabled = false;
			trimStatus.textContent = '노란 구간 양끝을 끌거나 초 단위 값을 입력하시오.';
		});
		waveSurfer.on('error', error => {
			trimStatus.textContent = `파형 로딩 실패: ${cmsErrorMessage(error)}`;
			trimStatus.classList.add('is-error');
		});
		regions.on('region-updated', nextRegion => {
			if (nextRegion !== region) return;
			updateFields(region.start, region.end);
		});
		const applyInputsToRegion = () => {
			if (!region || duration <= 0) return;
			const start = Number(startInput.value);
			const end = Number(endInput.value);
			if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.25 || end > duration + 0.01) {
				trimStatus.textContent = '시작보다 최소 0.25초 뒤의 끝 지점을 골라줘.';
				trimStatus.classList.add('is-error');
				previewButton.disabled = true;
				replaceButton.disabled = true;
				return false;
			}
			trimStatus.classList.remove('is-error');
			region.setOptions({ start, end });
			updateFields(start, end);
			previewButton.disabled = false;
			replaceButton.disabled = false;
			return true;
		};
		startInput.addEventListener('input', applyInputsToRegion);
		endInput.addEventListener('input', applyInputsToRegion);

		previewButton.addEventListener('click', () => {
			if (!region) return;
			if (!audio.paused) {
				resumeMainAudio = true;
				pauseBgmInternally(audio);
			}
			region.play(true);
		});

		replaceButton.addEventListener('click', async () => {
			if (isBgmScheduleEditorDirty(panel)) {
				alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 잘라줘.');
				return;
			}
			if (!region || duration <= 0 || applyInputsToRegion() === false || region.end - region.start < 0.25) return;
			if (region.start < 0.01 && Math.abs(region.end - duration) < 0.01) {
				alert('곡 전체가 선택되어 있어. 앞이나 뒤를 줄인 다음 교체해줘.');
				return;
			}
			if (!confirm(`“${track.title}”을 ${formatBgmDuration(region.start)} ~ ${formatBgmDuration(region.end)} 구간으로 교체할까?\n\n교체 성공 뒤 이전 파일은 다른 콘텐츠에서 쓰지 않을 때 서버에서도 삭제됨.`)) return;

			waveSurfer.pause();
			setBgmScheduleEditorBusy(panel, true);
			trimStatus.classList.remove('is-error');
			trimStatus.textContent = 'iMac에서 MP3 자르는 중...';
			let newMediaId = '';
			try {
				trimRequestId ||= crypto.randomUUID();
				const result = await trimBgmMedia(mediaId, region.start, region.end, trimRequestId);
				const media = result.media;
				newMediaId = media.id;
				const replacement = {
					url: getMediaUrl(media, media.file),
					title: track.title,
					uploadedAt: new Date().toISOString(),
					mediaId: media.id,
				};
				const currentPlaylist = getBgmPlaylist(audio);
				const oldKey = bgmTrackKey(track);
				const currentKey = bgmTrackKey(currentPlaylist[audio._bgmTrackIndex]);
				const wasPlaying = !audio.paused || resumeMainAudio;
				const nextPlaylist = currentPlaylist.map((item, index) => index === trackIndex ? replacement : item);
				const nextSchedule = remapBgmScheduleTrack(
					getBgmSchedule(audio),
					oldKey,
					bgmTrackKey(replacement),
					bgmTrackKeys(nextPlaylist),
				);
				await saveBgmLibrarySettings(nextPlaylist, nextSchedule);

				setBgmSchedule(audio, nextSchedule, nextPlaylist);
				const nextIndex = currentKey === oldKey
					? trackIndex
					: Math.max(0, nextPlaylist.findIndex(item => bgmTrackKey(item) === currentKey));
				setBgmPlaylist(audio, audio._bgmTrackTitle, nextPlaylist, nextIndex);
				if (wasPlaying) requestBgmPlay(audio).catch(() => setBgmPromptVisible(ensureBgmPrompt(audio.closest('.mini-player'), audio), true));

				let cleanupFailed = false;
				try {
					await deleteMediaIfUnreferenced(mediaId);
				} catch (error) {
					cleanupFailed = true;
					console.warn('Previous BGM cleanup failed:', cmsErrorMessage(error));
				}
				closeBgmTrimEditor(row, audio, false);
				openBgmScheduleEditor(audio, uploadButton, {
					replace: true,
					message: cleanupFailed
						? `“${track.title}” 교체 완료. 이전 파일 정리 여부는 확인하지 못했음.`
						: `“${track.title}”을 ${formatBgmDuration(result.duration_seconds || (region.end - region.start))} 길이로 교체 완료.`,
				});
			} catch (error) {
				if (newMediaId) await deleteMediaIfUnreferenced(newMediaId).catch(() => {});
				trimStatus.textContent = `교체 실패: ${cmsErrorMessage(error)}`;
				if (error.bgmRollbackFailed) trimStatus.textContent += ' · 설정 복구 상태 확인 필요';
				trimStatus.classList.add('is-error');
				setBgmScheduleEditorBusy(panel, false);
			}
		});
	} catch (error) {
		trimStatus.textContent = `파형 준비 실패: ${cmsErrorMessage(error)}`;
		trimStatus.classList.add('is-error');
	}

	editor.querySelector('[data-bgm-trim-close]')?.addEventListener('click', () => closeBgmTrimEditor(row, audio, true));
	row.scrollIntoView({ block: 'nearest' });
}

function removeBgmScheduleEditor(panel, audio) {
	const openTrimRow = panel.querySelector('[data-bgm-trim-row]:not([hidden])');
	if (openTrimRow) closeBgmTrimEditor(openTrimRow, audio, false);
	panel.remove();
}

function closeBgmTrimEditor(row, audio, restoreFocus) {
	const triggerIndex = row.dataset.bgmTrimRow;
	const shouldResume = row._bgmResumeMainAudio?.() === true;
	row._bgmWaveSurfer?.destroy();
	delete row._bgmWaveSurfer;
	delete row._bgmResumeMainAudio;
	row.hidden = true;
	row.querySelector('td')?.replaceChildren();
	if (shouldResume) requestBgmPlay(audio).catch(() => {});
	if (restoreFocus) row.closest('[data-bgm-schedule-editor]')?.querySelector(`[data-bgm-trim="${triggerIndex}"]`)?.focus();
}

function formatBgmDuration(value) {
	const total = Math.max(0, Number(value) || 0);
	const minutes = Math.floor(total / 60);
	const seconds = total - (minutes * 60);
	return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function collectBgmScheduleEditorValue(panel, audio, playlist) {
  const current = getBgmSchedule(audio);
  const slots = current.slots.map((slot, index) => {
    const label = panel.querySelector(`[data-bgm-slot-label="${slot.id}"]`)?.value.trim() || slot.label;
    const timeValue = panel.querySelector(`[data-bgm-slot-start="${slot.id}"]`)?.value || '00:00';
    const [hour, minute] = timeValue.split(':').map(Number);
    return {
      id: slot.id,
      label,
      startMinute: index === 0 ? 0 : (hour * 60) + minute,
    };
  });

  if (slots.some((slot, index) => index > 0 && slot.startMinute <= slots[index - 1].startMinute)) {
    throw new Error('시간대 시작 시각은 앞 시간대보다 늦어야 함.');
  }

  const assignments = {};
  playlist.forEach((track, trackIndex) => {
    assignments[bgmTrackKey(track)] = slots
      .filter(slot => panel.querySelector(`[data-bgm-assignment][data-track-index="${trackIndex}"][data-slot-id="${slot.id}"]`)?.checked)
      .map(slot => slot.id);
  });

  return normalizeBgmSchedule({ version: 1, timezone: BGM_TIME_ZONE, slots, assignments }, bgmTrackKeys(playlist));
}

function setBgmScheduleEditorDirty(panel, isDirty) {
  panel.dataset.bgmEditorDirty = isDirty ? 'true' : 'false';
  panel.setAttribute('data-version-refresh-block', isDirty ? 'true' : 'false');
}

function setBgmScheduleEditorBusy(panel, isBusy) {
  if (!panel) return;
  panel.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  panel.querySelectorAll('button, input').forEach(control => {
    if (isBusy) {
      control.dataset.bgmWasDisabled = control.disabled ? 'true' : 'false';
      control.disabled = true;
      return;
    }

    control.disabled = control.dataset.bgmWasDisabled === 'true';
    delete control.dataset.bgmWasDisabled;
  });
}

function isBgmScheduleEditorDirty(panel) {
  return panel?.dataset.bgmEditorDirty === 'true';
}
function isMp3(file) {
  return file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name);
}
function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function mountBgmOwnerTools(audio, trackTitle) {
  if (!isLoggedIn() || document.querySelector('.sk-owner-music')) return;
  const host = document.querySelector('.sk-music-dock');
  if (!host) return;
  const controls = document.createElement('details');
  controls.className = 'sk-owner-music';
  controls.innerHTML = '<summary>음악 관리</summary>';
  host.append(controls);
  initBgmOwnerTools(controls, audio, trackTitle);
}
window.addEventListener('beforeunload', event => {
  if (!document.querySelector('[data-bgm-schedule-editor][data-bgm-editor-dirty="true"]')) return;
  event.preventDefault(); event.returnValue = '';
});
