(function () {
  'use strict';

  const STATE_KEY = 'docsend_capture_state';
  const NAV_TIMEOUT_MS = 10000;
  const IMG_LOAD_TIMEOUT_MS = 30000;
  const POST_NAV_DELAY_MS = 300;
  const POST_LOAD_DELAY_MS = 500;
  const SCREENSHOT_TIMEOUT_MS = 15000;

  let captureState = {
    isCapturing: false,
    isPaused: false,
    totalPages: 0,
    capturedPages: {},
    documentUrl: '',
    errors: []
  };

  // ---------------------------------------------------------------------------
  // DOM Queries
  // ---------------------------------------------------------------------------

  function isPresentation() {
    return document.querySelector('.carousel.js-viewer.viewer') !== null;
  }

  function getTotalPages() {
    const indicator = document.querySelector('.toolbar-page-indicator');
    if (!indicator) return 0;
    const match = indicator.textContent.match(/\/\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function getCurrentPageNumber() {
    const el = document.getElementById('page-number');
    return el ? parseInt(el.textContent.trim(), 10) : 0;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function navigateOneStep(direction) {
    return new Promise((resolve, reject) => {
      const buttonId = direction === 'next' ? 'nextPageButton' : 'prevPageButton';
      const button = document.getElementById(buttonId);
      if (!button) {
        reject(new Error(buttonId + ' not found'));
        return;
      }

      const pageBefore = getCurrentPageNumber();

      const carouselInner = document.querySelector('.js-carousel-inner');
      if (!carouselInner) {
        reject(new Error('Carousel inner not found'));
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, NAV_TIMEOUT_MS);

      const observer = new MutationObserver(() => {
        const pageNow = getCurrentPageNumber();
        if (pageNow !== pageBefore) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(carouselInner, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true
      });

      // DocSend binds jQuery .mouseup() on nav buttons, not .click().
      // Dispatch mouseup to trigger jQuery's handler.
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    });
  }

  async function goToPage(targetPage) {
    let attempts = 0;
    const maxAttempts = 5;

    while (getCurrentPageNumber() !== targetPage && attempts < maxAttempts) {
      attempts++;
      const current = getCurrentPageNumber();
      const direction = current < targetPage ? 'next' : 'prev';
      await navigateOneStep(direction);
      await sleep(POST_NAV_DELAY_MS);

      if (getCurrentPageNumber() === current) {
        // Fallback: inject into page's main world to call jQuery directly
        await navigateViaMainWorld(direction);
        await sleep(POST_NAV_DELAY_MS);
      }
    }

    if (getCurrentPageNumber() !== targetPage) {
      throw new Error('Failed to navigate to page ' + targetPage);
    }
  }

  function navigateViaMainWorld(direction) {
    return new Promise(resolve => {
      const script = document.createElement('script');
      const buttonId = direction === 'next' ? 'nextPageButton' : 'prevPageButton';
      script.textContent = '(function(){' +
        'try{' +
          'var $btn=jQuery("#' + buttonId + '");' +
          'if($btn.length){$btn.trigger("mouseup");}' +
        '}catch(e){}' +
      '})();';
      document.documentElement.appendChild(script);
      script.remove();
      setTimeout(resolve, 500);
    });
  }

  // ---------------------------------------------------------------------------
  // Image Loading
  // ---------------------------------------------------------------------------

  function waitForPageImageLoad(pageNum) {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(new Error('Image load timeout for page ' + pageNum));
      }, IMG_LOAD_TIMEOUT_MS);

      function check() {
        const activeItem = document.querySelector('.item.active');
        if (!activeItem) {
          setTimeout(check, 200);
          return;
        }

        const img = activeItem.querySelector('img.preso-view.page-view');
        if (!img) {
          setTimeout(check, 200);
          return;
        }

        const src = img.getAttribute('src') || '';
        const isBlank = src.endsWith('blank.gif') || src === '';
        const isLoaded = img.complete && img.naturalWidth > 0;

        if (!isBlank && isLoaded) {
          clearTimeout(deadline);
          resolve(img);
          return;
        }

        if (!isBlank && !isLoaded) {
          img.addEventListener('load', function onLoad() {
            clearTimeout(deadline);
            resolve(img);
          }, { once: true });
          img.addEventListener('error', function onError() {
            clearTimeout(deadline);
            reject(new Error('Image load error for page ' + pageNum));
          }, { once: true });
          return;
        }

        setTimeout(check, 500);
      }

      check();
    });
  }

  // ---------------------------------------------------------------------------
  // Image Capture (visual screenshot via captureVisibleTab)
  // ---------------------------------------------------------------------------

  async function capturePageImage() {
    const activeItem = document.querySelector('.item.active');
    if (!activeItem) throw new Error('No active slide item');

    const img = activeItem.querySelector('img.preso-view.page-view');
    if (!img) throw new Error('No slide image in active item');

    const rect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (rect.width === 0 || rect.height === 0) {
      throw new Error('Slide image has zero dimensions');
    }

    const screenshotDataUrl = await requestScreenshot();
    return await cropScreenshot(screenshotDataUrl, rect, dpr);
  }

  function requestScreenshot() {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Screenshot timeout: background did not respond within ' + SCREENSHOT_TIMEOUT_MS + 'ms'));
        }
      }, SCREENSHOT_TIMEOUT_MS);

      chrome.runtime.sendMessage({ action: 'captureTab' }, response => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (chrome.runtime.lastError) {
          reject(new Error('Screenshot failed: ' + chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.error) {
          reject(new Error('Screenshot error: ' + (response ? response.error : 'no response')));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  }

  function cropScreenshot(dataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Crop timeout after ' + SCREENSHOT_TIMEOUT_MS + 'ms'));
        }
      }, SCREENSHOT_TIMEOUT_MS);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const cropX = Math.round(rect.x * dpr);
        const cropY = Math.round(rect.y * dpr);
        const cropW = Math.round(rect.width * dpr);
        const cropH = Math.round(rect.height * dpr);

        canvas.width = cropW;
        canvas.height = cropH;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        canvas.toBlob(blob => {
          if (settled) return;
          if (!blob) {
            settled = true;
            clearTimeout(timer);
            reject(new Error('Crop toBlob returned null'));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(reader.result);
          };
          reader.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error('FileReader error'));
          };
          reader.readAsDataURL(blob);
        }, 'image/png');
      };
      image.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('Failed to load screenshot for cropping'));
      };
      image.src = dataUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // State Persistence
  // ---------------------------------------------------------------------------

  async function saveState() {
    const meta = {
      totalPages: captureState.totalPages,
      documentUrl: captureState.documentUrl,
      capturedPageNumbers: Object.keys(captureState.capturedPages).map(Number),
      errors: captureState.errors
    };

    const storageObj = {};
    storageObj[STATE_KEY + '_meta'] = meta;

    for (const [pageNum, dataUrl] of Object.entries(captureState.capturedPages)) {
      storageObj[STATE_KEY + '_page_' + pageNum] = dataUrl;
    }

    return chrome.storage.local.set(storageObj);
  }

  async function loadState() {
    const metaKey = STATE_KEY + '_meta';
    const metaResult = await chrome.storage.local.get(metaKey);
    const meta = metaResult[metaKey];
    if (!meta) return null;

    const pageKeys = meta.capturedPageNumbers.map(n => STATE_KEY + '_page_' + n);
    const pagesResult = await chrome.storage.local.get(pageKeys);

    const capturedPages = {};
    for (const num of meta.capturedPageNumbers) {
      const key = STATE_KEY + '_page_' + num;
      if (pagesResult[key]) {
        capturedPages[num] = pagesResult[key];
      }
    }

    return {
      totalPages: meta.totalPages,
      documentUrl: meta.documentUrl,
      capturedPages,
      errors: meta.errors || []
    };
  }

  async function clearState() {
    const metaKey = STATE_KEY + '_meta';
    const metaResult = await chrome.storage.local.get(metaKey);
    const meta = metaResult[metaKey];

    const keysToRemove = [metaKey];
    if (meta && meta.capturedPageNumbers) {
      for (const num of meta.capturedPageNumbers) {
        keysToRemove.push(STATE_KEY + '_page_' + num);
      }
    }
    return chrome.storage.local.remove(keysToRemove);
  }

  // ---------------------------------------------------------------------------
  // Main Capture Loop
  // ---------------------------------------------------------------------------

  function findNextUncapturedPage() {
    for (let i = 1; i <= captureState.totalPages; i++) {
      if (!captureState.capturedPages[i]) return i;
    }
    return null;
  }

  async function startCapture() {
    if (captureState.isCapturing) return;

    const totalPages = getTotalPages();
    if (totalPages === 0) {
      sendProgress({ phase: 'error', page: 0, error: 'Could not detect page count' });
      return;
    }

    const saved = await loadState();
    if (saved && saved.documentUrl === window.location.href) {
      captureState.capturedPages = saved.capturedPages;
      captureState.errors = saved.errors;
    } else {
      captureState.capturedPages = {};
      captureState.errors = [];
    }

    captureState.isCapturing = true;
    captureState.isPaused = false;
    captureState.totalPages = totalPages;
    captureState.documentUrl = window.location.href;

    const startPage = findNextUncapturedPage();
    if (startPage === null) {
      try {
        await compilePdf();
      } catch (err) {
        sendProgress({ phase: 'error', page: 0, error: 'PDF compilation failed: ' + err.message });
      }
      return;
    }

    sendProgress({
      phase: 'capturing',
      progress: Object.keys(captureState.capturedPages).length,
      total: totalPages
    });

    try {
      await goToPage(startPage);

      for (let page = startPage; page <= totalPages; page++) {
        if (!captureState.isCapturing || captureState.isPaused) break;
        if (captureState.capturedPages[page]) continue;

        if (getCurrentPageNumber() !== page) {
          await goToPage(page);
        }

        sendProgress({ phase: 'capturing', progress: page - 1, total: totalPages });

        await waitForPageImageLoad(page);
        await sleep(POST_LOAD_DELAY_MS);

        const dataUrl = await capturePageImage();
        captureState.capturedPages[page] = dataUrl;

        sendProgress({ phase: 'capturing', progress: page, total: totalPages });
        await saveState();
      }
    } catch (err) {
      captureState.errors.push({ page: getCurrentPageNumber(), error: err.message });
      sendProgress({
        phase: 'error',
        page: getCurrentPageNumber(),
        error: err.message
      });
      captureState.isCapturing = false;
      await saveState();
      return;
    }

    captureState.isCapturing = false;

    if (captureState.isPaused) {
      sendProgress({ phase: 'stopped' });
      return;
    }

    const capturedCount = Object.keys(captureState.capturedPages).length;
    if (capturedCount >= totalPages) {
      try {
        await compilePdf();
      } catch (pdfErr) {
        sendProgress({
          phase: 'error',
          page: 0,
          error: 'PDF compilation failed: ' + pdfErr.message
        });
      }
    } else {
      sendProgress({
        phase: 'error',
        page: 0,
        error: 'Incomplete: captured ' + capturedCount + '/' + totalPages + ' pages'
      });
    }
  }

  function stopCapture() {
    captureState.isPaused = true;
    captureState.isCapturing = false;
  }

  // ---------------------------------------------------------------------------
  // PDF Compilation
  // ---------------------------------------------------------------------------

  async function compilePdf() {
    sendProgress({ phase: 'compiling', progress: 0, total: captureState.totalPages });

    if (typeof PDFLib === 'undefined') {
      throw new Error('PDFLib is not loaded');
    }

    const pdfDoc = await PDFLib.PDFDocument.create();

    for (let i = 1; i <= captureState.totalPages; i++) {
      const dataUrl = captureState.capturedPages[i];
      if (!dataUrl) continue;

      sendProgress({ phase: 'compiling', progress: i, total: captureState.totalPages });

      const base64Data = dataUrl.split(',')[1];
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      let image;
      if (dataUrl.includes('image/png')) {
        image = await pdfDoc.embedPng(imageBytes);
      } else {
        image = await pdfDoc.embedJpg(imageBytes);
      }

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    let filename = 'docsend-presentation.pdf';
    const titleEl = document.querySelector('.presentation-title, .document-name, title');
    if (titleEl) {
      const title = (titleEl.textContent || '').trim().replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
      if (title) filename = title + '.pdf';
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 10000);

    await clearState();
    captureState.capturedPages = {};
    captureState.errors = [];

    sendProgress({ phase: 'done' });
  }

  // ---------------------------------------------------------------------------
  // Message Passing
  // ---------------------------------------------------------------------------

  function sendProgress(data) {
    chrome.runtime.sendMessage({ action: 'captureProgress', ...data }).catch(() => {
      // Popup may be closed
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case 'getStatus':
        loadState().then(saved => {
          const capturedCount = saved && saved.documentUrl === window.location.href
            ? Object.keys(saved.capturedPages).length
            : Object.keys(captureState.capturedPages).length;

          sendResponse({
            isPresentation: isPresentation(),
            isCapturing: captureState.isCapturing,
            totalPages: getTotalPages(),
            capturedCount,
            errors: captureState.errors
          });
        });
        return true;

      case 'startCapture':
        startCapture();
        sendResponse({ ok: true });
        break;

      case 'stopCapture':
        stopCapture();
        sendResponse({ ok: true });
        break;

      case 'clearState':
        clearState().then(() => {
          captureState = {
            isCapturing: false,
            isPaused: false,
            totalPages: 0,
            capturedPages: {},
            documentUrl: '',
            errors: []
          };
          sendResponse({ ok: true });
        });
        return true;
    }
  });

  // ---------------------------------------------------------------------------
  // Auto-start after reload
  // ---------------------------------------------------------------------------

  async function checkAutoStart() {
    try {
      const result = await chrome.storage.local.get('docsend_auto_start');
      const autoStartUrl = result.docsend_auto_start;
      if (autoStartUrl && window.location.href.startsWith(autoStartUrl.split('?')[0])) {
        await chrome.storage.local.remove('docsend_auto_start');
        await sleep(1000);
        if (isPresentation() && getTotalPages() > 0) {
          startCapture();
        }
      }
    } catch (_) {
      // Ignore auto-start errors
    }
  }

  checkAutoStart();

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
