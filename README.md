# Pomodoro Timer (Chrome Extension)

A fast, reliable Pomodoro timer for Chrome that helps you ship work in focused sprints.

Think less timer admin, more deep work.

## Install

### Option 1: Chrome Web Store

Install directly from:
https://chromewebstore.google.com/detail/pomodoro-timer/geibgkighpdnoioegfhmkffoohkdnmdd

### Option 2: Load unpacked (developer)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder

## Features

- Start, pause, and reset controls
- Focus mode and break mode
- Custom focus length (1 to 120 minutes)
- Live badge countdown on extension icon
- Completion notification when time is up
- State persistence when popup is closed and reopened

## Why this implementation is reliable (MV3-safe)

Manifest V3 service workers can suspend, so naïve `setInterval` timers drift or stop.

This extension uses a resilient model:

- Running sessions store an absolute `endTs` timestamp
- Remaining time is recomputed from `Date.now()`
- `chrome.alarms` drives wake-ups and completion checks

Result: stable countdown behaviour even with service worker lifecycle events.

## Usage flow

1. Pick mode (`Focus` or `Break`)
2. Optionally set custom focus minutes
3. Press `Start`
4. Keep working while the badge tracks remaining time
5. Get a completion notification

## Project files

- `manifest.json`
- `background.js`
- `popup.html`
- `popup.js`
- `icon.png`

## Permissions

- `storage` for persisted timer state
- `alarms` for timer wake-ups in MV3
- `notifications` for completion alerts

## Notes

- One active timer state per extension instance
- No network calls required for core timer behaviour
- Badge updates and state handling are local

## Licence

MIT
