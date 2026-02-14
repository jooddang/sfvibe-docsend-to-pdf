# Privacy Policy — SFVibe - Docsend to PDF

**Last updated:** February 2025

## Overview

SFVibe - Docsend to PDF is a Chrome extension that captures DocSend presentation pages and compiles them into a PDF file. This privacy policy explains what data the extension accesses and how it is handled.

## Data Collection

**This extension does not collect, transmit, or share any personal data.**

## Data Processing

All data processing happens entirely within your local browser:

- **Screenshots** are captured using Chrome's built-in screenshot API and stored temporarily in your browser's local storage until the PDF is compiled.
- **PDF files** are generated locally and saved to your default downloads folder.
- **Capture progress** is saved to Chrome's local storage so you can resume interrupted captures. This data is cleared automatically after the PDF is generated.

## Data Storage

- Temporary screenshot data is stored in `chrome.storage.local` during capture and is deleted after the PDF is downloaded.
- No data is stored on external servers.
- No cookies are set.

## Network Activity

This extension makes **no network requests**. It does not communicate with any external servers, APIs, or analytics services.

## Permissions

- **activeTab**: Used to take screenshots of the currently visible DocSend page.
- **storage / unlimitedStorage**: Used to temporarily store captured page images for resume capability.
- **docsend.com host permission**: Required to inject the content script that navigates the DocSend presentation.

## Third-Party Libraries

- **pdf-lib** (MIT license): Bundled locally for PDF generation. It makes no network requests.

## Changes

If this privacy policy is updated, the changes will be reflected in this file and in the Chrome Web Store listing.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/YOUR_USERNAME/sfvibe-docsend-to-pdf).
