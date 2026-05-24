#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
// load .env.local if present
try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') }); } catch (e) {}
const nodemailer = require('nodemailer');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  console.error('data directory not found:', dataDir);
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

(async () => {
  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
  if (!allFiles.length) {
    console.error('No CSV files found in', dataDir);
    process.exit(1);
  }

  const patterns = [
    /^ppomppu-.*\.csv$/,
    /^naver-.*\.csv$/,
    /^combined-네이버-.*\.csv$/,
    /^combined-뽐뿌-.*\.csv$/
  ];

  const selected = new Set();
  for (const p of patterns) {
    const f = findNewest(allFiles, p);
    if (f) selected.add(f);
  }

  // fallback: if none matched patterns, attach newest CSV(s)
  if (!selected.size) {
    // pick up to 4 newest
    const filesWithTime = allFiles.map(f => ({ f, t: fs.statSync(path.join(dataDir, f)).mtimeMs }));
    filesWithTime.sort((a,b)=>b.t-a.t);
    filesWithTime.slice(0,4).forEach(x => selected.add(x.f));
  }

  const attachments = Array.from(selected).map(f => ({ filename: f, path: path.join(dataDir, f) }));
  if (!attachments.length) {
    console.error('No CSV attachments found');
    process.exit(1);
  }
  console.log('Attachments to send:', attachments.map(a => a.filename).join(', '));

  // sensible defaults so only user/pass need to be provided in .env
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = (process.env.SMTP_SECURE === 'true') || false;
  const toRaw = process.env.EMAIL_TO || user;
  const from = process.env.EMAIL_FROM || user;
  // support comma-separated multiple recipients
  const toList = (typeof toRaw === 'string') ? toRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const to = toList.join(', ');

  if (!user || !pass) {
    console.error('Missing SMTP credentials. Set SMTP_USER and SMTP_PASS in your environment.');
    process.exit(1);
  }

  // show masked SMTP config for debugging
  const mask = s => (typeof s === 'string' && s.length) ? (s.slice(0,2) + '***' + s.slice(-1)) : '';
  console.log('SMTP config (using defaults where unset):', { host, port, secure, user: mask(user), from: mask(from), to });

  if (from !== user) {
    console.warn('Warning: EMAIL_FROM differs from SMTP_USER; some SMTP providers require the FROM address to match the authenticated user or be authorized as an alias.');
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

  try {
    await transporter.verify();
    console.log('SMTP connection verified');
  } catch (e) {
    console.error('SMTP connection failed:', e && e.message ? e.message : e);
    process.exit(1);
  }

  const subject = process.env.EMAIL_SUBJECT || `Scrapers CSV ${new Date().toISOString().slice(0,10)}`;
  const text = process.env.EMAIL_TEXT || 'Attached are the latest CSV results from the scrapers.';

  try {
    const info = await transporter.sendMail({ from, to, subject, text, attachments });
    console.log('Email sent:', info.messageId);
  } catch (err) {
    console.error('Failed to send email:', err.message || err);
    process.exit(1);
  }
})();
