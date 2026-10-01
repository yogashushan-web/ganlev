// תוכנית חדר השינה כ-PDF וקטורי — הדף שנתלה בחדר.
//
// כמו ב-seating-pdf, הדפדפן שולח גאומטריה פתורה: הכל בסנטימטרים עם אפס
// בפינת החדר. כאן זה אפילו נקי יותר, כי מאז תיקון מערכת הצירים לחדר יש
// מידות משלו — ולכן הקובץ הזה רק ממיר סנטימטרים לנקודות ומצייר.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// עברית ב-PDFKit: ראו את ההסבר ב-lib/staff-bday-pdf.js. הפונקציות
// מוטמעות כאן ולא מיובאות, כי האריזה של Netlify שברה את הייבוא.
const WS = /\s+/;
function wordsOf(t) {
  const s = String(t == null ? '' : t).trim();
  return s ? s.split(WS) : [];
}
function lineWidth(doc, words) {
  if (!words.length) return 0;
  const sp = doc.widthOfString(' ');
  return words.reduce((a, w) => a + doc.widthOfString(w), 0) + sp * (words.length - 1);
}
function drawWordsRtl(doc, words, right, y) {
  const sx = doc.x, sy = doc.y, sp = doc.widthOfString(' ');
  let cur = right;
  for (const w of words) {
    cur -= doc.widthOfString(w);
    doc.text(w, cur, y, { lineBreak: false });
    doc.x = sx; doc.y = sy;
    cur -= sp;
  }
}
function wrapLines(doc, text, maxW, maxLines) {
  const words = wordsOf(text);
  if (!words.length) return [];
  const lines = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && lineWidth(doc, cur.concat([w])) > maxW) { lines.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines.slice(0, maxLines || 3);
}
function drawCentered(doc, text, cx, top, maxW, maxLines) {
  const lines = wrapLines(doc, text, maxW, maxLines);
  const lh = doc.currentLineHeight();
  lines.forEach((ws, i) => drawWordsRtl(doc, ws, cx + lineWidth(doc, ws) / 2, top + i * lh));
  return lines.length * lh;
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

const C = {
  ink: '#3D3228', muted: '#9B8E82', brand: '#1F3D34',
  wall: '#cbbfa9', floor: '#fffdf9',
  matLine: '#cfe0ec', matFill: '#eef5fb', matInk: '#2c4d66', matSub: '#7c93a6',
  pottyLine: '#e0c08a', pottyFill: '#fdf6e9', pottyInk: '#8a6a23', pottySub: '#b8801f',
  obsFill: '#e7e0d4', obsLine: '#c9bda9', obsInk: '#6f6457',
  staff: '#C4846C',
};

function buildNapPdf(sheet) {
  return new Promise((resolve, reject) => {
    try {
      const portrait = !!sheet.portrait;
      const doc = new PDFDocument({ size: 'A4', layout: portrait ? 'portrait' : 'landscape', margin: 0 });
      doc.registerFont('he', fontPath('Heebo-Regular.ttf'));
      doc.registerFont('heB', fontPath('Heebo-Bold.ttf'));

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = doc.page.width, PH = doc.page.height;
      const M = 24, HEAD = 28, FOOT = 34;

      // כותרת: שם הסידור מימין, תאריך ומניין משמאל
      doc.font('heB').fontSize(13).fillColor(C.brand);
      drawWordsRtl(doc, wordsOf(sheet.name || 'סידור מזרונים'), PW - M, M);
      doc.font('he').fontSize(9).fillColor(C.muted);
      doc.text(String(sheet.meta || ''), M, M + 4, { lineBreak: false });

      // החדר ממורכז בשטח שנותר. k = נקודות לכל סנטימטר.
      const room = sheet.room || { w: 400, h: 300 };
      const availW = PW - M * 2, availH = PH - M * 2 - HEAD - FOOT;
      const k = Math.min(availW / room.w, availH / room.h) * (sheet.zoom || 1);
      const ox = M + (availW - room.w * k) / 2;
      const oy = M + HEAD + (availH - room.h * k) / 2;
      const X = cm => ox + cm * k, Y = cm => oy + cm * k, L = cm => cm * k;

      // קירות — מסגרת החדר
      doc.roundedRect(X(0), Y(0), L(room.w), L(room.h), 3).fillColor(C.floor).fill();
      doc.roundedRect(X(0), Y(0), L(room.w), L(room.h), 3)
         .lineWidth(Math.max(1.4, 3 * k)).strokeColor(C.wall).stroke();

      // המזרונים: שם גדול, וטקס ההירדמות מתחתיו בכתב קטן
      (sheet.mats || []).forEach(m => {
        const x = X(m.x), y = Y(m.y), w = L(m.w), h = L(m.h);
        const potty = !!m.potty;
        doc.roundedRect(x, y, w, h, 4 * k)
           .fillColor(potty ? C.pottyFill : C.matFill).fill();
        doc.roundedRect(x, y, w, h, 4 * k).lineWidth(Math.max(.7, 1.8 * k));
        if (potty) doc.dash(4, { space: 2.5 }).strokeColor(C.pottyLine).stroke().undash();
        else doc.strokeColor(C.matLine).stroke();

        if (!m.name) return;
        const pad = 4 * k;
        doc.font('heB').fontSize(Math.max(5.5, 11 * k)).fillColor(potty ? C.pottyInk : C.matInk);
        const nameLines = wrapLines(doc, m.name, w - pad * 2, 2);
        const nameH = nameLines.length * doc.currentLineHeight();

        let ritH = 0, ritLines = [];
        if (m.ritual) {
          doc.font('he').fontSize(Math.max(4.6, 8.4 * k));
          ritLines = wrapLines(doc, m.ritual, w - pad * 2, 3);
          ritH = ritLines.length * doc.currentLineHeight();
        }
        let top = y + (h - nameH - ritH) / 2;
        doc.font('heB').fontSize(Math.max(5.5, 11 * k)).fillColor(potty ? C.pottyInk : C.matInk);
        const nlh = doc.currentLineHeight();
        nameLines.forEach((ws, i) => drawWordsRtl(doc, ws, x + w / 2 + lineWidth(doc, ws) / 2, top + i * nlh));
        if (ritLines.length) {
          top += nameH + 1 * k;
          doc.font('he').fontSize(Math.max(4.6, 8.4 * k)).fillColor(potty ? C.pottySub : C.matSub);
          const rlh = doc.currentLineHeight();
          ritLines.forEach((ws, i) => drawWordsRtl(doc, ws, x + w / 2 + lineWidth(doc, ws) / 2, top + i * rlh));
        }
      });

      // פריטים קבועים — מצויירים *מעל* המזרונים. עמוד שמזרן הונח
      // עליו חייב להיראות; אחרת ההתנגשות נעלמת מהדף בדיוק במקום
      // שבו היא הכי חשובה.
      (sheet.items || []).forEach(it => {
        const x = X(it.x), y = Y(it.y), w = L(it.w), h = L(it.h);
        doc.save();
        if (it.rot) doc.rotate(it.rot, { origin: [x + w / 2, y + h / 2] });
        if (it.kind === 'door') {
          doc.moveTo(x, y + h / 2).lineTo(x + w, y + h / 2)
             .lineWidth(Math.max(1.2, 4 * k)).strokeColor('#fff').stroke();
          doc.moveTo(x, y + h / 2).lineTo(x + w, y + h / 2)
             .lineWidth(Math.max(.6, 1.4 * k)).dash(3, { space: 2 })
             .strokeColor(C.obsLine).stroke().undash();
        } else {
          doc.roundedRect(x, y, w, h, 3 * k).fillColor(C.obsFill).fill();
          doc.roundedRect(x, y, w, h, 3 * k).lineWidth(Math.max(.6, 1.4 * k))
             .strokeColor(C.obsLine).stroke();
        }
        doc.font('heB').fontSize(Math.max(5, 9 * k)).fillColor(C.obsInk);
        const lh = doc.currentLineHeight();
        drawCentered(doc, it.name, x + w / 2, y + h / 2 - lh / 2, w * 0.9, 1);
        doc.restore();
      });

      // סמני צוות — עיגול עם השם מתחתיו, כמו בסידור הישיבה
      (sheet.staff || []).forEach(st => {
        const r = Math.max(7, 27 * k), cx = X(st.x) + r, cy = Y(st.y) + r;
        doc.circle(cx, cy, r).fillColor('#ffffff').fill();
        doc.circle(cx, cy, r).lineWidth(Math.max(.9, 2.4 * k)).strokeColor(C.staff).stroke();
        // דמות פשוטה: ראש וכתפיים
        doc.circle(cx, cy - r * 0.22, r * 0.26).fillColor(C.staff).fill();
        doc.moveTo(cx - r * 0.42, cy + r * 0.46)
           .quadraticCurveTo(cx, cy - r * 0.1, cx + r * 0.42, cy + r * 0.46)
           .lineWidth(Math.max(.8, 2 * k)).strokeColor(C.staff).stroke();

        doc.font('heB').fontSize(Math.max(5, 9.5 * k));
        const words = wordsOf(st.name);
        const tw = lineWidth(doc, words), pad = 6 * k;
        const hh = doc.currentLineHeight() + 3 * k;
        const bx = cx - (tw + pad * 2) / 2, by = cy + r + 3 * k;
        doc.roundedRect(bx, by, tw + pad * 2, hh, hh / 2).fillColor('#ffffff').fill();
        doc.roundedRect(bx, by, tw + pad * 2, hh, hh / 2)
           .lineWidth(Math.max(.5, 1.2 * k)).strokeColor(C.staff).stroke();
        doc.fillColor(C.staff);
        drawWordsRtl(doc, words, bx + tw + pad, by + 1.5 * k);
      });

      // מקרא + סרגל קנה מידה בתחתית הדף
      const yL = PH - M - 16;
      doc.font('heB').fontSize(8.5);
      const legend = sheet.legend || [];
      if (legend.length) {
        const sw = 7, gap = 4, pad = 14;
        const widths = legend.map(r => {
          const n = lineWidth(doc, wordsOf(r.name));
          doc.font('he');
          const d = lineWidth(doc, wordsOf(r.note || ''));
          doc.font('heB');
          return sw + gap + n + (d ? gap + d : 0);
        });
        const total = widths.reduce((a, b) => a + b, 0) + pad * (legend.length - 1);
        let cur = (PW + total) / 2;
        legend.forEach((r, i) => {
          cur -= widths[i];
          doc.roundedRect(cur + widths[i] - sw, yL + 1.5, sw, sw, 1.5).fillColor(r.color).fill();
          doc.font('heB').fillColor(C.ink);
          const nW = lineWidth(doc, wordsOf(r.name));
          drawWordsRtl(doc, wordsOf(r.name), cur + widths[i] - sw - gap, yL);
          if (r.note) {
            doc.font('he').fillColor(C.muted);
            drawWordsRtl(doc, wordsOf(r.note), cur + widths[i] - sw - gap - nW - gap, yL);
          }
          cur -= pad;
        });
      }

      // סרגל: מטר אחד, כדי שאפשר יהיה למדוד מהדף
      const barX = PW - M - L(100), barY = PH - M - 6;
      doc.moveTo(barX, barY - 5).lineTo(barX, barY).lineTo(barX + L(100), barY)
         .lineTo(barX + L(100), barY - 5)
         .lineWidth(1).strokeColor(C.muted).stroke();
      doc.font('he').fontSize(7.5).fillColor(C.muted);
      drawWordsRtl(doc, wordsOf('1 מטר'), barX - 4, barY - 8);

      // מידות החדר, משמאל
      doc.font('he').fontSize(8).fillColor(C.muted);
      doc.text(`${(room.w / 100).toFixed(2)} × ${(room.h / 100).toFixed(2)} m`, M, barY - 9, { lineBreak: false });

      if (sheet.note) {
        doc.font('he').fontSize(8).fillColor(C.muted);
        drawWordsRtl(doc, wordsOf(sheet.note), PW - M, PH - M - 26);
      }

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { buildNapPdf };
