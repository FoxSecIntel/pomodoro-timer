# Pomodoro Timer (Chrome Extension)

A lightweight and reliable Pomodoro timer extension for Chrome.

## Features

- Start, pause, and reset timer
- Focus mode and break mode
- Custom focus duration (1 to 120 minutes)
- Badge countdown on extension icon
- Notification on timer completion
- State persistence across popup close/reopen

## Reliability model (MV3 safe)

This extension uses timestamp-based state in the service worker instead of trusting long-lived JavaScript intervals.

- Running timer stores an `endTs` timestamp
- Remaining time is computed from `Date.now()`
- `chrome.alarms` is used for periodic wake-ups and completion checks

This approach is resilient to MV3 service worker suspension.

## Install (load unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder

## Files

- `manifest.json`
- `background.js`
- `popup.html`
- `popup.js`
- `icon.png`

## Permissions

- `storage` for saving timer state
- `alarms` for periodic wake-ups
- `notifications` for completion alerts

## Notes

- Keep one running timer per extension instance
- Badge updates are local and do not use network resources

## Licence

MIT
