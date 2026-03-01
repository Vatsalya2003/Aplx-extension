// Background service worker for aplx

import { getDefaultProfile } from '../utils/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log('aplx installed');
});

// Handle keyboard shortcuts / commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_widget') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: 'PROFILEFILL_TOGGLE_WIDGET' });
  }

  if (command === 'open_popup') {
    // Default Chrome action command will open the popup; we can optionally focus it.
    // No-op here; kept for future extension if needed.
  }
});

// Content script can request the default profile
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PROFILEFILL_GET_DEFAULT_PROFILE') {
    (async () => {
      try {
        const profile = await getDefaultProfile();
        sendResponse({ ok: true, profile });
      } catch (e) {
        console.error('Failed to get default profile', e);
        sendResponse({ ok: false, error: e?.message || 'Unknown error' });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message?.type === 'PROFILEFILL_OPEN_PROFILE') {
    const url = chrome.runtime.getURL(
      `options/options.html?mode=edit&id=${encodeURIComponent(message.id)}`
    );
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return; // synchronous response
  }

  if (message?.type === 'PROFILEFILL_OPEN_OPTIONS') {
    const url = chrome.runtime.getURL('options/options.html');
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return;
  }

  return undefined;
});
