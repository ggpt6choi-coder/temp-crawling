const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config({ path: '.env.local' });

const keywords = require('../keywords.json');
const maxPages = parseInt(process.env.PAGES || '5', 10);
const BASE = 'https://www.fmkorea.com';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getTargetDateString() {
  const now = new Date();
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

function parseFmkoreaDate(raw) {
  if (!raw) return '';
  const s = raw.trim();
  if (s.includes('어제')) return '어제';
  // expected formats: '2026-05-22 10:24' -> convert to '2026.05.22'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  const m2 = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (m2) return `${m2[1]}.${m2[2]}.${m2[3]}`;
  return s;
}

async function scrapeKeyword(browser, keyword, targetDate) {
  const rows = [];
  const context = await browser.newContext();
  const page = await context.newPage();

  for (let p = 1; p <= maxPages; p++) {
    const url = `https://www.fmkorea.com/search.php?act=IS&is_keyword=${encodeURIComponent(keyword)}&mid=home&page=${p}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.error('nav error', url, e.message);
      break;
    }

    const items = await page.$$eval('ul.searchResult li', nodes => {
      return nodes.map(n => {
        const a = n.querySelector('dt a');
        const title = a ? a.textContent.trim() : '';
        const href = a ? a.getAttribute('href') : '';
        const timeEl = n.querySelector('address span.time');
        const rawTime = timeEl ? timeEl.textContent.trim() : '';
        return { title, href, rawTime };
      });
    });

    if (!items || items.length === 0) break;

    let olderFound = false;
    for (const it of items) {
      const dateOnly = parseFmkoreaDate(it.rawTime);
      if (!dateOnly) continue;
      if (dateOnly === '어제') continue;
      const m = dateOnly.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
      if (m) {
        const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
        const target = new Date(`${targetDate.replace(/\./g,'-')}T00:00:00+09:00`);
        if (d < target) { olderFound = true; break; }
      }
    }

    for (const it of items) {
      const dateOnly = parseFmkoreaDate(it.rawTime) || '';
      const isMatch = dateOnly === '어제' || dateOnly === targetDate;
      if (isMatch) {
        const href = it.href ? new URL(it.href, BASE).href : '';
        rows.push({ source: 'fmkorea', keyword, date: dateOnly, title: it.title, link: href });
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
        allRows.push({ source: 'fmkorea', keyword: kw, date: targetDate, title: '없음', link: '' });
      } else {
        allRows.push(...rows);
      }
    }
  } finally {
    await browser.close();
  }

  const filename = `fmkorea-${targetDate.replace(/\./g, '.')}.csv`;
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
  main().catch(err => { console.error(err); process.exit(1); });
}
