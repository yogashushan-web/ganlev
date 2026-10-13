// גיליון מדבקות שמות לגזירה — A4, שמונה בדף.
//
// תולים על תא אישי, קולב, מגירה או מזרן. לכן: צורה אחת לכל הגיליון
// (כדי שאפשר יהיה להדפיס עוד אחת לילד חדש והיא תיראה אותו דבר),
// שם גדול ככל שנכנס, וקו גזירה עדין.
//
// הצורות מורכבות מעיגולים ומלבנים ולא מעקומות בזייה שנכתבו ביד:
// ענן שמורכב מארבעה עיגולים נראה כמו ענן, ועקומה שנכתבה בעיוורון
// נראית כמו טעות. הכוכב והלב כן מחושבים, כי להם יש נוסחה.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// העברית מסודרת כאן ולא דרך lib/rtl.js — ראו את ההסבר ב-lib/seating-pdf.js
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

// ---- הצורות ----
// כל צורה מציירת בתוך ריבוע 100×100, ומחזירה את התיבה שבה מותר
// לכתוב — כי במרכז של כוכב יש הרבה פחות מקום מאשר במרכז של ענן.
const SHAPES = {
  cloud: {
    name: 'ענן',
    box: [0.13, 0.36, 0.87, 0.70],
    draw(doc) {
      doc.circle(32, 50, 19);
      doc.circle(53, 42, 23);
      doc.circle(74, 52, 17);
      doc.roundedRect(15, 50, 72, 22, 11);
    },
  },
  star: {
    name: 'כוכב',
    box: [0.20, 0.36, 0.80, 0.60],
    draw(doc) {
      const cx = 50, cy = 52, R = 46, r = 19;
      let d = '';
      for (let i = 0; i < 10; i++) {
        const rad = (i % 2 ? r : R);
        const a = -Math.PI / 2 + i * Math.PI / 5;
        d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(2) + ' '
                             + (cy + rad * Math.sin(a)).toFixed(2) + ' ';
      }
      doc.path(d + 'Z');
    },
  },
  heart: {
    name: 'לב',
    box: [0.19, 0.30, 0.81, 0.60],
    draw(doc) {
      // שני חצאי עיגול למעלה ושתי עקומות שנפגשות בקצה התחתון
      doc.path('M50 88 C20 66 8 52 8 36 C8 22 19 13 31 13 C40 13 46 18 50 25 '
             + 'C54 18 60 13 69 13 C81 13 92 22 92 36 C92 52 80 66 50 88 Z');
    },
  },
  flower: {
    name: 'פרח',
    box: [0.24, 0.38, 0.76, 0.62],
    draw(doc) {
      // שש עלי כותרת צרים סביב מרכז גדול. עלים רחבים מדי נבלעים זה
      // בזה והצורה נקראת ככתם ולא כפרח.
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        doc.ellipse(50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a), 17, 13);
      }
      doc.circle(50, 50, 24);
    },
  },
  balloon: {
    name: 'בלון',
    box: [0.19, 0.24, 0.81, 0.56],
    draw(doc) {
      doc.ellipse(50, 40, 33, 37);
      doc.path('M45 75 L55 75 L50 85 Z');
    },
  },
};

const PALETTE = {
  cloud:   { fill: '#DCE9F3', line: '#A9C6DC', ink: '#2C4D66' },
  star:    { fill: '#FBEFCF', line: '#E3C274', ink: '#7A5A14' },
  heart:   { fill: '#F7DFE2', line: '#E0A9B2', ink: '#7D3B47' },
  flower:  { fill: '#E7E2EF', line: '#BDB2CF', ink: '#4A3C66' },
  balloon: { fill: '#DEEDE4', line: '#A5C6BD', ink: '#2A5446' },
};

// שם שמופיע יותר מפעם אחת מקבל גם שם משפחה — ורק הוא. כלל 14.
function labelsFor(children) {
  const count = {};
  children.forEach(c => {
    const f = String(c.first || '').trim();
    count[f] = (count[f] || 0) + 1;
  });
  return children.map(c => {
    const f = String(c.first || '').trim();
    const l = String(c.last || '').trim();
    return (count[f] > 1 && l) ? { big: f, small: l } : { big: f, small: '' };
  });
}

