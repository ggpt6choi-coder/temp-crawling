#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const keywords = ['로보락','드리미','모바','나르왈','에코백스','삼성'];
const base = 'https://www.ppomppu.co.kr/search_bbs.php?search_type=sub_memo&page_no=';

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched (ppomppu). Running headless:', true);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    extraHTTPHeaders: { 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' }
  });

  const rows = [];
  // compute KST yesterday date string (YYYY.MM.DD)
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const kstYesterday = new Date(kstNow);
  kstYesterday.setDate(kstNow.getDate() - 1);
  const fmtKst = d => d.toISOString().slice(0,10).replace(/-/g,'.');
  const targetDate = fmtKst(kstYesterday);
  console.log('Filtering results for KST date:', targetDate);
  const maxPages = parseInt(process.env.PAGES || '5', 10);
  console.log('Max pages to scan:', maxPages);
  for (const kw of keywords) {
    console.log(`Starting keyword: ${kw}`);
    const aggregated = [];
    let stopPaging = false;
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const url = `${base}${pageNo}&keyword=${encodeURIComponent(kw)}&page_size=50&bbs_id=&order_type=date&bbs_cate=2`;
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(30000);
      try {
        await page.setExtraHTTPHeaders({
          'Referer': url,
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
          await page.evaluate(() => {
            window.scrollTo({ top: Math.floor(document.body.scrollHeight / 3), behavior: 'smooth' });
          });
          await page.waitForTimeout(500 + Math.floor(Math.random() * 1000));
          await page.evaluate(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
          await page.waitForTimeout(500 + Math.floor(Math.random() * 1000));
        } catch (e) {}

        const items = await page.$$eval('.results_board .conts', nodes => {
          return nodes.map(n => {
            try {
              const titleA = n.querySelector('.title a');
              if (!titleA) return null;
              const font = titleA.querySelector('font.comment-cnt');
              if (font) font.remove();
              const title = titleA.textContent.trim();
              let href = titleA.getAttribute('href') || titleA.href || '';
              try { href = new URL(href, 'https://www.ppomppu.co.kr').toString(); } catch(e){}

              const descSpans = Array.from(n.querySelectorAll('.desc span')).map(s => s.textContent.trim());
              let date = '';
              let views = '';
              for (const s of descSpans) {
                if (/\d{4}\.\d{2}\.\d{2}/.test(s)) date = s;
                if (/조회수\s*[:：]?\s*\d+/.test(s)) views = (s.match(/\d+/) || [''])[0];
              }

              return { title, link: href, date, views };
            } catch (e) { return null; }
          }).filter(Boolean);
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

    // keep only items that match KST yesterday (expecting YYYY.MM.DD in `date`)
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
      rows.push({ keyword: kw, date: '없음', title: '없음', views: '없음', link: '없음' });
    }
    console.log(`Finished keyword: ${kw}. Total rows so far: ${rows.length}`);
  }

  // write single CSV for 뽐뿌
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g, '.');
  const outDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvHeader = ['구분','키워드','날짜','제목','조회수','링크'];
  const csvLines = [csvHeader.join(',')];
  for (const r of rows) {
    const vals = [
      '뽐뿌',
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
  const outPath = path.join(outDir, `ppomppu-${dateStr}.csv`);
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log('Saved', outPath, '-', rows.length, 'rows');

  await browser.close();
  console.log('Browser closed. All done.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
