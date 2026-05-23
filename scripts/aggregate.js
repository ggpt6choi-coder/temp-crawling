#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  console.error('data directory not found:', dataDir);
  process.exit(1);
}

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv') && !f.startsWith('combined-'));
if (!files.length) {
  console.error('No CSV files found in', dataDir);
  process.exit(1);
}

// Keywords of interest (same as scrapers)
const keywords = ['로보락','드리미','모바','나르왈','에코백스','삼성'];
const codeMap = { naver: '네이버', ppomppu: '뽐뿌' };

function escapeCsvCell(s) {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// index files by source code and keyword
const index = {};
for (const f of files) {
  const m = f.match(/^(naver|ppomppu)-(\d{4}\.\d{2}\.\d{2})-(.+)\.csv$/);
  if (!m) continue;
  const code = m[1];
  const kw = m[3];
  index[code] = index[code] || {};
  index[code][kw] = path.join(dataDir, f);
}

const today = new Date().toISOString().slice(0,10).replace(/-/g,'.');

let totalFiles = 0;
let totalRows = 0;

for (const code of Object.keys(codeMap)) {
  const sourceName = codeMap[code];
  const outLines = [[ '구분','키워드','날짜','제목','조회수','링크' ].join(',')];

  for (const kw of keywords) {
    const filePath = (index[code] && index[code][kw]) || null;
    if (filePath && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/).filter(Boolean);
      const body = lines.slice(1);
      if (body.length) {
        outLines.push(...body);
        totalRows += body.length;
        totalFiles += 1;
        continue;
      }
    }
    // No results for this keyword -> add a single '없음' row
    const row = [
      escapeCsvCell(sourceName),
      escapeCsvCell(kw),
      escapeCsvCell('없음'),
      escapeCsvCell('없음'),
      escapeCsvCell('없음'),
      escapeCsvCell('없음')
    ].join(',');
    outLines.push(row);
    totalRows += 1;
  }

  const outName = `combined-${sourceName}-${today}.csv`;
  const outPath = path.join(dataDir, outName);
  fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');
  console.log('Wrote', outPath, 'rows=', outLines.length - 1);
}

console.log('Summary: files processed=', files.length, 'total rows written=', totalRows);
