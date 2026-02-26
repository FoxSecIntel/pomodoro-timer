const timeDisplay = document.getElementById('time');
const statusDisplay = document.getElementById('status');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');
const focusModeButton = document.getElementById('focusMode');
const breakModeButton = document.getElementById('breakMode');
const applyFocusButton = document.getElementById('applyFocus');
const focusInput = document.getElementById('focusMinutes');

let pollHandle = null;

function formatTime(sec) {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function updateDisplay(state) {
  const timeLeft = Number(state.timeLeft || 0);
  timeDisplay.textContent = formatTime(timeLeft);

  const isRunning = Boolean(state.isRunning);
  const mode = state.mode || 'focus';

  startButton.disabled = isRunning;
  pauseButton.disabled = !isRunning;

  statusDisplay.textContent = `Mode: ${mode} | ${isRunning ? 'Running' : 'Paused'}`;
}

function safeSend(message, callback) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      statusDisplay.textContent = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (typeof callback === 'function') callback(response);
  });
}

function getState() {
  safeSend({ action: 'getStatus' }, (response) => {
    if (!response) {
      statusDisplay.textContent = 'No response from timer service';
      return;
    }
    updateDisplay(response);
  });
}

startButton.addEventListener('click', () => {
  safeSend({ action: 'start' }, getState);
});

pauseButton.addEventListener('click', () => {
  safeSend({ action: 'pause' }, getState);
});

resetButton.addEventListener('click', () => {
  safeSend({ action: 'reset' }, getState);
});

focusModeButton.addEventListener('click', () => {
  safeSend({ action: 'setMode', mode: 'focus' }, getState);
});

breakModeButton.addEventListener('click', () => {
  safeSend({ action: 'setMode', mode: 'break' }, getState);
});

applyFocusButton.addEventListener('click', () => {
  const minutes = Number(focusInput.value || 20);
  safeSend({ action: 'setFocusMinutes', minutes }, getState);
});

document.addEventListener('DOMContentLoaded', () => {
  getState();
  pollHandle = setInterval(getState, 1000);
});

window.addEventListener('unload', () => {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
});
