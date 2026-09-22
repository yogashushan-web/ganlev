// Renders the staff birthday board as a PDF (A4 portrait).
// Same Hebrew machinery as the parent roster: lib/rtl.js + the bundled Heebo fonts.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// העברית מסודרת כאן ולא דרך lib/rtl.js: האריזה של Netlify לפונקציה הזו
// החזירה "drawRtl is not a function" למרות שהמודול תקין ועובד מקומית.
// שתי הפונקציות קצרות ויציבות, והטמעתן מבטלת את התלות חוצת-המודולים.
// ההסבר המלא למה PDFKit צריך את זה נמצא ב-lib/rtl.js.
const WS = /\s+/;
function wordsOf(text) {
  const s = String(text == null ? '' : text).trim();
  return s ? s.split(WS) : [];
}
function measureRtl(doc, text) {
  const words = wordsOf(text);
  if (!words.length) return 0;
  const space = doc.widthOfString(' ');
  return words.reduce((sum, w) => sum + doc.widthOfString(w), 0) + space * (words.length - 1);
}
function drawRtl(doc, text, x, y, width, opts = {}) {
  const words = wordsOf(text);
  if (!words.length) return;
  const sx = doc.x, sy = doc.y;
  const restore = () => { doc.x = sx; doc.y = sy; };
  if (opts.align === 'left') {
    doc.text(words.join(' '), x, y, { lineBreak: false });
    restore();
    return;
  }
  const space = doc.widthOfString(' ');
  const total = measureRtl(doc, text);
  let cursor = x + Math.max(width, total);
  for (const word of words) {
    const w = doc.widthOfString(word);
    cursor -= w;
    doc.text(word, cursor, y, { lineBreak: false });
    restore();
    cursor -= space;
  }
}

function fontPath(name) {
  const tries = [
    path.join(__dirname, '..', 'assets', name),
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'crm', 'netlify', 'functions', 'assets', name),
    path.join(process.cwd(), 'crm', 'netlify', 'functions', 'assets', name),
  ];
  const hit = tries.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
  if (!hit) throw new Error('לא נמצא קובץ הפונט ' + name);
  return hit;
}

const INK = '#2b2b2b', MUTED = '#9B8E82', BRAND = '#1F3D34', LINE = '#e6dfd4', BAND = '#faf7f2', SOON = '#C4846C';

const COLS = [
  { key: 'name',    title: 'שם',          w: 150, bold: true },
  { key: 'date',    title: 'תאריך',        w: 90 },
  { key: 'weekday', title: 'יום',          w: 66 },
  { key: 'age',     title: 'גיל',          w: 54 },
  { key: 'inDays',  title: 'בעוד',         w: 78 },
  { key: 'role',    title: 'תפקיד',        w: 100 },
];

const M = 30, ROW_H = 27, HEAD_H = 30;

function hebDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function cell(doc, text, x, y, w, opts = {}) {
  const value = (text == null ? '' : String(text)).trim();
  if (!value) return;
  doc.font(opts.bold ? 'bold' : 'reg');
  const base = opts.size || 11;
  const inner = w - 12;
  let size = base;
  doc.fontSize(size);
  while (size > 7 && measureRtl(doc, value) > inner) { size -= 0.5; doc.fontSize(size); }
  doc.fillColor(opts.color || INK);
  drawRtl(doc, value, x + 6, y + (opts.dy == null ? 7 : opts.dy) + (base - size) / 2, inner);
}

function tableHead(doc, pageW, y) {
  doc.rect(M, y, pageW - M * 2, HEAD_H).fill(BRAND);
  let x = pageW - M;
  COLS.forEach(c => { x -= c.w; cell(doc, c.title, x, y, c.w, { bold: true, color: '#fff', size: 10.5, dy: 9 }); });
  return y + HEAD_H;
}

function buildStaffBdayPdf(rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: false });
    doc.registerFont('reg', fontPath('Heebo-Regular.ttf'));
    doc.registerFont('bold', fontPath('Heebo-Bold.ttf'));

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const stamp = hebDate(new Date());
    doc.addPage();
    const pageW = doc.page.width, pageH = doc.page.height;

    doc.font('bold').fontSize(20).fillColor(BRAND);
    drawRtl(doc, '🎂 ימי ההולדת של הצוות', M, M, pageW - M * 2);
    doc.font('reg').fontSize(10).fillColor(MUTED);
    drawRtl(doc, `${rows.length} אנשי צוות · לפי הקרוב ביותר · עודכן ${stamp}`, M, M + 28, pageW - M * 2);

    let y = tableHead(doc, pageW, M + 56);
    rows.forEach((r, i) => {
      if (y + ROW_H > pageH - M - 18) { doc.addPage(); y = tableHead(doc, pageW, M); }
      if (i % 2 === 1) doc.rect(M, y, pageW - M * 2, ROW_H).fill(BAND);
      let x = pageW - M;
      COLS.forEach(c => {
        x -= c.w;
        const soon = c.key === 'inDays' && r.days <= 7;
        cell(doc, r[c.key], x, y, c.w, {
          bold: c.bold || soon,
          color: soon ? SOON : (c.bold ? BRAND : INK),
        });
      });
      doc.moveTo(M, y + ROW_H).lineTo(pageW - M, y + ROW_H).lineWidth(0.5).strokeColor(LINE).stroke();
      y += ROW_H;
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('reg').fontSize(8.5).fillColor(MUTED);
      drawRtl(doc, 'גן לב · צילום מצב מתאריך ' + stamp, M, pageH - M + 4, pageW - M * 2);
    }
    doc.end();
  });
}

module.exports = { buildStaffBdayPdf };
