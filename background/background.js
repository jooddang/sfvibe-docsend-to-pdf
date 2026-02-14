// Background service worker: captures the visible tab as a screenshot.
// Uses chrome.tabs.captureVisibleTab() which is only available in the
// extension's background context (not content scripts).

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'captureTab') return;

  const windowId = sender.tab ? sender.tab.windowId : null;
  if (!sender.tab) {
    sendResponse({ error: 'No tab info' });
    return;
  }

  chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    .then(dataUrl => sendResponse({ dataUrl }))
    .catch(err => sendResponse({ error: err.message }));

  return true;
});
