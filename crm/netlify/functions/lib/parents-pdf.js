// Renders the parent contact roster as a PDF (A4 landscape).
// Hebrew is written in visual order — see lib/rtl.js for why.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { visual: V } = require('./rtl');

// The bundler flattens the function, so __dirname is not where the fonts land.
// Netlify copies `included_files` in relative to the repo root — try both.
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

const REG = () => fontPath('Heebo-Regular.ttf');
const BOLD = () => fontPath('Heebo-Bold.ttf');

const INK = '#2b2b2b', MUTED = '#9B8E82', BRAND = '#1F3D34', LINE = '#e6dfd4', BAND = '#faf7f2';

// Right-to-left: the first column starts at the right edge and walks left.
const COLS = [
  { key: 'child',   title: 'שם הילד/ה', w: 132, bold: true },
  { key: 'parent1', title: 'הורה',       w: 116 },
  { key: 'phone1',  title: 'טלפון',      w: 100, ltr: true },
  { key: 'parent2', title: 'הורה',       w: 116 },
  { key: 'phone2',  title: 'טלפון',      w: 100, ltr: true },
  { key: 'address', title: 'כתובת',      w: 218 },
];

const M = 28;
const ROW_H = 26;
const HEAD_H = 30;

function hebDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Draw one cell's text, right-aligned inside its box (or left-aligned for phones).
// An unusually long name or address shrinks a little rather than getting clipped.
function cell(doc, text, x, y, w, opts = {}) {
  const t = (opts.ltr ? String(text || '') : V(text)) || (opts.ltr ? '' : V('—'));
  const font = opts.bold ? 'bold' : 'reg';
  const inner = w - 12;

  let size = opts.size || 10.5;
  doc.font(font).fontSize(size);
  while (size > 7 && doc.widthOfString(t) > inner) {
    size -= 0.5;
    doc.fontSize(size);
  }

  doc.fillColor(opts.color || INK);
  doc.text(t, x + 6, y + (opts.dy == null ? 7 : opts.dy) + (((opts.size || 10.5) - size) / 2), {
    width: inner,
    align: opts.ltr ? 'left' : 'right',
    lineBreak: false,
    ellipsis: true,
  });
}

function header(doc, pageW, generatedAt, total) {
  doc.font('bold').fontSize(19).fillColor(BRAND)
    .text(V('רשימת קשר - גן לב'), M, M, { width: pageW - M * 2, align: 'right' });
  doc.font('reg').fontSize(10).fillColor(MUTED)
    .text(V(`${total} משפחות · עודכן ${generatedAt}`), M, M + 25, { width: pageW - M * 2, align: 'right' });
}

function tableHead(doc, pageW, y) {
  doc.rect(M, y, pageW - M * 2, HEAD_H).fill(BRAND);
  let x = pageW - M;
  COLS.forEach(c => {
    x -= c.w;
    cell(doc, c.title, x, y, c.w, { bold: true, color: '#fff', size: 10.5, dy: 9 });
  });
  return y + HEAD_H;
}

function buildPdf(rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, autoFirstPage: false });
    doc.registerFont('reg', REG());
    doc.registerFont('bold', BOLD());

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const stamp = hebDate(new Date());
    doc.addPage();
    const pageW = doc.page.width, pageH = doc.page.height;

    header(doc, pageW, stamp, rows.length);
    let y = tableHead(doc, pageW, M + 52);

    rows.forEach((r, i) => {
      if (y + ROW_H > pageH - M - 16) {          // next page
        doc.addPage();
        y = tableHead(doc, pageW, M);
      }
      if (i % 2 === 1) doc.rect(M, y, pageW - M * 2, ROW_H).fill(BAND);
      let x = pageW - M;
      COLS.forEach(c => {
        x -= c.w;
        cell(doc, r[c.key], x, y, c.w, { bold: c.bold, ltr: c.ltr, color: c.bold ? BRAND : INK });
      });
      doc.moveTo(M, y + ROW_H).lineTo(pageW - M, y + ROW_H).lineWidth(0.5).strokeColor(LINE).stroke();
      y += ROW_H;
    });

    // Footer on every page.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('reg').fontSize(8.5).fillColor(MUTED)
        .text(V('גן לב · הרשימה מתעדכנת אונליין — הקובץ הזה הוא צילום מצב מתאריך ' + stamp),
          M, pageH - M + 2, { width: pageW - M * 2, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}

module.exports = { buildPdf };
