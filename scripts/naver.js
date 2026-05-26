#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const keywords = require('../keywords.json');
// Naver Cafe search URL template (cafe id matches example). Adjust CAFE_ID as needed.
const CAFE_ID = process.env.CAFE_ID || '11262350';
const base = `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/menus/0?viewType=L&ta=SUBJECT`;

const getKstDateString = (date, offsetDays = 0, delimiter = '.') => {
  const kst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  kst.setDate(kst.getDate() + offsetDays);
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, '0');
  const dd = String(kst.getDate()).padStart(2, '0');
  return `${yyyy}${delimiter}${mm}${delimiter}${dd}`;
};

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    extraHTTPHeaders: {
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8'
    }
  });

  // collect rows for all keywords, then write one CSV per source
  const rows = [];
  console.log('Browser launched (naver). Running in headless if configured.');
  // compute KST yesterday date string (YYYY.MM.DD)
  const targetDate = getKstDateString(new Date(), -1);
  console.log('Filtering results for KST date:', targetDate);
  const maxPages = parseInt(process.env.PAGES || '5', 10);
  console.log('Max pages to scan:', maxPages);
  for (const kw of keywords) {
    console.log(`Starting keyword: ${kw}`);
    const aggregated = [];
    let stopPaging = false;
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      // Naver Cafe uses `page` parameter and supports q (query) and size
      const from = process.env.FROM || getKstDateString(new Date(), -2, '');
      const to = process.env.TO || getKstDateString(new Date(), 0, '');
      const size = process.env.SIZE || '50';
      const url = `${base}&page=${pageNo}&q=${encodeURIComponent(kw)}&from=${from}&to=${to}&size=${size}`;
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(30000);
      try {
        await page.setExtraHTTPHeaders({
          'Referer': 'https://search.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document'
        });

        const preDelay = Math.floor(Math.random() * 5000);
        await page.waitForTimeout(preDelay);

        console.log(`Navigating to page ${pageNo} for keyword '${kw}': ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('Page loaded:', url);

        try {
          await page.evaluate(() => { window.scrollTo({ top: Math.floor(document.body.scrollHeight / 3), behavior: 'smooth' }); });
          await page.waitForTimeout(500 + Math.floor(Math.random() * 1000));
          await page.evaluate(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
          await page.waitForTimeout(500 + Math.floor(Math.random() * 1000));
        } catch (e) {}

        // Extract rows only from the table's tbody -> tr to avoid unrelated anchors
        const items = await page.$$eval('table.article-table > tbody > tr', rows => {
          const out = [];
          for (const row of rows) {
            try {
              const anchor = row.querySelector('a.article') || row.querySelector('a');
              if (!anchor) continue;
              const title = (anchor.innerText || '').trim();
              let href = anchor.getAttribute('href') || anchor.href || '';
              if (!title || !href) continue;
              if (href.startsWith('javascript:') || href.startsWith('#')) continue;
              try { href = new URL(href, location.origin).toString(); } catch (e) {}

              const tds = Array.from(row.querySelectorAll('td'));
              const date = (tds[3] && tds[3].innerText || '').trim();
              const viewsRaw = (tds[4] && tds[4].innerText || '').trim();
              const views = viewsRaw.replace(/,/g, '');

              out.push({ title, link: href, date, views });
            } catch (e) {
              // ignore row-level errors
            }
          }
          return out;
        });

        aggregated.push(...items);
        // if any item is older than targetDate, stop scanning further pages
        const olderFound = items.some(it => {
          if (!it || !it.date) return false;
          const s = (it.date || '').trim();
          const m = s.match(/\d{4}\.\d{2}\.\d{2}/);
          if (!m) return false;
          return m[0] < targetDate;
        });
        if (olderFound) {
          console.log(`Found older-than-target date on page ${pageNo}, stopping further pages.`);
          stopPaging = true;
        }
        console.log(`Page ${pageNo} for ${kw}: collected ${items.length} items`);
      } catch (err) {
        console.error('Failed to open', url, '-', err.message || err);
      } finally {
        await page.close();
      }

      await new Promise(r => setTimeout(r, 500));
      if (stopPaging) break;
    }

    // keep only items with 작성일 == KST yesterday (expecting YYYY.MM.DD)
    const matched = (aggregated || []).filter(it => {
      if (!it || !it.date) return false;
      const s = (it.date || '').trim();
      if (s.includes('어제')) return true;
      const m = s.match(/\d{4}\.\d{2}\.\d{2}/);
      return m && m[0] === targetDate;
    });
    if (matched.length) {
      for (const it of matched) {
        rows.push({ keyword: kw, date: it.date || '', title: it.title || '', views: (it.views||'').toString().replace(/,/g,''), link: it.link || '' });
      }
    } else {
      // no results for this keyword -> add '없음'
      rows.push({ keyword: kw, date: '없음', title: '없음', views: '없음', link: '없음' });
    }
    console.log(`Finished keyword: ${kw}. Total rows so far: ${rows.length}`);
  }

  await browser.close();
  console.log('Browser closed. All done.');
  
  // To keep consistent with previous formatting, we map rows to unified format
  const unifiedRows = rows.map(r => ({
    source: '네이버',
    keyword: r.keyword,
    date: r.date,
    title: r.title,
    views: r.views,
    link: r.link
  }));
  return unifiedRows;
}

async function main() {
  const rows = await scrape();
  
  // write single CSV for 네이버
  const dateStr = getKstDateString(new Date(), 0);
  const outDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvHeader = ['구분','키워드','날짜','제목','조회수','링크'];
  const csvLines = [csvHeader.join(',')];
  for (const r of rows) {
    const vals = [
      r.source,
      r.keyword,
      r.date,
      r.title.replace(/"/g,'""'),
      r.views,
      r.link
    ].map(v => {
      const s = String(v || '');
      return (s.includes(',') || s.includes('\n') || s.includes('"')) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',');
    csvLines.push(vals);
  }
  const outPath = path.join(outDir, `naver-${dateStr}.csv`);
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log('Saved', outPath, '-', rows.length, 'rows');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { scrape };
