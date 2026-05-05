# Glance

**Glance** is a Chrome extension (Manifest V3) that reads the main content of the page you’re on, sends it to a small backend API, and shows an AI-generated summary with key points, insights, and estimated reading time. You can highlight extracted keywords on the page and copy the summary as plain text.

The extension uses vanilla HTML, CSS, and JavaScript—no React, no bundler. Load the folder in **Developer mode** and you’re set.

---

## Features

- Extracts readable article-style text (heuristics for `<article>`, main regions, or dense `<p>` clusters)
- Structured output: summary, bullets, insights, reading time, sentiment
- Modes: **Full summary**, **3 bullets**, **ELI5**
- **Glass-style** popup UI (`backdrop-filter`, layered cards, gradient backdrop)
- Summary **caching** per URL and mode in `chrome.storage.local` (1 hour) to avoid duplicate API calls
- Optional **in-page highlights** from key bullet terms
- **Proxy architecture**: the Groq API key stays on the server, not in the extension or repo

---

## How it works

1. **Popup** asks the **content script** for extracted text.
2. The **service worker** `POST`s `{ content, title, mode }` to your **`GLANCE_PROXY_URL`** (see `config.js`).
3. The **Node server** attaches `GROQ_API_KEY`, calls Groq, normalizes JSON, and returns it.
4. The worker caches the response and the popup renders it safely (`textContent` / escaped lists).

---

## Requirements

- **Chrome** (or Chromium) with Manifest V3
- **Node.js 18+** for the proxy
- A **Groq** API key (server-side only), from [Groq Console](https://console.groq.com/keys)

---

## Setup

### 1. Proxy

```bash
cd server
cp .env.example .env
```

Set `GROQ_API_KEY` in `server/.env` (never commit this file).

```bash
npm install
npm start
```

By default the server listens on **`http://127.0.0.1:3000`**.  
Sanity check: open `GET http://127.0.0.1:3000/health`.

### 2. Extension config

Edit **`config.js`** at the repo root so `GLANCE_PROXY_URL` matches your proxy, for example:

```js
self.GLANCE_PROXY_URL = 'http://127.0.0.1:3000/api/summarize'
```

For a deployed proxy, use your public **`https://.../api/summarize`** URL, then reload the extension.

### 3. Install in Chrome

1. Go to **`chrome://extensions`**
2. Enable **Developer mode**
3. **Load unpacked** and choose the folder that contains **`manifest.json`**

Use Glance on normal **`https:`** pages (many `chrome://` URLs and the Chrome Web Store won’t inject the content script).

---

## Repo layout

| Path | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker: proxy `fetch`, cache, message handling |
| `content.js` | Extraction + highlight messaging |
| `config.js` | Public proxy URL (`importScripts` from the worker) |
| `popup/` | Popup HTML, glass UI CSS, popup logic |
| `server/` | Express proxy + Groq integration |

---

## Security notes

- **Never** commit `server/.env` or embed `GROQ_API_KEY` in the extension.
- `config.js` only holds the proxy URL—that endpoint is public to anyone who can reach it unless you protect it (auth, rate limits, IP allowlisting, etc.).
- User-generated summary text is not injected as raw HTML where it could execute scripts.

---

## Optional tooling

- **`tools/generate-icons.html`** — open in Chrome to regenerate PNG toolbar icons into `icons/`.
- **`GROQ_MODEL`** / **`PORT`** — override in `server/.env` if needed (see `.env.example`).

---

## License

Add your own `LICENSE` if you distribute the project publicly.
