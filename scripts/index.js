#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const scrapePpomppu = require('./ppomppu').scrape;
const scrapeNaver = require('./naver').scrape;
const scrapeRuliweb = require('./ruliweb').scrape;
const scrapeFmkorea = require('./fmkorea').scrape;

const webappUrl = process.env.GOOGLE_SHEET_WEBAPP_URL;

(async () => {
  if (!webappUrl) {
    console.error('GOOGLE_SHEET_WEBAPP_URL is not set in .env.local. Skipping execution.');
    process.exit(1);
  }

  const unifiedRows = [];

  try {
    console.log('--- Starting Ppomppu Scraper ---');
    const ppomppuData = await scrapePpomppu();
    unifiedRows.push(...ppomppuData);

    console.log('--- Starting Naver Scraper ---');
    const naverData = await scrapeNaver();
    unifiedRows.push(...naverData);

    console.log('--- Starting Ruliweb Scraper ---');
    const ruliwebData = await scrapeRuliweb();
    unifiedRows.push(...ruliwebData);

    console.log('--- Starting Fmkorea Scraper ---');
    const fmkoreaData = await scrapeFmkorea();
    unifiedRows.push(...fmkoreaData);

  } catch (err) {
    console.error('Error occurred during scraping:', err);
    process.exit(1);
  }

  // Filter out any rows that shouldn't be uploaded (if needed).
  // Currently, we want everything, including '없음' rows.
  // We just ensure all required fields are there.
  const finalRows = [];
  for (const r of unifiedRows) {
    // For communities without views, fill with empty string
    const views = r.views || '';
    finalRows.push([
      r.source || '',
      r.keyword || '',
      r.date || '',
      r.title || '',
      views,
      r.link || ''
    ]);
  }

  if (finalRows.length === 0) {
    console.log('No rows to upload to Google Sheets.');
    process.exit(0);
  }

  console.log(`Uploading ${finalRows.length} rows to Google Sheets...`);

  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const todaySheetName = `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')}`;

  try {
    const response = await fetch(webappUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sheetName: todaySheetName,
        headers: ['구분', '키워드', '날짜', '제목', '조회수', '링크'],
        rows: finalRows
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const resData = await response.json();
    console.log('Upload complete. Response:', resData);
  } catch (err) {
    console.error('Failed to upload to Google Sheets:', err.message || err);
    process.exit(1);
  }

  console.log('All processes finished successfully.');
})();
