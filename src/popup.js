function pick(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

const focusBtn = pick('focusBtn', 'focus');
const breakBtn = pick('breakBtn', 'break');
const timeDisplay = pick('time', 'timer', 'countdown');
const startButton = pick('startBtn', 'start');
const pauseButton = pick('pauseBtn', 'pause');
const resetButton = pick('resetBtn', 'reset');
const focusMinutesInput = pick('focusMinutes', 'focusMin', 'focus');
const applyButton = pick('applyBtn', 'apply');
const statusDisplay = pick('status', 'modeStatus');

let uiState = null;
let uiTicker = null;

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => resolve(res || { ok: false }));
  });
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function materialise(state) {
  if (!state || !state.isRunning || !state.endTs) return state;
  const rem = Math.max(0, Math.ceil((state.endTs - Date.now()) / 1000));
  if (rem <= 0) return { ...state, isRunning: false, endTs: null, timeLeft: 0 };
  return { ...state, timeLeft: rem };
}

function updateDisplay(state) {
  const s = materialise(state);
  if (!s) return;

  if (timeDisplay) {
    timeDisplay.textContent = formatTime(s.timeLeft);
    timeDisplay.style.color = s.mode === 'break' ? '#2E8B57' : '#343a40';
  }

  if (startButton) startButton.disabled = !!s.isRunning;
  if (pauseButton) pauseButton.disabled = !s.isRunning;

  if (focusBtn) focusBtn.classList.toggle('active', s.mode === 'focus');
  if (breakBtn) breakBtn.classList.toggle('active', s.mode === 'break');

  if (statusDisplay) {
    statusDisplay.textContent = `Mode: ${s.mode} | ${s.isRunning ? 'Running' : 'Paused'}`;
  }
}

function startUiTicker() {
  if (uiTicker) clearInterval(uiTicker);
  uiTicker = setInterval(() => {
    if (!uiState) return;
    uiState = materialise(uiState);
    updateDisplay(uiState);
  }, 1000);
}

async function refreshStatus() {
  const res = await send('getStatus');
  if (!res?.ok) return;
  uiState = res.state;
  if (focusMinutesInput) focusMinutesInput.value = String(uiState.focusMinutes || 20);
  updateDisplay(uiState);
}

async function init() {
  if (focusBtn) {
    focusBtn.addEventListener('click', async () => {
      const res = await send('setMode', { mode: 'focus' });
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  if (breakBtn) {
    breakBtn.addEventListener('click', async () => {
      const res = await send('setMode', { mode: 'break' });
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  if (startButton) {
    startButton.addEventListener('click', async () => {
      const res = await send('start');
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener('click', async () => {
      const res = await send('pause');
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      const res = await send('reset');
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  if (applyButton) {
    applyButton.addEventListener('click', async () => {
      const mins = Number(focusMinutesInput?.value || 20);
      const res = await send('setFocusMinutes', { minutes: mins });
      if (res?.ok) {
        uiState = res.state;
        updateDisplay(uiState);
      }
    });
  }

  await refreshStatus();
  startUiTicker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
