// Renders a seating plan as a vector PDF, A4 landscape — the sheet that gets
// taped to the wall next to the tables.
//
// The browser sends geometry that is ALREADY resolved: every seat arrives as an
// absolute centre point in room pixels, with table rotation baked in. So this
// file owns no layout logic at all and cannot drift away from what the screen
// shows. It only scales room pixels to points and draws.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// העברית מסודרת כאן ולא דרך lib/rtl.js — ראו את ההסבר ב-lib/staff-bday-pdf.js:
// האריזה של Netlify שברה את הייבוא חוצה-המודולים, והפונקציות קצרות מספיק.
const WS = /\s+/;
function wordsOf(text) {
  const s = String(text == null ? '' : text).trim();
  return s ? s.split(WS) : [];
}
function lineWidth(doc, words) {
  if (!words.length) return 0;
  const space = doc.widthOfString(' ');
  return words.reduce((sum, w) => sum + doc.widthOfString(w), 0) + space * (words.length - 1);
}
// מילה-מילה מימין לשמאל. PDFKit הופך את האותיות בתוך מילה בעצמו,
// אבל מסדר מילים משמאל לימין, ולכן הסדר נקבע כאן.
function drawWordsRtl(doc, words, right, y) {
  const sx = doc.x, sy = doc.y;
  const space = doc.widthOfString(' ');
  let cursor = right;
  for (const w of words) {
    cursor -= doc.widthOfString(w);
    doc.text(w, cursor, y, { lineBreak: false });
    doc.x = sx; doc.y = sy;
    cursor -= space;
  }
}
// שם בתוך עיגול: נשבר לשורות שנכנסות לרוחב, וממורכז סביב הנקודה
function drawCentered(doc, text, cx, cy, maxW, maxLines) {
  const words = wordsOf(text);
  if (!words.length) return;
  const lines = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && lineWidth(doc, cur.concat([w])) > maxW) { lines.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  const use = lines.slice(0, maxLines || 3);
  const lh = doc.currentLineHeight();
  const top = cy - (use.length * lh) / 2;
  use.forEach((ws, i) => drawWordsRtl(doc, ws, cx + lineWidth(doc, ws) / 2, top + i * lh));
}

