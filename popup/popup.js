(function () {
  'use strict';

  const sections = ['not-docsend', 'needs-reload', 'ready', 'capturing', 'compiling', 'done', 'error-section'];

  function showSection(sectionId) {
    sections.forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToContent(tab, action) {
    return chrome.tabs.sendMessage(tab.id, { action });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const tab = await getActiveTab();

    const isDocsendUrl = tab && tab.url && tab.url.includes('docsend.com/view/');

    if (!isDocsendUrl) {
      showSection('not-docsend');
      return;
    }

    let status;
    try {
      status = await sendToContent(tab, 'getStatus');
    } catch {
      // Content script not injected — page was loaded before extension
      showSection('needs-reload');
      setupReloadButton(tab);
      return;
    }

    if (!status || !status.isPresentation) {
      // Content script responded but didn't detect a presentation DOM
      showSection('needs-reload');
      setupReloadButton(tab);
      return;
    }

    if (status.isCapturing) {
      showSection('capturing');
      updateProgress(status.capturedCount, status.totalPages);
    } else {
      showSection('ready');
      document.getElementById('total-pages').textContent = status.totalPages;

      if (status.capturedCount > 0 && status.capturedCount < status.totalPages) {
        document.getElementById('resume-btn').classList.remove('hidden');
        document.getElementById('clear-btn').classList.remove('hidden');
        document.getElementById('resume-count').textContent = status.capturedCount;
        document.getElementById('resume-total').textContent = status.totalPages;
      }
    }

    // Button handlers
    document.getElementById('start-btn').addEventListener('click', async () => {
      await sendToContent(tab, 'clearState');
      await sendToContent(tab, 'startCapture');
      showSection('capturing');
    });

    document.getElementById('resume-btn').addEventListener('click', async () => {
      await sendToContent(tab, 'startCapture');
      showSection('capturing');
    });

    document.getElementById('stop-btn').addEventListener('click', async () => {
      await sendToContent(tab, 'stopCapture');
      showSection('ready');
      // Refresh status
      const s = await sendToContent(tab, 'getStatus');
      document.getElementById('total-pages').textContent = s.totalPages;
      if (s.capturedCount > 0) {
        document.getElementById('resume-btn').classList.remove('hidden');
        document.getElementById('clear-btn').classList.remove('hidden');
        document.getElementById('resume-count').textContent = s.capturedCount;
        document.getElementById('resume-total').textContent = s.totalPages;
      }
    });

    document.getElementById('clear-btn').addEventListener('click', async () => {
      await sendToContent(tab, 'clearState');
      document.getElementById('resume-btn').classList.add('hidden');
      document.getElementById('clear-btn').classList.add('hidden');
    });

    document.getElementById('new-capture-btn').addEventListener('click', () => {
      showSection('ready');
    });

    // Listen for progress messages from content script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action !== 'captureProgress') return;

      if (message.phase === 'capturing') {
        showSection('capturing');
        document.getElementById('status-text').textContent = 'Capturing screenshots...';
        updateProgress(message.progress, message.total);
      } else if (message.phase === 'compiling') {
        showSection('compiling');
        const pct = Math.round((message.progress / message.total) * 100);
        document.getElementById('compile-progress-bar').style.width = pct + '%';
        document.getElementById('compile-text').textContent =
          'Page ' + message.progress + ' / ' + message.total;
      } else if (message.phase === 'done') {
        showSection('done');
      } else if (message.phase === 'error') {
        document.getElementById('error-text').textContent =
          'Error on page ' + message.page + ': ' + message.error;
        document.getElementById('error-section').classList.remove('hidden');
      } else if (message.phase === 'stopped') {
        showSection('ready');
      }
    });
  });

  function setupReloadButton(tab) {
    document.getElementById('reload-btn').addEventListener('click', async () => {
      // Set flag so content script auto-starts after reload
      await chrome.storage.local.set({ docsend_auto_start: tab.url });
      chrome.tabs.reload(tab.id);
      window.close();
    });
  }

  function updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-text').textContent =
      'Page ' + current + ' / ' + total;
  }
})();
