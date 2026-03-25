const STATE_KEY = 'pomodoroState';
const ALARM_NAME = 'pomodoro_tick';
const STATE_VERSION = 2;

const DEFAULTS = {
  stateVersion: STATE_VERSION,
  mode: 'focus', // focus | shortBreak | longBreak
  isRunning: false,
  startedAt: null,
  endTs: null,
  timeLeftMs: 20 * 60 * 1000,
  focusMinutes: 20,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  completedFocusCount: 0,
  lastCompletedMode: null,
  completionEventId: 0,
  showDoneUntil: 0
};

function clamp(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function migrateState(raw) {
  const input = isObject(raw) ? { ...raw } : {};
  const version = Number(input.stateVersion || 1);

  // v1 -> v2 migrations can be added here.
  if (version < 2) {
    input.stateVersion = 2;
    if (!Number.isFinite(Number(input.showDoneUntil))) input.showDoneUntil = 0;
  }

  return input;
}

function durationMsForMode(state, mode = state.mode) {
  if (mode === 'focus') return state.focusMinutes * 60 * 1000;
  if (mode === 'shortBreak') return state.shortBreakMinutes * 60 * 1000;
  return state.longBreakMinutes * 60 * 1000;
}

async function loadState() {
  const data = await chrome.storage.local.get(STATE_KEY);
  const migrated = migrateState(data[STATE_KEY] || {});
  const merged = { ...DEFAULTS, ...migrated };

  merged.stateVersion = STATE_VERSION;
  merged.focusMinutes = clamp(merged.focusMinutes, 1, 120, DEFAULTS.focusMinutes);
  merged.shortBreakMinutes = clamp(merged.shortBreakMinutes, 1, 60, DEFAULTS.shortBreakMinutes);
  merged.longBreakMinutes = clamp(merged.longBreakMinutes, 5, 120, DEFAULTS.longBreakMinutes);
  merged.completedFocusCount = clamp(merged.completedFocusCount, 0, 1000, 0);
  merged.timeLeftMs = Math.max(0, Number(merged.timeLeftMs || 0));
  merged.mode = ['focus', 'shortBreak', 'longBreak'].includes(merged.mode) ? merged.mode : 'focus';
  merged.isRunning = !!merged.isRunning;
  merged.startedAt = Number.isFinite(Number(merged.startedAt)) ? Number(merged.startedAt) : null;
  merged.endTs = Number.isFinite(Number(merged.endTs)) ? Number(merged.endTs) : null;
  merged.lastCompletedMode = ['focus', 'shortBreak', 'longBreak', null].includes(merged.lastCompletedMode)
    ? merged.lastCompletedMode
    : null;
  merged.completionEventId = clamp(merged.completionEventId, 0, 1_000_000, 0);
  merged.showDoneUntil = Number.isFinite(Number(merged.showDoneUntil)) ? Number(merged.showDoneUntil) : 0;

  return merged;
}

async function saveState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

function isTimerExpired(state, now = Date.now()) {
  return Number.isFinite(Number(state?.endTs)) && Number(state.endTs) > 0 && now >= Number(state.endTs);
}

function materialiseState(state, now = Date.now()) {
  const next = { ...state };

  if (next.isRunning && next.endTs) {
    // Derive remaining time from wall-clock to avoid drift.
    // Do not flip isRunning here. Completion handling belongs in tick().
    next.timeLeftMs = Math.max(0, next.endTs - now);
  }

  return next;
}

function modeBadgePrefix(mode) {
  if (mode === 'focus') return 'F';
  if (mode === 'shortBreak') return 'B';
  return 'L';
}

function getBadgePresentation(state, now = Date.now()) {
  const mode = state.mode;
  const focusColor = '#343a40';
  const breakColor = '#2E8B57';
  const color = mode === 'focus' ? focusColor : breakColor;

  if (state.showDoneUntil && now < state.showDoneUntil) {
    return { text: 'DONE', color: '#1f6feb' };
  }

  if (!state.isRunning) {
    return { text: '||', color };
  }

  const mins = Math.max(0, Math.ceil(state.timeLeftMs / 60000));
  const compact = `${modeBadgePrefix(mode)}${Math.min(99, mins)}`;
  return { text: compact.slice(0, 4), color };
}

async function setBadge(state) {
  const badge = getBadgePresentation(state);
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setBadgeText({ text: badge.text });
}

async function clearTimerAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
}

function computeNextMode(state) {
  if (state.mode === 'focus') {
    const nextCount = state.completedFocusCount + 1;
    return nextCount % 4 === 0 ? 'longBreak' : 'shortBreak';
  }
  return 'focus';
}

async function ensureAlarmForRunningTimer() {
  let state = await loadState();
  const now = Date.now();

  // Prevent stale running state from surviving restart without completion handling.
  if (state.isRunning && isTimerExpired(state, now)) {
    state = await completeAndAdvance(state, now);
  } else {
    state = materialiseState(state, now);
  }

  const alarm = await chrome.alarms.get(ALARM_NAME);

  if (state.isRunning) {
    if (!alarm) {
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
    }
  } else if (alarm) {
    await clearTimerAlarm();
  }

  await saveState(state);
  await setBadge(state);
}

async function notifyCompletion(state) {
  const label = state.lastCompletedMode === 'focus' ? 'Focus' : (state.lastCompletedMode === 'longBreak' ? 'Long break' : 'Break');
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Pomodoro Timer',
    message: `${label} session complete`
  });
}

