# SFVibe - Docsend to PDF

A Chrome extension that captures DocSend presentations and saves them as PDF files.

DocSend presentations don't allow downloading by default. This extension visually captures each page of a presentation and compiles them into a single PDF that you can save, share, and read offline.

## Features

- **One-click capture** — Click "Start Capture" and the extension handles the rest
- **Visual screenshot capture** — Captures exactly what you see on screen, no network tricks
- **Automatic navigation** — Steps through every page of the presentation automatically
- **Resume support** — If capture is interrupted, pick up right where you left off
- **Progress tracking** — Real-time progress bar shows capture and PDF compilation status
- **Auto-download** — PDF downloads automatically when complete

## Installation

### From source (Developer mode)

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `docsend-pdf` folder
6. The extension icon appears in your toolbar

### From Chrome Web Store

*(Coming soon)*

## Usage

1. Navigate to a DocSend presentation page (`https://docsend.com/view/...`)
2. Click the **SFVibe** extension icon in your toolbar
3. The popup shows the detected page count
4. Click **Start Capture**
5. Keep the tab visible while the extension captures each page
6. The PDF downloads automatically when all pages are captured

### Tips

- **Keep the tab in focus** — The extension takes visual screenshots, so the tab must be visible during capture
- **Don't scroll or interact** with the presentation while capture is in progress
- **If the page was loaded before the extension was installed**, click "Reload & Capture" in the popup

### Resuming a capture

If you stop a capture or it gets interrupted:

1. Open the extension popup on the same DocSend page
2. Click **Resume** to continue from where it left off
3. Click **Clear Saved** to start over

## How It Works

1. The content script detects the DocSend presentation carousel in the DOM
2. For each page, it navigates the carousel forward using DocSend's UI controls
3. After each page loads, the background service worker takes a screenshot using `chrome.tabs.captureVisibleTab()`
4. The screenshot is cropped to just the slide area
5. After all pages are captured, [pdf-lib](https://pdf-lib.js.org/) compiles them into a PDF
6. The PDF is downloaded to your default downloads folder

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Take screenshots of the active tab |
| `storage` | Save capture progress for resume |
| `unlimitedStorage` | Store page screenshots (large images) temporarily |
| `docsend.com` host | Run content script on DocSend pages |

**This extension does not collect, transmit, or store any personal data.** All processing happens locally in your browser. No data leaves your machine.

## Project Structure

```
docsend-pdf/
  manifest.json              # Extension configuration
  background/
    background.js            # Screenshot capture via captureVisibleTab
  content/
    content.js               # Page navigation, image capture, PDF compilation
  popup/
    popup.html               # Extension popup UI
    popup.css                # Popup styles
    popup.js                 # Popup logic
  lib/
    pdf-lib.min.js           # PDF generation library (bundled)
  icons/
    icon16.png, icon48.png, icon128.png
```

## Development

```bash
# Clone the repo
git clone https://github.com/jooddang/sfvibe-docsend-to-pdf.git

# Load in Chrome
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select the docsend-pdf folder

# Make changes to content.js, background.js, or popup files
# Click the reload button on chrome://extensions/ to apply changes
```

## Tech Stack

- **Chrome Extension Manifest V3**
- **Vanilla JavaScript** (no framework)
- **[pdf-lib](https://pdf-lib.js.org/)** v1.17.1 for PDF generation
- **`chrome.tabs.captureVisibleTab()`** for visual screenshots

## License

MIT
