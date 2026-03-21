const els = {
  focusBtn: document.getElementById('focusBtn'),
  shortBreakBtn: document.getElementById('shortBreakBtn'),
  longBreakBtn: document.getElementById('longBreakBtn'),
  time: document.getElementById('time'),
  modeLabel: document.getElementById('modeLabel'),
  ringFill: document.getElementById('ringFill'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  focusMinutes: document.getElementById('focusMinutes'),
  shortBreakMinutes: document.getElementById('shortBreakMinutes'),
  longBreakMinutes: document.getElementById('longBreakMinutes'),
  applyBtn: document.getElementById('applyBtn'),
  status: document.getElementById('status'),
  cycleCount: document.getElementById('cycleCount'),
  nextPhase: document.getElementById('nextPhase')
};

const COLOURS = {
  emerald: '#10B981',
  coral: '#EF4444'
};

const RING_CIRC = 2 * Math.PI * 85;

let pollTimer = null;
let lastCompletionEventId = null;
let uiState = null;

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => resolve(res || { ok: false }));
  });
}

function formatMs(ms) {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function materialise(state) {
  if (!state || !state.isRunning || !state.endTs) return state;
  const rem = Math.max(0, state.endTs - Date.now());
  if (rem <= 0) return { ...state, isRunning: false, endTs: null, timeLeftMs: 0 };
  return { ...state, timeLeftMs: rem };
}

function modeLabel(mode) {
  if (mode === 'shortBreak') return 'Short break';
  if (mode === 'longBreak') return 'Long break';
  return 'Focus';
}

function totalModeMs(state) {
  if (state.mode === 'focus') return state.focusMinutes * 60 * 1000;
  if (state.mode === 'shortBreak') return state.shortBreakMinutes * 60 * 1000;
  return state.longBreakMinutes * 60 * 1000;
}

function nextPhaseLabel(state) {
  if (state.mode === 'focus') {
    const next = (state.completedFocusCount + 1) % 4 === 0 ? 'long break' : 'short break';
    return `Next: ${next}`;
  }
  return 'Next: focus';
}

function updateModeButtons(mode) {
  els.focusBtn.classList.toggle('active', mode === 'focus');
  els.shortBreakBtn.classList.toggle('active', mode === 'shortBreak');
  els.longBreakBtn.classList.toggle('active', mode === 'longBreak');
}

function setVisualState(s) {
  const secsLeft = Math.ceil(Number(s.timeLeftMs || 0) / 1000);
  const isUrgent = s.isRunning && secsLeft <= 60;
  const isPaused = !s.isRunning;
  const colour = (isUrgent || isPaused) ? COLOURS.coral : COLOURS.emerald;

  els.time.style.color = colour;
  els.ringFill.style.stroke = colour;
  els.time.classList.toggle('running', !!s.isRunning);
}

function setRingProgress(s) {
  const total = Math.max(1, totalModeMs(s));
  const remain = Math.max(0, Math.min(total, Number(s.timeLeftMs || 0)));
  const progress = 1 - (remain / total);
  const offset = RING_CIRC * (1 - progress);
  els.ringFill.style.strokeDasharray = `${RING_CIRC}`;
  els.ringFill.style.strokeDashoffset = `${offset}`;
}

function pulseSessionCounter() {
  els.cycleCount.classList.remove('pulse');
  // force reflow so repeated completion can animate
  // eslint-disable-next-line no-unused-expressions
  els.cycleCount.offsetWidth;
  els.cycleCount.classList.add('pulse');
}

function render(state) {
  const s = materialise(state);
  if (!s) return;

  uiState = s;
  els.time.textContent = formatMs(s.timeLeftMs);
  els.modeLabel.textContent = modeLabel(s.mode);

  updateModeButtons(s.mode);
  setVisualState(s);
  setRingProgress(s);

  els.startBtn.disabled = !!s.isRunning;
  els.pauseBtn.disabled = !s.isRunning;

  els.status.textContent = `Mode: ${s.mode === 'focus' ? 'focus' : (s.mode === 'shortBreak' ? 'short break' : 'long break')} | ${s.isRunning ? 'Running' : 'Paused'}`;
  els.cycleCount.textContent = `Completed focus sessions: ${s.completedFocusCount}`;
  els.nextPhase.textContent = nextPhaseLabel(s);

  if (document.activeElement !== els.focusMinutes) {
    els.focusMinutes.value = String(s.focusMinutes);
  }
  if (document.activeElement !== els.shortBreakMinutes) {
    els.shortBreakMinutes.value = String(s.shortBreakMinutes);
  }
  if (document.activeElement !== els.longBreakMinutes) {
    els.longBreakMinutes.value = String(s.longBreakMinutes);
  }
}

function playCompletionBleep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 180);
  } catch (_) {
    // ignore audio failures
  }
}

async function refresh() {
  const res = await send('getState');
  if (!res?.ok || !res.state) return;

  const state = res.state;
  if (lastCompletionEventId === null) {
    lastCompletionEventId = state.completionEventId;
  } else if (state.completionEventId !== lastCompletionEventId) {
    const lastMode = state.lastCompletedMode;
    lastCompletionEventId = state.completionEventId;
    playCompletionBleep();
    if (lastMode === 'focus') {
      pulseSessionCounter();
    }
  }

  render(state);
}

function clampInput(id, min, max, fallback) {
  const raw = Number(els[id].value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

async function applyDurations() {
  const focusMinutes = clampInput('focusMinutes', 1, 120, 20);
  const shortBreakMinutes = clampInput('shortBreakMinutes', 1, 60, 5);
  const longBreakMinutes = clampInput('longBreakMinutes', 5, 120, 15);

  const res = await send('setDurations', {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes
  });
  if (res?.ok) render(res.state);
}

function bind() {
  els.focusBtn.addEventListener('click', async () => {
    const res = await send('setMode', { mode: 'focus' });
    if (res?.ok) render(res.state);
  });

  els.shortBreakBtn.addEventListener('click', async () => {
    const res = await send('setMode', { mode: 'shortBreak' });
    if (res?.ok) render(res.state);
  });

  els.longBreakBtn.addEventListener('click', async () => {
    const res = await send('setMode', { mode: 'longBreak' });
    if (res?.ok) render(res.state);
  });

  els.startBtn.addEventListener('click', async () => {
    const res = await send('start');
    if (res?.ok) render(res.state);
  });

  els.pauseBtn.addEventListener('click', async () => {
    const res = await send('pause');
    if (res?.ok) render(res.state);
  });

  els.resetBtn.addEventListener('click', async () => {
    const res = await send('reset');
    if (res?.ok) render(res.state);
  });

  els.applyBtn.addEventListener('click', applyDurations);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 1000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

window.addEventListener('unload', stopPolling);

(async function init() {
  bind();
  await refresh();
  startPolling();
})();