async function completeAndAdvance(state, now = Date.now()) {
  const completedMode = state.mode;

  if (completedMode === 'focus') {
    state.completedFocusCount += 1;
  } else if (completedMode === 'longBreak') {
    state.completedFocusCount = 0;
  }

  const nextMode = computeNextMode(state);

  state.lastCompletedMode = completedMode;
  state.mode = nextMode;
  state.isRunning = false;
  state.startedAt = null;
  state.endTs = null;
  state.timeLeftMs = durationMsForMode(state, nextMode);
  state.completionEventId = (state.completionEventId || 0) + 1;
  state.showDoneUntil = now + 5000;

  await clearTimerAlarm();
  await notifyCompletion(state);
  await saveState(state);
  await setBadge(state);

  return state;
}

async function tick() {
  const rawState = await loadState();
  const now = Date.now();
  const expired = isTimerExpired(rawState, now);

  if (expired) {
    // Completion is handled exactly once because completeAndAdvance clears endTs and isRunning.
    return await completeAndAdvance(rawState, now);
  }

  const state = materialiseState(rawState, now);
  await saveState(state);
  await setBadge(state);
  return state;
}

async function startTimer() {
  let state = materialiseState(await loadState());
  if (state.isRunning) return state;

  if (state.timeLeftMs <= 0) {
    state.timeLeftMs = durationMsForMode(state);
  }

  const now = Date.now();
  state.isRunning = true;
  state.startedAt = now;
  state.endTs = now + state.timeLeftMs;

  await saveState(state);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await setBadge(state);
  return state;
}

async function pauseTimer() {
  let state = materialiseState(await loadState());
  state.isRunning = false;
  state.startedAt = null;
  state.endTs = null;

  await saveState(state);
  await clearTimerAlarm();
  await setBadge(state);
  return state;
}

async function resetTimer() {
  let state = await loadState();
  state.isRunning = false;
  state.startedAt = null;
  state.endTs = null;
  state.timeLeftMs = durationMsForMode(state);

  await saveState(state);
  await clearTimerAlarm();
  await setBadge(state);
  return state;
}

async function setMode(mode) {
  let state = await loadState();
  const nextMode = ['focus', 'shortBreak', 'longBreak'].includes(mode) ? mode : 'focus';

  state.mode = nextMode;
  state.isRunning = false;
  state.startedAt = null;
  state.endTs = null;
  state.timeLeftMs = durationMsForMode(state, nextMode);

  await saveState(state);
  await clearTimerAlarm();
  await setBadge(state);
  return state;
}

async function setDurations(payload) {
  const state = await loadState();
  state.focusMinutes = clamp(payload.focusMinutes, 1, 120, state.focusMinutes);
  state.shortBreakMinutes = clamp(payload.shortBreakMinutes, 1, 60, state.shortBreakMinutes);
  state.longBreakMinutes = clamp(payload.longBreakMinutes, 5, 120, state.longBreakMinutes);

  if (!state.isRunning) {
    state.timeLeftMs = durationMsForMode(state);
  }

  await saveState(state);
  await setBadge(materialiseState(state));
  return state;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await tick();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarmForRunningTimer();
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarmForRunningTimer();
});

(async () => {
  await ensureAlarmForRunningTimer();
})();

function validateMessage(msg) {
  if (!isObject(msg)) return { ok: false, error: 'invalid_message' };
  const type = typeof msg.type === 'string' ? msg.type : '';

  if (type === 'getState' || type === 'start' || type === 'pause' || type === 'reset') {
    return { ok: true, type, payload: {} };
  }

  if (type === 'setMode') {
    const mode = typeof msg.mode === 'string' ? msg.mode : '';
    if (!['focus', 'shortBreak', 'longBreak'].includes(mode)) {
      return { ok: false, error: 'invalid_mode' };
    }
    return { ok: true, type, payload: { mode } };
  }

  if (type === 'setDurations') {
    const focusMinutes = clamp(msg.focusMinutes, 1, 120, NaN);
    const shortBreakMinutes = clamp(msg.shortBreakMinutes, 1, 60, NaN);
    const longBreakMinutes = clamp(msg.longBreakMinutes, 5, 120, NaN);

    if (![focusMinutes, shortBreakMinutes, longBreakMinutes].every((v) => Number.isFinite(v))) {
      return { ok: false, error: 'invalid_durations' };
    }

    return {
      ok: true,
      type,
      payload: { focusMinutes, shortBreakMinutes, longBreakMinutes }
    };
  }

  return { ok: false, error: 'unknown_message' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const validated = validateMessage(msg);
    if (!validated.ok) {
      sendResponse({ ok: false, error: validated.error });
      return;
    }

    const { type, payload } = validated;

    switch (type) {
      case 'getState': {
        const state = materialiseState(await loadState());
        await saveState(state);
        await setBadge(state);
        sendResponse({ ok: true, state });
        break;
      }
      case 'start':
        sendResponse({ ok: true, state: await startTimer() });
        break;
      case 'pause':
        sendResponse({ ok: true, state: await pauseTimer() });
        break;
      case 'reset':
        sendResponse({ ok: true, state: await resetTimer() });
        break;
      case 'setMode':
        sendResponse({ ok: true, state: await setMode(payload.mode) });
        break;
      case 'setDurations':
        sendResponse({ ok: true, state: await setDurations(payload) });
        break;
      default:
        sendResponse({ ok: false, error: 'unknown_message' });
    }
  })();
  return true;
});
