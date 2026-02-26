const timeDisplay = document.getElementById('time');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');

let isRunning = false;

// Update the time display in the popup
function updateDisplay(timeLeft) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timeDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Request the current state from the background script
function getState() {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
        updateDisplay(response.timeLeft);
        isRunning = response.isRunning;
        startButton.disabled = isRunning;
        pauseButton.disabled = !isRunning;
    });
}

// Handle Start button click
startButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "start" });
    startButton.disabled = true;
    pauseButton.disabled = false;
});

// Handle Pause button click
pauseButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "pause" });
    startButton.disabled = false;
    pauseButton.disabled = true;
});

// Handle Reset button click
resetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "reset" });
    startButton.disabled = false;
    pauseButton.disabled = true;
    getState();
});

// Periodically update the display while the popup is open
setInterval(getState, 1000);

// Load the initial state when the popup is opened
getState();
