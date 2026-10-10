// קריאת קובץ Pages (.pages) לטקסט — בדפדפן, בלי שום ספרייה.
//
// **הקובץ לא עובר לשרת.** טופס רישום חתום מכיל ת"ז של ילד, כתובת
// וטלפונים של ההורים. אין סיבה שהוא ייצא מהמחשב כדי שנקרא ממנו שם.
//
// שלוש שכבות:
//   1. ZIP  · קובץ .pages הוא ארכיון. Pages שומר הכל ב-STORE (בלי
//             דחיסה), ולכן אין צורך ב-inflate בכלל
//   2. IWA  · הטקסט יושב בקובצי Index/*.iwa — רצף מקטעים, לכל אחד
//             כותרת של ארבעה בייטים והגוף דחוס ב-snappy גולמי
//   3. טקסט · מתוך ה-protobuf שיוצא מושכים את המחרוזות הקריאות
//
// עטוף ב-IIFE: קובצי script רגילים חולקים מרחב שמות גלובלי אחד.

(function (root) {
'use strict';

/* ---------- 1 · ZIP ---------- */
const u16 = (d, i) => d[i] | (d[i + 1] << 8);
const u32 = (d, i) => (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;

function zipEntries(buf) {
  const d = new Uint8Array(buf);
  // סוף הספרייה המרכזית — מחפשים מהסוף, כי אחריו יכולה לבוא הערה
  let eocd = -1;
  for (let i = d.length - 22; i >= 0 && i > d.length - 66000; i--) {
    if (u32(d, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('הקובץ אינו ארכיון תקין');

  let p = u32(d, eocd + 16);
  const n = u16(d, eocd + 10);
  const out = [];
  const dec = new TextDecoder('utf-8');
  for (let k = 0; k < n && p + 46 <= d.length; k++) {
    if (u32(d, p) !== 0x02014b50) break;
    const method = u16(d, p + 10);
    const size = u32(d, p + 24);
    const nameLen = u16(d, p + 28);
    const extraLen = u16(d, p + 30);
    const cmtLen = u16(d, p + 32);
    const local = u32(d, p + 42);
    const name = dec.decode(d.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, size, local });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { d, entries: out };
}

function readEntry(d, e) {
  if (u32(d, e.local) !== 0x04034b50) return null;
  const nameLen = u16(d, e.local + 26);
  const extraLen = u16(d, e.local + 28);
  const at = e.local + 30 + nameLen + extraLen;
  // Pages כותב הכל ב-STORE. אם אפל תשנה את זה נדע מיד ולא נחזיר זבל.
  if (e.method !== 0) return null;
  return d.subarray(at, at + e.size);
}

/* ---------- 2 · snappy גולמי ---------- */
// מימוש מלא יהיה מיותר כאן: צריך רק פריסה, בלי דחיסה ובלי בדיקת CRC.
function snappy(src) {
  let i = 0, shift = 0, len = 0;
  for (;;) {                                  // varint של האורך הפרוס
    const b = src[i++];
    len |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }
  const out = new Uint8Array(len);
  let o = 0;
  while (i < src.length && o < len) {
    const tag = src[i];
    const t = tag & 3;
    if (t === 0) {                            // literal
      let n = tag >> 2;
      i++;
      if (n >= 60) {
        const k = n - 59;
        n = 0;
        for (let j = 0; j < k; j++) n |= src[i + j] << (8 * j);
        i += k;
      }
      const ln = n + 1;
      out.set(src.subarray(i, i + ln), o);
      o += ln; i += ln;
    } else {                                  // copy
      let ln, off;
      if (t === 1) {
        ln = 4 + ((tag >> 2) & 7);
        off = ((tag >> 5) << 8) | src[i + 1];
        i += 2;
      } else if (t === 2) {
        ln = (tag >> 2) + 1;
        off = src[i + 1] | (src[i + 2] << 8);
        i += 3;
      } else {
        ln = (tag >> 2) + 1;
        off = (src[i + 1] | (src[i + 2] << 8) | (src[i + 3] << 16) | (src[i + 4] << 24)) >>> 0;
        i += 5;
      }
      if (off <= 0 || off > o) break;
      let s = o - off;
      for (let j = 0; j < ln && o < len; j++) out[o++] = out[s++];
    }
  }
  return out.subarray(0, o);
}

/* ---------- 3 · מקטעי IWA ---------- */
function iwa(blob) {
  const parts = [];
  let i = 0;
  while (i + 4 <= blob.length) {
    // בייט דגלים ואז שלושה בייטים של אורך. לקחת את האורך מהבייטים
    // הלא נכונים נותן גודל שגוי והפריסה נשברת בשקט.
    const ln = blob[i + 1] | (blob[i + 2] << 8) | (blob[i + 3] << 16);
    i += 4;
    if (ln <= 0 || i + ln > blob.length) break;
    try { parts.push(snappy(blob.subarray(i, i + ln))); } catch (e) {}
    i += ln;
  }
  let total = 0;
  parts.forEach(p => { total += p.length; });
  const out = new Uint8Array(total);
  let o = 0;
  parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}

/* ---------- 4 · טקסט ---------- */
// מה שיוצא הוא protobuf, ובתוכו המחרוזות. שליפה לפי תווים קריאים
// עדיפה כאן על פענוח מלא של הסכימה: הסכימה של Pages משתנה בין גרסאות,
// והטקסט עצמו לא.
const KEEP = /[֐-׿A-Za-z0-9@._\-'"()\/\\ ,:;!?%₪–—=+*#&]/;

function textOf(bytes) {
  const s = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (KEEP.test(c)) cur += c;
    else { if (cur.length >= 3) out.push(cur); cur = ''; }
  }
  if (cur.length >= 3) out.push(cur);
  // שורות שאין בהן עברית ואין בהן מילה לטינית אמיתית הן כמעט תמיד
  // שאריות בינאריות
  const seen = Object.create(null), keep = [];
  out.forEach(p => {
    const t = p.trim();
    if (t.length < 3 || seen[t]) return;
    if (!/[֐-׿]/.test(t) && !/[A-Za-z]{3}/.test(t)) return;
    seen[t] = 1; keep.push(t);
  });
  return keep;
}

/* ---------- ממשק ---------- */
function linesFromBuffer(buf) {
  const { d, entries } = zipEntries(buf);
  const chunks = [];
  entries.forEach(e => {
    if (!/\.iwa$/.test(e.name)) return;
    const raw = readEntry(d, e);
    if (raw) chunks.push(iwa(raw));
  });
  if (!chunks.length) throw new Error('לא נמצא טקסט בקובץ');
  let total = 0;
  chunks.forEach(c => { total += c.length; });
  const all = new Uint8Array(total);
  let o = 0;
  chunks.forEach(c => { all.set(c, o); o += c.length; });
  return textOf(all);
}

// תמונת התצוגה המוטמעת — העמוד הראשון בלבד, לאימות מול המקור
function previewBlob(buf) {
  const { d, entries } = zipEntries(buf);
  const e = entries.find(x => x.name === 'preview.jpg')
         || entries.find(x => /preview.*\.jpg$/.test(x.name));
  if (!e) return null;
  const raw = readEntry(d, e);
  return raw ? new Blob([raw], { type: 'image/jpeg' }) : null;
}

const EXPORTS = { linesFromBuffer, previewBlob, zipEntries, snappy };
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
root.PagesRead = EXPORTS;

})(typeof globalThis !== 'undefined' ? globalThis : this);
