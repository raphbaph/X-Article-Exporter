# X Article Exporter

A Manifest V3 Chrome extension that exports published X Articles to Markdown and downloads the result as a `.md` file.

## What it does

- Reads the current published X Article page on `x.com` or `twitter.com`
- Extracts title, author, published date, source URL, and body content
- Converts rich text content into Markdown
- Downloads the result through the browser

## Install locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `~/X-Article-Exporter`

## Use it

1. Open a published X Article in Chrome
2. Click the extension icon
3. Click **Export current article**
4. Choose where to save the generated Markdown file

## Notes

- The extractor uses semantic and heuristic selectors because X does not provide a stable public export API for Articles.
- If X changes their article DOM, selector updates in `content-script.js` may be required.
