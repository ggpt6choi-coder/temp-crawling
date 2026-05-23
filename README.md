# naver-scraper

Requires Node 18+ (global `fetch`).

Usage:

```bash
QUERY="로보락" node scripts/naver.js
# or use puppeteer mode
USE_PUPPETEER=1 QUERY="로보락" node scripts/naver.js
```

Environment variables:
- `PROXIES`: comma-separated proxy servers (used only in Puppeteer mode as `--proxy-server`)
- `USE_PUPPETEER`: set to `1` to use Puppeteer CDP mode (install `puppeteer` first)
- `ATTEMPTS`: number of fetch attempts (default 3)
# ppomppu-playwright

Simple Node script that opens ppomppu search pages for several keywords using Playwright.

Setup and run:

```bash
npm install
npm start
```

Notes:
- The script launches Chromium in headful mode so you can see each page.
- Press Enter in the terminal to close the browser when done.
# temp-crawling
