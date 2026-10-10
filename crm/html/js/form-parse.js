// פענוח טופס ההרשמה והחוזה של גן לב לשדות.
//
// נכנסות שורות הטקסט מ-pages-read.js, יוצא אובייקט מוכן למילוי מראש
// של כרטיס הילד.
//
// **שום דבר כאן לא נשמר אוטומטית.** הפענוח ממלא טופס שהמשתמשת רואה
// ומאשרת. מסמך סרוק שמייצר רשומות בשקט הוא בדיוק הדרך להכניס ת"ז
// שגויה למערכת בלי שאף אחד ישים לב.
//
// הערה על הסדר: Pages שומר את תאי הטבלה לפי סדר אחסון ולא לפי סדר
// התצוגה, ולכן **אי אפשר לשייך שדה להורה לפי המיקום בקובץ**. הזיווג
// נעשה לפי סדר ההופעה של כל סוג שדה, ובממשק יש כפתור החלפה — עם שני
// הורים, הקשה אחת מתקנת כל טעות.

(function (root) {
'use strict';

// שאריות בינאריות נדבקות לתחילת שורות: תו בודד, ספרה, סימן פיסוק
const clean = s => String(s || '')
  .replace(/^[^֐-׿A-Za-z]{0,3}/, '')
  .replace(/\*+$/, '')
  .trim();

// שדה ריק בטופס הוא רצף קווים תחתונים
const filled = v => {
  const t = String(v || '').replace(/[_\s.\-]/g, '');
  return t.length > 0 ? String(v).trim() : '';
};

// הטלפונים נשמרים הפוך בגלל כיווניות: "6969054 -054" הוא 054-6969054.
// לכן לא קוראים את המחרוזת אלא אוספים את קבוצות הספרות ומרכיבים מחדש.
function phone(line) {
  const groups = String(line).match(/\d{2,}/g);
  if (!groups) return '';
  const pre = groups.find(g => /^0\d{1,2}$/.test(g)) || groups.find(g => g.length <= 3);
  const rest = groups.filter(g => g !== pre && g.length >= 6)[0];
  if (pre && rest) return pre + '-' + rest;
  const flat = groups.join('');
  return flat.length >= 9 ? flat : '';
}

// 2025/05/01 או 01/05/2025 — שניהם מופיעים בטפסים, וצריך להבדיל
function isoDate(line) {
  const m = String(line).match(/(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})/);
  if (!m) return '';
  let [, a, b, c] = m;
  const p = n => String(n).padStart(2, '0');
  if (a.length === 4) return `${a}-${p(b)}-${p(c)}`;        // שנה בהתחלה
  if (c.length === 4) return `${c}-${p(b)}-${p(a)}`;        // יום בהתחלה
  return '';
}

const after = (line, label) => {
  const i = String(line).indexOf(label);
  if (i < 0) return '';
  return filled(String(line).slice(i + label.length).replace(/^[:\s]+/, ''));
};

function parseForm(lines) {
  const L = (lines || []).map(clean).filter(Boolean);
  const find = re => L.find(l => re.test(l)) || '';
  const findAll = re => L.filter(l => re.test(l));

  const child = {
    first_name_he: after(find(/שם הילד\/?ה\s*:/), ':'),
    last_name_he: after(find(/שם המשפחה\s*:/), ':'),
    birth_date: isoDate(find(/תאריך הלידה\s*:/)),
    national_id: (after(find(/מספר ת\.?ז\s*:/), ':').match(/\d{5,9}/) || [''])[0],
    address: after(find(/^כתובת\s*:/), ':'),
    postcode: (after(find(/מיקוד\s*:/), ':').match(/\d{5,7}/) || [''])[0],
  };

  // קופת חולים וסניף יושבים באותה שורה
  const hmoLine = find(/קופת חולים\s*:/);
  const hmo = {
    name: (hmoLine.match(/קופת חולים\s*:\s*([^\s]+)/) || ['', ''])[1],
    branch: filled((hmoLine.match(/סניף\/?כתובת\s*:\s*([^:]*?)(?:\s*טלפון|$)/) || ['', ''])[1]),
  };

  const hoursLine = find(/ישהה בגן/);
  const hm = hoursLine.match(/(\d{1,2}:\d{2})[^\d]+(\d{1,2}:\d{2})/);
  const hours = hm ? { from: hm[1], to: hm[2] } : null;

  // ---- ההורים ----
  // כל סוג שדה נאסף לפי סדר הופעה, והזיווג הוא לפי אינדקס. ראו ההערה
  // בראש הקובץ: שיוך לפי מיקום בקובץ פשוט אינו אפשרי.
  const names = findAll(/שם ההורה\s*:/).map(l => after(l, ':')).filter(Boolean);
  const occs = findAll(/^עיסוק\s*:/).map(l => after(l, ':')).filter(Boolean);
  const mobiles = findAll(/טלפון נייד\s*:/).map(phone).filter(Boolean);
  const mails = findAll(/@/).map(l => (l.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [''])[0])
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const n = Math.max(names.length, mobiles.length, mails.length);
  const parents = [];
  for (let i = 0; i < n; i++) {
    parents.push({
      full_name_he: names[i] || '',
      occupation: occs[i] || '',
      phone: mobiles[i] || '',
      email: mails[i] || '',
    });
  }

  // ---- בריאות ----
  // מזהים *איזו* אפשרות סומנה לפי זה שהשנייה נשארה ריקה. גם כך
  // הממשק מציג את זה לאישור ולא מסמן לבד — זה מידע רפואי.
  const sickLine = find(/סובל מבעיות רפואיות,?\s*ו\/?או אלרגי כדלהלן/);
  const declared = after(sickLine, 'כדלהלן');
  const noneLine = find(/אינו סובל מבעיות רפואיות/);
  const health = {
    none: !declared && !!noneLine,
    text: declared || '',
    unsure: !declared && !noneLine,
  };

  // ---- מהחוזה ----
  const feeLine = find(/מחיר הגן החודשי/);
  const regLine = find(/דמי הרשמה על סך/);
  const periodLine = find(/לתקופת החודשים/);
  const pm = periodLine.match(/(\d{1,2}\/\d{1,2}\/\d{4})[^\d]+(\d{1,2}\/\d{1,2}\/\d{4})/);
  const contract = {
    monthly: Number((feeLine.match(/הינו\s*(\d[\d,]*)/) || ['', ''])[1].replace(/,/g, '')) || null,
    registration: Number((regLine.match(/על סך\s*(\d[\d,]*)/) || ['', ''])[1].replace(/,/g, '')) || null,
    account: (regLine.match(/חשבון\s*:?\s*(\d{4,})/) || ['', ''])[1] || '',
    from: pm ? isoDate(pm[1]) : '',
    to: pm ? isoDate(pm[2]) : '',
    signed: isoDate(find(/^תאריך\s*:\s*\d/)),
  };

  // שנת לימודים מתאריכי החוזה: 1/9/2026–31/8/2027 הוא "2026-27"
  let school_year = '';
  if (contract.from) {
    const y = Number(contract.from.slice(0, 4));
    if (y) school_year = y + '-' + String(y + 1).slice(2);
  }

  return { child, parents, hmo, hours, health, contract, school_year, lines: L.length };
}

const EXPORTS = { parseForm, phone, isoDate, clean };
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
root.FormParse = EXPORTS;

})(typeof globalThis !== 'undefined' ? globalThis : this);
