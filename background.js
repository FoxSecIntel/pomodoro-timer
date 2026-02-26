const DEFAULT_FOCUS_MIN = 20;
const DEFAULT_BREAK_MIN = 5;

let state = {
  mode: 'focus', // focus | break
  durationSec: DEFAULT_FOCUS_MIN * 60,
  remainingSec: DEFAULT_FOCUS_MIN * 60,
  isRunning: false,
  endTs: null,
};

function nowMs() {
  return Date.now();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatBadge(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function getModeColor(mode) {
  return mode === 'break' ? '#2E8B57' : '#FF4500';
}

function updateBadge() {
  chrome.action.setBadgeText({ text: formatBadge(state.remainingSec) });
  chrome.action.setBadgeBackgroundColor({ color: getModeColor(state.mode) });
  chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
}

function saveState() {
  chrome.storage.local.set({ pomodoroState: state });
}

function computeRemaining() {
  if (!state.isRunning || !state.endTs) return;
  const rem = Math.ceil((state.endTs - nowMs()) / 1000);
  state.remainingSec = clamp(rem, 0, state.durationSec);
}

function scheduleTick() {
  chrome.alarms.create('pomodoro-tick', { periodInMinutes: 1 / 60 }); // ~1s tick
}

function cancelTick() {
  chrome.alarms.clear('pomodoro-tick');
}

function startTimer() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.endTs = nowMs() + state.remainingSec * 1000;
  scheduleTick();
  updateBadge();
  saveState();
}

function pauseTimer() {
  if (!state.isRunning) return;
  computeRemaining();
  state.isRunning = false;
  state.endTs = null;
  cancelTick();
  updateBadge();
  saveState();
}

function setMode(mode) {
  if (!['focus', 'break'].includes(mode)) return;
  state.mode = mode;
  const mins = mode === 'break' ? DEFAULT_BREAK_MIN : DEFAULT_FOCUS_MIN;
  state.durationSec = mins * 60;
  state.remainingSec = state.durationSec;
  state.isRunning = false;
  state.endTs = null;
  cancelTick();
  updateBadge();
  saveState();
}

function setFocusMinutes(minutes) {
  const m = clamp(Number(minutes) || DEFAULT_FOCUS_MIN, 1, 120);
  state.mode = 'focus';
  state.durationSec = m * 60;
  state.remainingSec = state.durationSec;
  state.isRunning = false;
  state.endTs = null;
  cancelTick();
  updateBadge();
  saveState();
}

function resetTimer() {
  const mins = state.mode === 'break' ? DEFAULT_BREAK_MIN : DEFAULT_FOCUS_MIN;
  state.durationSec = mins * 60;
  state.remainingSec = state.durationSec;
  state.isRunning = false;
  state.endTs = null;
  cancelTick();
  updateBadge();
  saveState();
}

function timerFinished() {
  state.isRunning = false;
  state.endTs = null;
  cancelTick();
  state.remainingSec = 0;
  updateBadge();
  saveState();

  chrome.notifications.create('pomodoro', {
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Pomodoro Timer',
    message: state.mode === 'focus' ? "Focus session complete" : 'Break complete',
  });
}

function loadState() {
  chrome.storage.local.get(['pomodoroState'], (result) => {
    if (result.pomodoroState) {
      state = { ...state, ...result.pomodoroState };
    }

    if (state.isRunning && state.endTs) {
      computeRemaining();
      if (state.remainingSec <= 0) {
        timerFinished();
      } else {
        scheduleTick();
      }
    }

    updateBadge();
    saveState();
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    startTimer();
    sendResponse({ ok: true });
  } else if (request.action === 'pause') {
    pauseTimer();
    sendResponse({ ok: true });
  } else if (request.action === 'reset') {
    resetTimer();
    sendResponse({ ok: true });
  } else if (request.action === 'setMode') {
    setMode(request.mode);
    sendResponse({ ok: true });
  } else if (request.action === 'setFocusMinutes') {
    setFocusMinutes(request.minutes);
    sendResponse({ ok: true });
  } else if (request.action === 'getStatus') {
    computeRemaining();
    if (state.isRunning && state.remainingSec <= 0) {
      timerFinished();
    }
    sendResponse({
      timeLeft: state.remainingSec,
      isRunning: state.isRunning,
      mode: state.mode,
      durationSec: state.durationSec,
    });
  }
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'pomodoro-tick') return;
  if (!state.isRunning) return;

  computeRemaining();
  if (state.remainingSec <= 0) {
    timerFinished();
  } else {
    updateBadge();
    saveState();
  }
});

loadState();
