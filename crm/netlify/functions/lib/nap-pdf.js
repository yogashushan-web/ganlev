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

// אותם ציורים שעל המסך, כאן כרשימת פעולות ציור. PDFKit יודע לקרוא
// נתיבי SVG דרך doc.path, ולכן נתוני הנתיב זהים מילה במילה לאלה
// שב-common.js — מה שמונע מהשניים להתרחק זה מזה.
const NAP_ICONS = {
  'בקבוק': [
    { p:'M10.3 5.3c0-2.1.3-3.8 1.7-3.8s1.7 1.7 1.7 3.8z', f:'#f0c9a8', s:'#d4a574', w:1 },
    { r:[8.5,5.2,7,2.5,1], f:'#d4a574' },
    { r:[7.4,7.6,9.2,13.9,3], f:'#eaf3fa', s:'#8fb2cd', w:1.2 },
    { p:'M9.6 11.2h3.2M9.6 14.2h3.2M9.6 17.2h3.2', s:'#8fb2cd', w:1.1 },
  ],
  'מוצץ': [
    { c:[12,4.4,2.6], s:'#e8a0b4', w:1.9 },
    { p:'M12 7.1c4.2 0 7.6 1.2 7.6 3.6 0 2.6-3 3.9-5.3 3.4-.9-.2-1.5-.6-2.3-.6s-1.4.4-2.3.6c-2.3.5-5.3-.8-5.3-3.4 0-2.4 3.4-3.6 7.6-3.6z', f:'#f6c9d4', s:'#e8a0b4', w:1.2 },
    { p:'M12 13.9c3.5 0 4.8 2.4 4.8 4.2 0 2.1-2.1 3.5-4.8 3.5s-4.8-1.4-4.8-3.5c0-1.8 1.3-4.2 4.8-4.2z', f:'#f0c9a8', s:'#d4a574', w:1.2 },
  ],
  'בובה': [
    { c:[6.8,7.2,3.1], f:'#d8ab7c' }, { c:[17.2,7.2,3.1], f:'#d8ab7c' },
    { c:[6.8,7.2,1.5], f:'#a87d52' }, { c:[17.2,7.2,1.5], f:'#a87d52' },
    { c:[12,13.6,7.5], f:'#d8ab7c' },
    { e:[12,16.4,3.9,3.1], f:'#f0dcc4' },
    { c:[9.2,11.8,1.2], f:'#4a3728' }, { c:[14.8,11.8,1.2], f:'#4a3728' },
    { e:[12,15.1,1.6,1.2], f:'#4a3728' },
  ],
  'שמיכה': [
    { p:'M4.6 6.8c0-1 .8-1.8 1.8-1.8h11.2c1 0 1.8.8 1.8 1.8v8.4c0 .6-.4 1-.9 1.2-1.9.6-3 1.9-5 2.4-1.3.3-2.5.3-3.8 0-2-.5-3.1-1.8-5-2.4-.5-.2-.9-.6-.9-1.2z', f:'#cfe0ec', s:'#8fb2cd', w:1.2 },
    { p:'M4.6 15.2c2.5-.9 4-.9 6 .3 2 1.2 3.5 1.2 6 .3 1-.3 1.9-.4 2.8-.3v2.3c0 .6-.4 1.1-1 1.3-1.9.6-3 1.8-4.9 2.3-1.3.3-2.5.3-3.8 0-2-.5-3-1.7-4.9-2.3-.6-.2-1-.7-1-1.3z', f:'#a8c4d8' },
    { p:'M8.2 9h7.6M8.2 12h7.6', s:'#8fb2cd', w:1.1 },
  ],
  'חיתול': [
    { p:'M3.6 6.2c0-.7.6-1.3 1.3-1.3h14.2c.7 0 1.3.6 1.3 1.3v3.6c0 5.4-3.6 9.1-8.4 12-4.8-2.9-8.4-6.6-8.4-12z', f:'#ffffff', s:'#8fb2cd', w:1.3 },
    { p:'M3.6 6.2c0-.7.6-1.3 1.3-1.3h4.3v3.9H3.6zM14.8 4.9h4.3c.7 0 1.3.6 1.3 1.3v2.6h-5.6z', f:'#cfe0ec' },
    { p:'M8.3 13.4c2.4 1.3 5 1.3 7.4 0', s:'#8fb2cd', w:1.2 },
    { c:[12,10.4,.9], f:'#cfe0ec' },
  ],
  'הנקה': [
    { p:'M3.4 21.6c0-5.4 3.2-9.4 7.2-9.4 1.6 0 3 .6 4.2 1.7', s:'#e8b48c', w:4 },
    { c:[8.6,5.6,3.6], f:'#e8b48c' },
    { p:'M12.2 15c3.8-1 7.2.6 7.8 3.2.5 2.1-1.2 3.8-3.6 3.8h-4.4c-1.6 0-2.6-1-2.6-2.4 0-1.8 1-3.8 2.8-4.6z', f:'#cfe0ec', s:'#8fb2cd', w:1.1 },
    { c:[14.6,16,2.9], f:'#f0c9a8' },
    { c:[13.3,15.6,.5], f:'#4a3728' }, { c:[16,15.6,.5], f:'#4a3728' },
    { p:'M13.6 17.7c.7.5 1.4.5 2.1 0', s:'#4a3728', w:.85 },
  ],
};
const NAP_ALIAS = { 'דובי / בובה': 'בובה', 'דובי': 'בובה' };
function drawNapIcon(doc, name, x, y, size) {
  const ops = NAP_ICONS[NAP_ALIAS[name] || name];
  if (!ops) return false;
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.lineCap('round').lineJoin('round');
  ops.forEach(o => {
    if (o.p) doc.path(o.p);
    else if (o.c) doc.circle(o.c[0], o.c[1], o.c[2]);
    else if (o.e) doc.ellipse(o.e[0], o.e[1], o.e[2], o.e[3]);
    else if (o.r) doc.roundedRect(o.r[0], o.r[1], o.r[2], o.r[3], o.r[4] || 0);
    if (o.f && o.s) doc.fillColor(o.f).strokeColor(o.s).lineWidth(o.w || 1).fillAndStroke();
    else if (o.f) doc.fillColor(o.f).fill();
    else if (o.s) doc.strokeColor(o.s).lineWidth(o.w || 1).stroke();
  });
  doc.restore();
  return true;
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
      doc.registerFont('he', fontPath('Alef-Regular.ttf'));
      doc.registerFont('heB', fontPath('Alef-Bold.ttf'));

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

      // המזרן מצוייר כמיטה: שמיכה, קפל, כרית ותמונה. הכרית אינה
      // קישוט — היא המידע היחיד בדף שאומר לאיזה כיוון פונה הראש.
      const BLANKETS = [
        { bg:'#dce9f3', ln:'#a9c6dc' }, { bg:'#e6ebdc', ln:'#b7c3a2' },
        { bg:'#f3e3dc', ln:'#dcb9a6' }, { bg:'#e7e2ef', ln:'#bdb2cf' },
        { bg:'#dceae7', ln:'#a5c6bd' }, { bg:'#f3eada', ln:'#d8c69c' },
      ];
      (sheet.mats || []).forEach((m, idx) => {
        const x = X(m.x), y = Y(m.y), w = L(m.w), h = L(m.h);
        const potty = !!m.potty;
        const bl = potty ? { bg:'#f7e9cf', ln:'#e0c08a' } : BLANKETS[idx % BLANKETS.length];
        const rad = 5 * k, pad = 2.5 * k;

        doc.roundedRect(x, y, w, h, rad).fillColor('#ffffff').fill();
        doc.roundedRect(x + pad, y + pad, w - pad * 2, h - pad * 2, rad * .8)
           .fillColor(bl.bg).fill();

        // הכרית והקפל, לפי הצד שאליו פונה הראש
        const head = m.head || 'right';
        const vert = head === 'top' || head === 'bottom';
        const pw = vert ? w - 5 * k : w * 0.30;
        const ph = vert ? h * 0.30 : h - 5 * k;
        const px = head === 'right' ? x + w - pw - 3 * k : head === 'left' ? x + 3 * k : x + 2.5 * k;
        const py = head === 'bottom' ? y + h - ph - 3 * k : head === 'top' ? y + 3 * k : y + 2.5 * k;
        doc.roundedRect(px, py, pw, ph, 4 * k).fillColor('#fffdfa').fill();
        doc.roundedRect(px, py, pw, ph, 4 * k).lineWidth(Math.max(.4, .9 * k))
           .strokeColor(bl.ln).stroke();
        // קמט רך באמצע הכרית — בלעדיו היא נקראת כקופסה לבנה ריקה
        const kx = px + pw / 2, ky = py + ph / 2;
        if (vert) doc.moveTo(px + pw * .2, ky).lineTo(px + pw * .8, ky);
        else doc.moveTo(kx, py + ph * .2).lineTo(kx, py + ph * .8);
        doc.lineWidth(Math.max(.3, .7 * k)).strokeColor(bl.ln).opacity(.45).stroke().opacity(1);
        // קפל השמיכה, צמוד לכרית
        const fw = vert ? w - 7 * k : 3.5 * k, fh = vert ? 3.5 * k : h - 7 * k;
        const fx = head === 'right' ? px - 5 * k : head === 'left' ? px + pw + 1.5 * k : x + 3.5 * k;
        const fy = head === 'bottom' ? py - 5 * k : head === 'top' ? py + ph + 1.5 * k : y + 3.5 * k;
        doc.roundedRect(fx, fy, fw, fh, 1.5 * k).fillColor('#ffffff').opacity(.55).fill().opacity(1);

        doc.roundedRect(x, y, w, h, rad).lineWidth(Math.max(.6, 1.4 * k));
        if (potty) doc.dash(4, { space: 2.5 }).strokeColor(bl.ln).stroke().undash();
        else doc.strokeColor(bl.ln).stroke();

        // תמונת הילד, חתוכה לעיגול על הכרית
        const face = m.child_id && sheet.faces ? sheet.faces[m.child_id] : null;
        if (face) {
          try {
            const b64 = String(face).replace(/^data:[^,]+,/, '');
            const img = Buffer.from(b64, 'base64');
            const fr = Math.min(pw, ph) * 0.42;
            const fcx = px + pw / 2, fcy = py + ph / 2;
            doc.save();
            doc.circle(fcx, fcy, fr).clip();
            doc.image(img, fcx - fr, fcy - fr, { width: fr * 2, height: fr * 2 });
            doc.restore();
            doc.circle(fcx, fcy, fr).lineWidth(Math.max(.5, 1.3 * k)).strokeColor('#ffffff').stroke();
          } catch (e) { /* תמונה פגומה לא תפיל את הדף */ }
        }

        doc.font('he').fontSize(Math.max(4, 7 * k)).fillColor(bl.ln);
        doc.text(String(m.num || idx + 1), x + 3 * k, y + h - 8 * k, { lineBreak: false });

        if (!m.name) return;
        // אזור הכתב: מה שנשאר אחרי הכרית
        const bx = head === 'right' ? x + 2 * k : head === 'left' ? px + pw + 2 * k : x + 2 * k;
        const bw = vert ? w - 4 * k : w - pw - 7 * k;
        const by = head === 'bottom' ? y + 2 * k : head === 'top' ? py + ph + 2 * k : y + 2 * k;
        const bh = vert ? h - ph - 7 * k : h - 4 * k;

        doc.font('heB').fontSize(Math.max(5.5, 10.5 * k)).fillColor(potty ? C.pottyInk : C.matInk);
        const nameLines = wrapLines(doc, m.name, bw, 2);
        const nameH = nameLines.length * doc.currentLineHeight();

        doc.font('he').fontSize(Math.max(4.6, 8 * k));
        const ico = Math.max(5, 10 * k), gp = ico * 0.22, sepW = doc.widthOfString(' · ');
        const items = (m.needs || []).map(nd => {
          const tw = lineWidth(doc, wordsOf(nd));
          return { kind: 'need', label: nd, w: ico + gp + tw, tw };
        });
        if (m.other) {
          const tw = lineWidth(doc, wordsOf(m.other));
          items.push({ kind: 'text', label: m.other, w: tw, tw });
        }
        const rows = [];
        let row = [], rw = 0;
        items.forEach(it => {
          const add = (row.length ? sepW : 0) + it.w;
          if (row.length && rw + add > bw) { rows.push({ items: row, w: rw }); row = []; rw = 0; }
          row.push(it); rw += (row.length > 1 ? sepW : 0) + it.w;
        });
        if (row.length) rows.push({ items: row, w: rw });
        const rlh = Math.max(doc.currentLineHeight(), ico * 0.95);
        const ritH = rows.length * rlh;

        let top = by + (bh - nameH - ritH) / 2;
        doc.font('heB').fontSize(Math.max(5.5, 10.5 * k)).fillColor(potty ? C.pottyInk : C.matInk);
        const nlh = doc.currentLineHeight();
        nameLines.forEach((ws, i) => drawWordsRtl(doc, ws, bx + bw / 2 + lineWidth(doc, ws) / 2, top + i * nlh));

        if (rows.length) {
          top += nameH + 1 * k;
          const sub = potty ? C.pottySub : C.matSub;
          rows.forEach((rr, ri) => {
            let cur = bx + bw / 2 + rr.w / 2;
            const ry = top + ri * rlh;
            rr.items.forEach((it, ii) => {
              if (ii) {
                doc.font('he').fontSize(Math.max(4.6, 8 * k)).fillColor(sub);
                cur -= sepW;
                doc.text(' · ', cur, ry, { lineBreak: false });
              }
              if (it.kind === 'need') {
                cur -= ico;
                drawNapIcon(doc, it.label, cur, ry + (rlh - ico) / 2 - ico * 0.08, ico);
                cur -= gp;
              }
              doc.font('he').fontSize(Math.max(4.6, 8 * k)).fillColor(sub);
              drawWordsRtl(doc, wordsOf(it.label), cur, ry + (rlh - doc.currentLineHeight()) / 2);
              cur -= it.tw;
            });
          });
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
