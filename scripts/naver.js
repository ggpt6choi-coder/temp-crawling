#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const keywords = ['로보락','드리미','모바','나르왈','에코백스','삼성'];
// Naver Cafe search URL template (cafe id matches example). Adjust CAFE_ID as needed.
const CAFE_ID = process.env.CAFE_ID || '11262350';
const base = `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/menus/0?viewType=L&ta=SUBJECT`;

(async () => {
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
  for (const kw of keywords) {
    console.log(`Starting keyword: ${kw}`);
    const aggregated = [];
    for (let pageNo = 1; pageNo <= 2; pageNo++) {
      // Naver Cafe uses `page` parameter and supports q (query) and size
      const toDate = new Date();
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 30); // last 30 days by default
      const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
      const from = process.env.FROM || fmt(fromDate);
      const to = process.env.TO || fmt(toDate);
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
        console.log(`Page ${pageNo} for ${kw}: collected ${items.length} items`);
      } catch (err) {
        console.error('Failed to open', url, '-', err.message || err);
      } finally {
        await page.close();
      }

      await new Promise(r => setTimeout(r, 500));
    }

    if (aggregated.length) {
      for (const it of aggregated) {
        rows.push({ keyword: kw, date: it.date || '', title: it.title || '', views: (it.views||'').toString().replace(/,/g,''), link: it.link || '' });
      }
    } else {
      // no results for this keyword -> add '없음'
      rows.push({ keyword: kw, date: '없음', title: '없음', views: '없음', link: '없음' });
    }
    console.log(`Finished keyword: ${kw}. Total rows so far: ${rows.length}`);
  }

  // write single CSV for 네이버
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g, '.');
  const outDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvHeader = ['구분','키워드','날짜','제목','조회수','링크'];
  const csvLines = [csvHeader.join(',')];
  for (const r of rows) {
    const vals = [
      '네이버',
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
  

  await browser.close();
  console.log('Browser closed. All done.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