// הסמלים 🪑 ו-👀 שעל הגלולות במסך — אין להם גליף ב-Heebo, ופונט אמוג'י
// שוקל עשרות מגה ונשבר ב-fontkit. שתי צורות וקטוריות קצרות עושות את
// אותו דבר, מודפסות חד גם בשחור-לבן, וגדלות עם הדף.
function drawMarkIcon(doc, kind, x, y, s, color) {
  doc.save();
  doc.lineWidth(Math.max(0.45, s * 0.1)).strokeColor(color).fillColor(color)
     .lineJoin('round').lineCap('round');
  if (kind === 'chair') {                      // כיסא מהצד: גב, מושב, רגליים
    doc.moveTo(x + s * 0.26, y + s * 0.05)
       .lineTo(x + s * 0.26, y + s * 0.60)
       .lineTo(x + s * 0.86, y + s * 0.60).stroke();
    doc.moveTo(x + s * 0.32, y + s * 0.60).lineTo(x + s * 0.32, y + s * 0.95).stroke();
    doc.moveTo(x + s * 0.80, y + s * 0.60).lineTo(x + s * 0.80, y + s * 0.95).stroke();
  } else {                                     // עין: שתי קשתות ואישון
    const cx = x + s / 2, cy = y + s / 2, rw = s * 0.46, rh = s * 0.30;
    doc.moveTo(cx - rw, cy)
       .quadraticCurveTo(cx, cy - rh * 1.9, cx + rw, cy)
       .quadraticCurveTo(cx, cy + rh * 1.9, cx - rw, cy).stroke();
    doc.circle(cx, cy, s * 0.15).fill();
  }
  doc.restore();
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

// אותם צבעים בדיוק כמו על המסך, כדי שהדף המודפס לא יפתיע
const C = {
  ink: '#3D3228', muted: '#9B8E82', brand: '#1F3D34',
  surface: '#efe6d8', surfaceLine: '#ddd0bb',
  emptyLine: '#ddd0bb',
  childLine: '#cfe0ec', childFill: '#eef5fb', childInk: '#2c4d66',
  staffLine: '#eccfc2', staffFill: '#fbf1ec', staffInk: '#8a4d33',
};

const ROOM_W = 1123, ROOM_H = 794, SEAT_R = 27;

function buildSeatingPdf(sheet) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      doc.registerFont('he', fontPath('Heebo-Regular.ttf'));
      doc.registerFont('heB', fontPath('Heebo-Bold.ttf'));

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = doc.page.width, PH = doc.page.height;   // 841.89 × 595.28
      const M = 22, HEAD = 26;

      // כותרת: שם הסידור מימין, תאריך ומניין משמאל
      doc.font('heB').fontSize(13).fillColor(C.brand);
      const title = wordsOf(sheet.name || 'סידור ישיבה');
      drawWordsRtl(doc, title, PW - M, M);
      doc.font('he').fontSize(9).fillColor(C.muted);
      doc.text(String(sheet.meta || ''), M, M + 4, { lineBreak: false });

      // הקטנת החדר כך שייכנס לשוליים, במרכז הדף
      const availW = PW - M * 2, availH = PH - M * 2 - HEAD;
      const k = Math.min(availW / ROOM_W, availH / ROOM_H);
      const ox = M + (availW - ROOM_W * k) / 2;
      const oy = M + HEAD + (availH - ROOM_H * k) / 2;
      const X = px => ox + px * k, Y = py => oy + py * k;
      // גודל התוכן שנבחר במסך — הקואורדינטות כבר מגיעות מוגדלות, אבל
      // רדיוס הכיסא וגודל הכתב נגזרים כאן ולכן צריכים אותו במפורש
      const z = sheet.zoom || 1;

      // משטחי השולחנות, בגוון של מי שאחראית עליהם. שתי אחראיות — חצי-חצי,
      // שכל מחצית נחתכת מהמלבן המסובב (clip) כדי שהחלוקה תסתובב עם השולחן.
      (sheet.tables || []).forEach(t => {
        const x = X(t.x), y = Y(t.y), w = t.w * k, h = t.h * k;
        const fills = (t.fills && t.fills.length) ? t.fills : [C.surface];
        const shape = () => {
          if (t.shape === 'round') doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
          else doc.roundedRect(x, y, w, h, 7 * k);
        };
        doc.save();
        if (t.rot) doc.rotate(t.rot, { origin: [x + w / 2, y + h / 2] });
        if (fills.length === 1) { shape(); doc.fillColor(fills[0]).fill(); }
        else {
          const bw = w / fills.length;
          fills.forEach((f, i) => {
            doc.save(); shape(); doc.clip();
            doc.rect(x + i * bw, y, bw, h).fillColor(f).fill();
            doc.restore();
          });
        }
        if (t.line) { shape(); doc.lineWidth(Math.max(0.8, 2 * k)).strokeColor(t.line).stroke(); }
        doc.restore();
      });

      // הכיסאות — נקודות מוחלטות שהדפדפן כבר חישב, כולל סיבוב
      const r = SEAT_R * k * z;
      (sheet.seats || []).forEach(s => {
        const cx = X(s.x), cy = Y(s.y);
        doc.circle(cx, cy, r);
        if (s.kind === 'staff') doc.fillColor(C.staffFill).fill();
        else if (s.kind === 'child') doc.fillColor(C.childFill).fill();
        else doc.fillColor('#ffffff').fill();

        doc.circle(cx, cy, r).lineWidth(Math.max(0.7, 1.6 * k));
        if (s.kind === 'staff') doc.strokeColor(C.staffLine).stroke();
        else if (s.kind === 'child') doc.strokeColor(C.childLine).stroke();
        else doc.dash(3, { space: 2 }).strokeColor(C.emptyLine).stroke().undash();

        if (!s.label) return;
        doc.font('heB').fontSize(Math.max(5.6, 10.5 * k * z))
           .fillColor(s.kind === 'staff' ? C.staffInk : C.childInk);
        drawCentered(doc, s.label, cx, cy, r * 1.85, 3);
      });

      // שם השולחן במרכזו, תמיד זקוף גם כששולחן מסובב — ואחרי הכיסאות,
      // כדי שעיגול שנוגע במרכז לא יחתוך אותיות מהשם
      doc.font('heB').fontSize(Math.max(7, 12 * k * z)).fillColor(C.muted);
      (sheet.tables || []).forEach(t => {
        drawCentered(doc, t.name, X(t.x + t.w / 2), Y(t.y + t.h / 2), t.w * k * 0.8, 2);
      });

      // סמני צוות שלא יושבים בתוך שולחן — גלולה בצבע של אותה גננת
      (sheet.marks || []).forEach(m => {
        doc.font('heB').fontSize(Math.max(6, 10.5 * k * z));
        const words = wordsOf(m.label);
        const tw = lineWidth(doc, words);
        const padX = 9 * k * z, hh = 20 * k * z;
        const ic = hh * 0.62, gap = ic * 0.45;               // הסמל יושב משמאל, כמו במסך
        const w = tw + padX * 2 + ic + gap, x = X(m.x), y = Y(m.y);
        doc.roundedRect(x, y, w, hh, hh / 2).fillColor('#ffffff').fill();
        doc.roundedRect(x, y, w, hh, hh / 2).lineWidth(Math.max(0.7, 1.6 * k))
           .strokeColor(m.color || C.brand).stroke();
        drawMarkIcon(doc, m.icon === 'chair' ? 'chair' : 'watch',
                     x + padX, y + (hh - ic) / 2, ic, m.color || C.brand);
        doc.fillColor(m.color || C.brand);
        drawWordsRtl(doc, words, x + w - padX, y + (hh - doc.currentLineHeight()) / 2);
      });

      // הערת שוליים: מה שנשאר פתוח, כדי שהדף יספר את האמת
      if (sheet.note) {
        doc.font('he').fontSize(8).fillColor(C.muted);
        drawWordsRtl(doc, wordsOf(sheet.note), PW - M, PH - M - 10);
      }

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { buildSeatingPdf };