function buildTagsPdf(sheet) {
  return new Promise((resolve, reject) => {
    try {
      const shapeKey = SHAPES[sheet.shape] ? sheet.shape : 'cloud';
      const S = SHAPES[shapeKey];
      const C = PALETTE[shapeKey];

      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      doc.registerFont('he', fontPath('Alef-Regular.ttf'));
      doc.registerFont('heB', fontPath('Alef-Bold.ttf'));
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = doc.page.width, PH = doc.page.height;   // 595 × 842
      const M = 26, COLS = 2, ROWS = 4, PER = COLS * ROWS;
      const cw = (PW - M * 2) / COLS;
      const ch = (PH - M * 2) / ROWS;

      const items = labelsFor(sheet.children || []);
      if (!items.length) throw new Error('אין ילדים להדפסה');

      items.forEach((it, i) => {
        if (i && i % PER === 0) doc.addPage();
        const k = i % PER;
        const x = M + (k % COLS) * cw;
        const y = M + Math.floor(k / COLS) * ch;

        // קו גזירה — דק ומקווקו, כדי שלא יתחרה בצורה עצמה
        doc.roundedRect(x + 3, y + 3, cw - 6, ch - 6, 7)
           .lineWidth(0.4).dash(3, { space: 3 })
           .strokeColor('#D8D2C8').stroke().undash();

        // הצורה, בריבוע הגדול ביותר שנכנס לתא
        const side = Math.min(cw - 20, ch - 16);
        const sx = x + (cw - side) / 2, sy = y + (ch - side) / 2;

        // קו המתאר נוצר מציור כפול: פעם אחת בצבע הקו, ומעליו אותה
        // צורה מוקטנת מעט בצבע המילוי. **לא stroke** — צורה שמורכבת
        // מכמה עיגולים מקבלת בקו מתאר גם את כל הקשתות הפנימיות, וענן
        // נראה אז כמו שלושה עיגולים ולא כענן.
        const paint = (shrink, color) => {
          doc.save();
          doc.translate(sx, sy).scale(side / 100);
          if (shrink !== 1) doc.translate(50, 50).scale(shrink).translate(-50, -50);
          S.draw(doc);
          doc.fillColor(color).fill();
          doc.restore();
        };
        paint(1, C.line);
        paint(0.955, C.fill);

        // ---- השם ----
        const [bx0, by0, bx1, by1] = S.box;
        const bx = sx + bx0 * side, bw = (bx1 - bx0) * side;
        const by = sy + by0 * side, bh = (by1 - by0) * side;

        const hasSmall = !!it.small;
        let fs = Math.min(bh * (hasSmall ? 0.58 : 0.92), bw * 0.46);
        doc.font('heB');
        // הקטנה עד שהשם נכנס לרוחב שהצורה הזו באמת מאפשרת
        for (let t = 0; t < 14 && fs > 7; t++) {
          doc.fontSize(fs);
          if (lineWidth(doc, wordsOf(it.big)) <= bw) break;
          fs *= 0.9;
        }
        doc.fontSize(fs).fillColor(C.ink);
        const bigW = lineWidth(doc, wordsOf(it.big));
        const bigH = doc.currentLineHeight();
        const totalH = bigH + (hasSmall ? bigH * 0.52 : 0);
        const top = by + (bh - totalH) / 2;
        drawWordsRtl(doc, wordsOf(it.big), bx + (bw + bigW) / 2, top);

        if (hasSmall) {
          doc.font('he').fontSize(fs * 0.46);
          const sw = lineWidth(doc, wordsOf(it.small));
          drawWordsRtl(doc, wordsOf(it.small), bx + (bw + sw) / 2, top + bigH);
        }
      });

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { buildTagsPdf, SHAPES, PALETTE, labelsFor };
