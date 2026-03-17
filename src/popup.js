const focusBtn = document.getElementById('focusBtn');
const breakBtn = document.getElementById('breakBtn');
const timeDisplay = document.getElementById('time');
const startButton = document.getElementById('startBtn');
const pauseButton = document.getElementById('pauseBtn');
const resetButton = document.getElementById('resetBtn');
const focusMinutesInput = document.getElementById('focusMinutes');
const applyButton = document.getElementById('applyBtn');
const statusDisplay = document.getElementById('status');

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
  if (rem <= 0) {
    return { ...state, isRunning: false, endTs: null, timeLeft: 0 };
  }
  return { ...state, timeLeft: rem };
}

function updateDisplay(state) {
  const s = materialise(state);
  if (!s) return;

  timeDisplay.textContent = formatTime(s.timeLeft);
  timeDisplay.style.color = s.mode === 'break' ? '#2E8B57' : '#343a40';

  startButton.disabled = !!s.isRunning;
  pauseButton.disabled = !s.isRunning;

  focusBtn.classList.toggle('active', s.mode === 'focus');
  breakBtn.classList.toggle('active', s.mode === 'break');

  statusDisplay.textContent = `Mode: ${s.mode} | ${s.isRunning ? 'Running' : 'Paused'}`;
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
  if (focusMinutesInput) {
    focusMinutesInput.value = String(uiState.focusMinutes || 20);
  }
  updateDisplay(uiState);
}

async function init() {
  focusBtn?.addEventListener('click', async () => {
    const res = await send('setMode', { mode: 'focus' });
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  breakBtn?.addEventListener('click', async () => {
    const res = await send('setMode', { mode: 'break' });
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  startButton?.addEventListener('click', async () => {
    const res = await send('start');
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  pauseButton?.addEventListener('click', async () => {
    const res = await send('pause');
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  resetButton?.addEventListener('click', async () => {
    const res = await send('reset');
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  applyButton?.addEventListener('click', async () => {
    const mins = Number(focusMinutesInput?.value || 20);
    const res = await send('setFocusMinutes', { minutes: mins });
    if (res?.ok) {
      uiState = res.state;
      updateDisplay(uiState);
    }
  });

  await refreshStatus();
  startUiTicker();
}

init();
