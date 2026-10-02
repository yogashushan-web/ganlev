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

// הסמלים 🪑 ו-👀 שעל הגלולות במסך — אין להם גליף בגופן, ופונט אמוג'י
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

// אותם אמוג'י שעל המסך, כווקטור — כדי שהדף המודפס יהיה זהה לו.
// צורות פשוטות בכוונה: בגודל 12 נקודות ציור מפורט נמרח לכתם.
function drawItemIcon(doc, kind, x, y, s, color) {
  doc.save();
  doc.lineWidth(Math.max(0.4, s * 0.09)).strokeColor(color).fillColor(color)
     .lineJoin('round').lineCap('round');
  const cx = x + s / 2;
  if (kind === 'serve') {                       // קערה עם אדים
    doc.moveTo(x + s * 0.12, y + s * 0.5).lineTo(x + s * 0.88, y + s * 0.5)
       .quadraticCurveTo(cx, y + s * 0.98, x + s * 0.12, y + s * 0.5).stroke();
    doc.moveTo(cx - s * 0.16, y + s * 0.3).lineTo(cx - s * 0.16, y + s * 0.12).stroke();
    doc.moveTo(cx + s * 0.16, y + s * 0.3).lineTo(cx + s * 0.16, y + s * 0.12).stroke();
  } else if (kind === 'clear') {                // ערימת צלחות
    [0.42, 0.62, 0.82].forEach(f =>
      doc.moveTo(x + s * 0.14, y + s * f).lineTo(x + s * 0.86, y + s * f).stroke());
    doc.ellipse(cx, y + s * 0.26, s * 0.34, s * 0.13).stroke();
  } else if (kind === 'sink') {                 // ברז מעל אגן
    doc.moveTo(x + s * 0.14, y + s * 0.6).lineTo(x + s * 0.86, y + s * 0.6)
       .lineTo(x + s * 0.72, y + s * 0.92).lineTo(x + s * 0.28, y + s * 0.92).closePath().stroke();
    doc.moveTo(cx, y + s * 0.6).lineTo(cx, y + s * 0.28)
       .lineTo(x + s * 0.76, y + s * 0.28).stroke();
  } else if (kind === 'cart') {                 // עגלה עם גלגלים
    doc.moveTo(x + s * 0.1, y + s * 0.2).lineTo(x + s * 0.28, y + s * 0.2)
       .lineTo(x + s * 0.46, y + s * 0.66).lineTo(x + s * 0.88, y + s * 0.66)
       .lineTo(x + s * 0.94, y + s * 0.3).lineTo(x + s * 0.32, y + s * 0.3).stroke();
    doc.circle(x + s * 0.52, y + s * 0.86, s * 0.09).fill();
    doc.circle(x + s * 0.84, y + s * 0.86, s * 0.09).fill();
  } else {                                      // ארון: שתי דלתות וידיות
    doc.rect(x + s * 0.14, y + s * 0.1, s * 0.72, s * 0.8).stroke();
    doc.moveTo(cx, y + s * 0.1).lineTo(cx, y + s * 0.9).stroke();
    doc.circle(cx - s * 0.1, y + s * 0.5, s * 0.055).fill();
    doc.circle(cx + s * 0.1, y + s * 0.5, s * 0.055).fill();
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

// ---- עובי קו: חמש דרגות, כל אחת כפולה מזו שמתחתיה (ISO 128) ----
// 1 מ"מ = 2.8346 נקודות. העוביים *לא* מוכפלים ב-k: הדף הוא A4 בגודל
// קבוע, ולכן מה שהעין רואה הוא העובי הפיזי על הנייר — לא יחס ההקטנה
// של החדר. קודם כל העוביים נגזרו מ-k, וכך חדר גדול קיבל קווים דקים
// יותר ממש כמו חדר קטן, והיררכיה לא הייתה בכלל.
//
// החריג היחיד הוא `seat`, והוא בכוונה: בתוכנית אדריכלית רהיט כפוף
// לקיר, אבל בסידור ישיבה הכיסא *הוא* הנושא — עליו יושב ילד ועליו
// כתוב שם. לכן הכיסא כבד מהשולחן, והשולחן יורד לאפור ניטרלי.
// אותה היררכיה בדיוק קיימת ב-lib/nap-pdf.js.
const LW = {
  cut: 1.70,     // קיר, עמוד — נחתכים על ידי מישור החתך
  built: 0.99,   // דלת, חלון, מובנה
  seat: 1.00,    // כיסא — הנושא של הדף הזה
  furn: 0.71,    // רהיט נייד: שולחן, עמדה
  det: 0.51,     // פרט פנימי: שפת דלפק, קיפול, גב כיסא
  note: 0.37,    // מידות והערות
};

// אותם צבעים בדיוק כמו על המסך, כדי שהדף המודפס לא יפתיע.
// הרצפה כהה מהרקע של האתר בכוונה: לבן על ‎#F4EFE6 הוא ניגודיות 1.15:1,
// כלומר רהיט לבן נעלם. על ‎#EDE6DA הוא נראה.
const C = {
  ink: '#3D3228', muted: '#9B8E82', brand: '#1F3D34',
  floor: '#EDE6DA',
  surface: '#efe6d8', surfaceLine: '#b8ac9b',
  emptyLine: '#b5a795', emptyFill: '#f6f2ea', emptyBand: '#e8e0d2',
  childLine: '#7fa3c0', childFill: '#ffffff', childBand: '#d7e5f2', childInk: '#2c4d66',
  staffLine: '#c08e72', staffFill: '#ffffff', staffBand: '#f2dcd0', staffInk: '#8a4d33',
};

const ROOM_W = 1123, ROOM_H = 794, SEAT_R = 27;

// ---- הכיסא ----
// מה שמבדיל כיסא משרפרף הוא פס גב בצד המרוחק מהשולחן, ולא טרפז ולא
// הצרה. היחס נמדד ב-SmartDraw: 74% מושב, 13% רווח, 13% פס. נתוני
// הנתיב כאן זהים לאלה שבמסך, כדי ששני הציורים לא יתרחקו זה מזה.
//
// ופס הגב גם *מוסיף מידע* שלא היה על הדף: לאן הילד פונה.
const CHAIR_BAND = 'M3 0 H37 A3 3 0 0 1 40 3 V7 H0 V3 A3 3 0 0 1 3 0 Z';
const CHAIR_SEAT = 'M4 6 H36 A2 2 0 0 1 38 8 V33 A7 7 0 0 1 31 40 H9 '
                 + 'A7 7 0 0 1 2 33 V8 A2 2 0 0 1 4 6 Z';
// מתחת לגודל הזה פס הגב נסגר אל המושב והכל נהפך לכתם אחד — נמדד.
// אז מוותרים עליו ומציירים מושב בלבד, כי להשאיר אותו רק מייצר בוץ.
const BAND_FLOOR = 19;

function drawChair(doc, cx, cy, r, face, skin) {
  const s = (r * 2) / 40;                     // 40 יחידות = רוחב הכיסא
  doc.save();
  doc.translate(cx, cy);
  if (face) doc.rotate(face);
  doc.scale(s);
  doc.translate(-20, -21);
  doc.lineJoin('round');
  if (r * 2 >= BAND_FLOOR) {
    doc.path(CHAIR_BAND).fillColor(skin.band).fill();
    doc.path(CHAIR_BAND).lineWidth(LW.det / s).strokeColor(skin.line).stroke();
  }
  doc.path(CHAIR_SEAT).fillColor(skin.fill).fill();
  doc.path(CHAIR_SEAT).lineWidth(LW.seat / s);
  if (skin.dash) doc.dash(3 / s, { space: 2 / s }).strokeColor(skin.line).stroke().undash();
  else doc.strokeColor(skin.line).stroke();
  doc.restore();
}

function buildSeatingPdf(sheet) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      doc.registerFont('he', fontPath('Alef-Regular.ttf'));
      doc.registerFont('heB', fontPath('Alef-Bold.ttf'));

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

      // הקטנת החדר כך שייכנס לשוליים, במרכז הדף.
      // מאז שיש לרצפה גוון, המקרא חייב רצועה לבנה משלו: הוא מידע *על*
      // הדף ולא רהיט בחדר, וכשהוא יושב על הרצפה הוא נקרא כחלק ממנה.
      const FOOT = (sheet.legend && sheet.legend.length) ? 30 : (sheet.note ? 18 : 0);
      const availW = PW - M * 2, availH = PH - M * 2 - HEAD - FOOT;
      const k = Math.min(availW / ROOM_W, availH / ROOM_H);
      const ox = M + (availW - ROOM_W * k) / 2;
      const oy = M + HEAD + (availH - ROOM_H * k) / 2;
      const X = px => ox + px * k, Y = py => oy + py * k;
      // גודל התוכן שנבחר במסך — הקואורדינטות כבר מגיעות מוגדלות, אבל
      // רדיוס הכיסא וגודל הכתב נגזרים כאן ולכן צריכים אותו במפורש
      const z = sheet.zoom || 1;

      // הרצפה. בלעדיה רהיט לבן על נייר לבן הוא קו מתאר מרחף, ואין שום
      // דבר שמגדיר "בפנים" ו"בחוץ". אין כאן קירות מלאים כמו בחדר השינה
      // בכוונה: בסידור הישיבה אנחנו לא יודעים איפה הקירות באמת עוברים,
      // וקיר מצוייר במקום שלא נמדד הוא שקר על הדף.
      doc.rect(X(0), Y(0), ROOM_W * k, ROOM_H * k).fillColor(C.floor).fill();

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
        // קו המתאר אפור ניטרלי ודק, גם כששולחן צבוע: הצבע חי במילוי,
        // והקו נשאר כפוף לכיסא שיושב עליו.
        shape(); doc.lineWidth(LW.furn).strokeColor(C.surfaceLine).stroke();
        doc.restore();
      });

      // פריטים בחדר: עמדת הגשה, פינוי, כיור, דלת. נייטרליים בכוונה —
      // הצבע בדף שמור לאחריות של הצוות.
      (sheet.items || []).forEach(it => {
        const x = X(it.x), y = Y(it.y), w = it.w * k, h = it.h * k;
        if (it.kind === 'door') {
          // דלת = פתח וכנף. רדיוס הקשת שווה לרוחב הפתח, ולכן הקשת
          // *מודדת* כמה מקום הדלת גוזלת בחדר — זה מידע, לא קישוט.
          doc.moveTo(x, y + h).lineTo(x + w, y + h)
             .lineWidth(LW.cut).strokeColor(C.floor).stroke();
          // הכנף פתוחה לתוך החדר, והקשת היא רבע מעגל אמיתי — doc.path
          // קורא נתיבי SVG, כולל פקודת A, ולכן אין כאן קירוב של בזייה.
          const r0 = Math.min(w, h * 2.2);        // כנף לא ארוכה מהפתח
          doc.moveTo(x, y + h).lineTo(x, y + h - r0)
             .lineWidth(LW.built).strokeColor('#8a7f70').stroke();
          doc.path(`M ${x} ${y + h - r0} A ${r0} ${r0} 0 0 1 ${x + r0} ${y + h}`)
             .lineWidth(LW.det).dash(2.5, { space: 2 })
             .strokeColor('#a89c8c').stroke().undash();
        } else {
          doc.roundedRect(x, y, w, h, 6 * k).fillColor('#ffffff').fill();
          // שפת הדלפק: קו דק לאורך הצד שעומדים מולו. הקו היחיד הזה הוא
          // כל ההבדל בין "תיבה עם עיגולים" ל"משטח שעומדים מולו".
          if (it.kind === 'serve' || it.kind === 'clear') {
            const ins = Math.min(w, h) * 0.17;
            doc.lineWidth(LW.det).strokeColor('#c0b4a2');
            if (w >= h) {
              const bot = Y(it.y) + h / 2 < Y(ROOM_H / 2);
              const ny = bot ? y + h - ins : y + ins;
              doc.moveTo(x + ins * 0.6, ny).lineTo(x + w - ins * 0.6, ny).stroke();
            } else {
              const rt = X(it.x) + w / 2 < X(ROOM_W / 2);
              const nx = rt ? x + w - ins : x + ins;
              doc.moveTo(nx, y + ins * 0.6).lineTo(nx, y + h - ins * 0.6).stroke();
            }
          }
          doc.roundedRect(x, y, w, h, 6 * k).lineWidth(LW.built)
             .strokeColor('#a29684').stroke();
        }
        doc.font('heB').fontSize(Math.max(5.6, 11 * k * z)).fillColor('#6f6457');
        if (it.kind === 'door') { drawCentered(doc, it.name, x + w / 2, y + h - 5 * k, w * 0.9, 1); }
        else {
          // הסמל מימין לשם, כמו על המסך
          const ic = Math.min(h * 0.5, 15 * k * z);
          const tw = lineWidth(doc, wordsOf(it.name));
          const tot = ic + ic * 0.35 + tw, sx = x + (w - tot) / 2;
          drawItemIcon(doc, it.kind, sx + tot - ic, y + (h - ic) / 2, ic, '#8a7f70');
          drawWordsRtl(doc, wordsOf(it.name), sx + tw, y + (h - doc.currentLineHeight()) / 2);
        }
      });

      // הכיסאות — נקודות מוחלטות שהדפדפן כבר חישב, כולל סיבוב
      const r = SEAT_R * k * z;
      const SKIN = {
        staff: { fill: C.staffFill, band: C.staffBand, line: C.staffLine },
        child: { fill: C.childFill, band: C.childBand, line: C.childLine },
        empty: { fill: C.emptyFill, band: C.emptyBand, line: C.emptyLine, dash: true },
      };
      (sheet.seats || []).forEach(s => {
        const cx = X(s.x), cy = Y(s.y);
        drawChair(doc, cx, cy, r, s.face || 0, SKIN[s.kind] || SKIN.empty);

        if (!s.label) return;
        doc.font('heB').fontSize(Math.max(5.6, 10.5 * k * z))
           .fillColor(s.kind === 'staff' ? C.staffInk : C.childInk);
        // השם ממורכז על *המושב*, לא על טביעת הרגל של הכיסא: פס הגב
        // תופס את הקצה הרחוק, ולכן מרכז המושב מוזז מעט אל השולחן.
        const a = (s.face || 0) * Math.PI / 180, off = r / 10;
        drawCentered(doc, s.label, cx - Math.sin(a) * off, cy + Math.cos(a) * off,
                     r * 1.6, 3);

        // אלרגיה: הדבר היחיד על הדף שקריאתו דחופה, ולכן אדום ומתחת לשם
        if (!s.allergy) return;
        doc.font('heB').fontSize(Math.max(5, 8.5 * k * z));
        const aw = lineWidth(doc, wordsOf(s.allergy));
        const ah = doc.currentLineHeight(), pad = 3.5 * k * z;
        const bx = cx - (aw + pad * 2) / 2, by = cy + r - ah * 0.25;
        doc.roundedRect(bx, by, aw + pad * 2, ah + 1, (ah + 1) / 2).fillColor('#c94147').fill();
        doc.fillColor('#ffffff');
        drawWordsRtl(doc, wordsOf(s.allergy), bx + aw + pad, by + 0.5);
      });

      // שם השולחן במרכזו, תמיד זקוף גם כששולחן מסובב — ואחרי הכיסאות,
      // כדי שעיגול שנוגע במרכז לא יחתוך אותיות מהשם
      // כהה וגדול, ולא אפור בהיר. נמדד בכל המוצרים: Social Tables מריצים
      // גובה אות של 0.3 מקוטר השולחן בשחור כמעט מלא, והבהיר הוא מיעוט.
      (sheet.tables || []).forEach(t => {
        const base = Math.min(t.w, t.h) * k;
        doc.font('heB').fontSize(Math.max(8, Math.min(base * 0.26, 22))).fillColor(C.ink);
        drawCentered(doc, t.name, X(t.x + t.w / 2), Y(t.y + t.h / 2), t.w * k * 0.82, 2);
      });

      // סמני צוות שלא יושבים בתוך שולחן. עיגול ולא גלולה: לעיגול יש
      // מרכז אחד, ולכן ברור איפה בדיוק היא עומדת בחלל. השם יורד מתחתיו.
      (sheet.marks || []).forEach(m => {
        const col = m.color || C.brand;
        const r = SEAT_R * k * z, cx = X(m.x) + r, cy = Y(m.y) + r;

        doc.circle(cx, cy, r).fillColor('#ffffff').fill();
        doc.circle(cx, cy, r).lineWidth(LW.seat * 1.3);
        if (m.open) doc.dash(3, { space: 2 }).strokeColor(col).stroke().undash();
        else doc.strokeColor(col).stroke();
        drawMarkIcon(doc, m.icon === 'chair' ? 'chair' : 'watch',
                     cx - r * 0.42, cy - r * 0.42, r * 0.84, col);

        doc.font('heB').fontSize(Math.max(5.5, 9.5 * k * z));
        const words = wordsOf(m.label);
        const tw = lineWidth(doc, words);
        const padX = 7 * k * z, hh = doc.currentLineHeight() + 3 * k * z;
        const w = tw + padX * 2, bx = cx - w / 2, by = cy + r + 4 * k * z;
        doc.roundedRect(bx, by, w, hh, hh / 2).fillColor('#ffffff').fill();
        doc.roundedRect(bx, by, w, hh, hh / 2).lineWidth(LW.det);
        if (m.open) doc.dash(2, { space: 1.5 }).strokeColor(col).stroke().undash();
        else doc.strokeColor(col).stroke();
        doc.fillColor(col);
        drawWordsRtl(doc, words, bx + w - padX, by + 1.5 * k * z);
      });

      // מקרא: מה שכל גוון אומר. בלעדיו הדף קריא רק למי שבנתה אותו.
      const leg = sheet.legend || [];
      if (leg.length) {
        doc.font('heB').fontSize(8);
        const sw = 6, gap = 3.5, pad = 13, yL = PH - M - 20;
        const widths = leg.map(r => {
          const n = lineWidth(doc, wordsOf(r.name));
          doc.font('he');
          const d = lineWidth(doc, wordsOf(r.tables && r.tables.length ? r.tables.join(' · ') : r.role));
          doc.font('heB');
          return sw + gap + n + gap + d;
        });
        const total = widths.reduce((a, b) => a + b, 0) + pad * (leg.length - 1);
        let cur = (PW + total) / 2;                 // ממורכז, ונקרא מימין לשמאל
        leg.forEach((r, i) => {
          cur -= widths[i];
          doc.roundedRect(cur + widths[i] - sw, yL + 1.5, sw, sw, 1.5)
             .fillColor(r.color || C.brand).fill();
          doc.font('heB').fillColor(C.ink);
          const nW = lineWidth(doc, wordsOf(r.name));
          drawWordsRtl(doc, wordsOf(r.name), cur + widths[i] - sw - gap, yL);
          doc.font('he').fillColor(C.muted);
          drawWordsRtl(doc, wordsOf(r.tables && r.tables.length ? r.tables.join(' · ') : r.role),
                       cur + widths[i] - sw - gap - nW - gap, yL);
          cur -= pad;
        });
      }

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
