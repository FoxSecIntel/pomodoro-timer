const STATE_KEY = 'pomodoroState';
const ALARM_TICK = 'pomodoro_tick';

const DEFAULT_STATE = {
  mode: 'focus',
  isRunning: false,
  focusMinutes: 20,
  breakMinutes: 5,
  timeLeft: 20 * 60,
  endTs: null
};

function modeSeconds(state) {
  return (state.mode === 'break' ? state.breakMinutes : state.focusMinutes) * 60;
}

function formatBadge(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

async function getState() {
  const saved = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(saved[STATE_KEY] || {}) };
}

async function setState(next) {
  await chrome.storage.local.set({ [STATE_KEY]: next });
}

function materialiseState(state) {
  if (!state.isRunning || !state.endTs) {
    return state;
  }
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((state.endTs - now) / 1000));
  if (remaining <= 0) {
    return {
      ...state,
      isRunning: false,
      timeLeft: 0,
      endTs: null
    };
  }
  return { ...state, timeLeft: remaining };
}

async function setBadge(state) {
  const text = formatBadge(state.timeLeft);
  await chrome.action.setBadgeText({ text });
  const color = state.mode === 'break' ? '#2E8B57' : '#343a40';
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function tick() {
  let state = await getState();
  state = materialiseState(state);

  // Completion event
  if (!state.isRunning && state.timeLeft === 0) {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Pomodoro Timer',
        message: `${state.mode === 'focus' ? 'Focus' : 'Break'} session complete.`
      });
    } catch (_) {
      // ignore
    }

    // Auto-reset to mode default after completion.
    state.timeLeft = modeSeconds(state);
  }

  await setState(state);
  await setBadge(state);
}

async function startTimer() {
  let state = await getState();
  state = materialiseState(state);
  if (state.isRunning) return state;

  state.isRunning = true;
  state.endTs = Date.now() + (Math.max(1, state.timeLeft) * 1000);
  await setState(state);
  await setBadge(state);

  await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 0.1 });
  return state;
}

async function pauseTimer() {
  let state = await getState();
  state = materialiseState(state);
  state.isRunning = false;
  state.endTs = null;
  await setState(state);
  await setBadge(state);
  await chrome.alarms.clear(ALARM_TICK);
  return state;
}

async function resetTimer() {
  let state = await getState();
  state.isRunning = false;
  state.endTs = null;
  state.timeLeft = modeSeconds(state);
  await setState(state);
  await setBadge(state);
  await chrome.alarms.clear(ALARM_TICK);
  return state;
}

async function setMode(mode) {
  let state = await getState();
  state.mode = mode === 'break' ? 'break' : 'focus';
  state.isRunning = false;
  state.endTs = null;
  state.timeLeft = modeSeconds(state);
  await setState(state);
  await setBadge(state);
  await chrome.alarms.clear(ALARM_TICK);
  return state;
}

async function setFocusMinutes(minutes) {
  let state = await getState();
  const m = Math.min(120, Math.max(1, Number(minutes) || 20));
  state.focusMinutes = m;
  if (state.mode === 'focus' && !state.isRunning) {
    state.timeLeft = m * 60;
  }
  await setState(state);
  await setBadge(materialiseState(state));
  return state;
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState(state);
  await setBadge(state);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_TICK) return;
  await tick();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'getStatus': {
        const state = materialiseState(await getState());
        await setState(state);
        await setBadge(state);
        sendResponse({ ok: true, state });
        return;
      }
      case 'start':
        sendResponse({ ok: true, state: await startTimer() });
        return;
      case 'pause':
        sendResponse({ ok: true, state: await pauseTimer() });
        return;
      case 'reset':
        sendResponse({ ok: true, state: await resetTimer() });
        return;
      case 'setMode':
        sendResponse({ ok: true, state: await setMode(msg.mode) });
        return;
      case 'setFocusMinutes':
        sendResponse({ ok: true, state: await setFocusMinutes(msg.minutes) });
        return;
      default:
        sendResponse({ ok: false, error: 'unknown_message' });
    }
  })();
  return true;
});
