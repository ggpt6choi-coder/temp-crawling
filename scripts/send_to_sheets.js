#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// load .env.local if present
try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') }); } catch (e) {}

const webappUrl = process.env.GOOGLE_SHEET_WEBAPP_URL;
if (!webappUrl) {
  console.log('GOOGLE_SHEET_WEBAPP_URL is not set. Skipping Google Sheets upload.');
  process.exit(0);
}

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  console.error('Data directory not found:', dataDir);
  process.exit(1);
}

function findNewest(files, regex) {
  const matches = files.filter(f => regex.test(f));
  if (!matches.length) return null;
  let best = null;
  for (const f of matches) {
    const stat = fs.statSync(path.join(dataDir, f));
    if (!best || stat.mtimeMs > best.stat.mtimeMs) best = { file: f, stat };
  }
  return best && best.file;
}

function parseCsv(content) {
  const result = [];
  let row = [];
  let inQuotes = false;
  let currentVal = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(currentVal);
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (row.length || currentVal) {
    row.push(currentVal);
    result.push(row);
  }
  return result.filter(r => r.length > 0 && r.some(cell => cell.trim() !== ''));
}

(async () => {
  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv') && !f.startsWith('combined-'));
  
  const sources = [
    { name: 'ppomppu', regex: /^ppomppu-.*\.csv$/, hasViews: true },
    { name: 'naver', regex: /^naver-.*\.csv$/, hasViews: true },
    { name: 'ruliweb', regex: /^ruliweb-.*\.csv$/, hasViews: false },
    { name: 'fmkorea', regex: /^fmkorea-.*\.csv$/, hasViews: false }
  ];

  const unifiedRows = [];

  for (const src of sources) {
    const newestFile = findNewest(allFiles, src.regex);
    if (!newestFile) {
      console.log(`No CSV file found for pattern: ${src.regex}`);
      continue;
    }

    const filePath = path.join(dataDir, newestFile);
    console.log(`Processing file: ${newestFile}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseCsv(content);
    if (parsed.length <= 1) {
      continue;
    }

    const dataRows = parsed.slice(1);

    for (const r of dataRows) {
      const title = r[3];
      const date = r[2];
      if (!title || title === '없음' || date === '없음') {
        continue;
      }

      let unifiedRow;
      if (src.hasViews) {
        unifiedRow = [
          r[0] || '',
          r[1] || '',
          r[2] || '',
          r[3] || '',
          r[4] || '',
          r[5] || ''
        ];
      } else {
        unifiedRow = [
          r[0] || '',
          r[1] || '',
          r[2] || '',
          r[3] || '',
          '',
          r[4] || ''
        ];
      }
      unifiedRows.push(unifiedRow);
    }
  }

  if (unifiedRows.length === 0) {
    console.log('No new rows to upload to Google Sheets.');
    process.exit(0);
  }

  console.log(`Uploading ${unifiedRows.length} rows to Google Sheets...`);

  try {
    const response = await fetch(webappUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sheetName: '크롤링 결과',
        headers: ['구분', '키워드', '날짜', '제목', '조회수', '링크'],
        rows: unifiedRows
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
})();
