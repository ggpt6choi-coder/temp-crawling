const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config({ path: '.env.local' });

const keywords = require('../keywords.json');
const maxPages = parseInt(process.env.PAGES || '5', 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatDateKST(date) {
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '.').replace(/\s/g, '').replace(/\.$/, '');
}

function getTargetDateString() {
  const now = new Date();
  // yesterday in KST
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  kst.setDate(kst.getDate() - 1);
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, '0');
  const dd = String(kst.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

async function scrapeKeyword(browser, keyword, targetDate) {
  const rows = [];
  const context = await browser.newContext();
  const page = await context.newPage();

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const url = `https://bbs.ruliweb.com/search?q=${encodeURIComponent(keyword)}&page=${pageNum}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.error('navigation error', url, e.message);
      break;
    }

    const items = await page.$$eval('ul.search_result_list li.search_result_item', nodes => {
      return nodes.map(n => {
        const a = n.querySelector('a.title') || n.querySelector('a.title.text_over');
        const title = a ? a.textContent.trim() : '';
        const href = a ? a.href : '';
        const timeEl = n.querySelector('span.time');
        const date = timeEl ? timeEl.textContent.trim() : '';
        return { title, href, date };
      });
    });

    if (!items || items.length === 0) {
      // nothing on this page; stop
      break;
    }

    // check for older-than-target detection
    let olderFound = false;
    for (const it of items) {
      const dateStr = it.date;
      if (!dateStr) continue;
      if (dateStr.includes('어제')) continue; // '어제' is recent
      const m = dateStr.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
      if (m) {
        const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
        const target = new Date(`${targetDate.replace(/\./g,'-')}T00:00:00+09:00`);
        if (d < target) {
          olderFound = true;
          break;
        }
      }
    }

    // collect matching date items
    for (const it of items) {
      const dateStr = it.date || '';
      const isMatch = dateStr.includes('어제') || dateStr === targetDate;
      if (isMatch) {
        rows.push({
          source: '루리웹',
          keyword,
          date: dateStr,
          title: it.title,
          link: it.href,
        });
      }
    }

    if (olderFound) break;
  }

  await page.close();
  await context.close();
  return rows;
}

async function main() {
  ensureDir(path.join(__dirname, '..', 'data'));
  const targetDate = getTargetDateString();
  const allRows = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const kw of keywords) {
      console.log('scraping', kw);
      const rows = await scrapeKeyword(browser, kw, targetDate);
      if (rows.length === 0) {
        // keep an explicit '없음' row to match aggregator behavior
        allRows.push({ source: '루리웹', keyword: kw, date: targetDate, title: '없음', link: '' });
      } else {
        allRows.push(...rows);
      }
    }
  } finally {
    await browser.close();
  }

  const filename = `ruliweb-${targetDate.replace(/\./g, '.')}.csv`;
  const outPath = path.join(__dirname, '..', 'data', filename);
  const header = '구분,키워드,날짜,제목,링크\n';
  const lines = [header];
  for (const r of allRows) {
    const cols = [r.source, r.keyword, r.date, r.title, r.link].map(csvEscape).join(',');
    lines.push(cols + '\n');
  }
  fs.writeFileSync(outPath, lines.join(''));
  console.log('written', outPath);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
