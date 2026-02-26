let timeLeft = 20 * 60; // 20 minutes in seconds
let timer;
let isRunning = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        startTimer();
    } else if (request.action === "pause") {
        pauseTimer();
    } else if (request.action === "reset") {
        resetTimer();
    } else if (request.action === "getStatus") {
        sendResponse({ timeLeft, isRunning });
    }
});

function startTimer() {
    if (!isRunning) {
        isRunning = true;
        timer = setInterval(() => {
            timeLeft--;
            updateBadgeTime();
            saveState();
            if (timeLeft <= 0) {
                clearInterval(timer);
                resetTimer();
                chrome.notifications.create('pomodoro', {
                    type: 'basic',
                    iconUrl: 'icon.png',
                    title: 'Pomodoro Timer',
                    message: "Time's up!",
                });
            }
        }, 1000);
    }
}

function pauseTimer() {
    clearInterval(timer);
    isRunning = false;
    saveState();
}

function resetTimer() {
    clearInterval(timer);
    timeLeft = 20 * 60;
    isRunning = false;
    updateBadgeTime();
    saveState();
}

function updateBadgeTime() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    chrome.action.setBadgeText({ text: timeString });
    chrome.action.setBadgeBackgroundColor({ color: "#FF4500" });
    chrome.action.setBadgeTextColor({ color: "#FFFFFF" });  // Set text color to white
}

function saveState() {
    chrome.storage.local.set({ timeLeft, isRunning });
}

function loadState() {
    chrome.storage.local.get(['timeLeft', 'isRunning'], (result) => {
        timeLeft = result.timeLeft || 20 * 60;
        isRunning = result.isRunning || false;
        updateBadgeTime();
        if (isRunning) {
            startTimer();
        }
    });
}

loadState();
