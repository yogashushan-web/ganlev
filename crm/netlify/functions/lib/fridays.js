// ימי שישי — הלוגיקה המשותפת לצד המאומת ולצד הציבורי.
//
// מודול טהור: נכנסים נתונים, יוצאות החלטות. אין כאן גישה ל-Supabase,
// ולכן אפשר להריץ אותו מקומית ולבדוק כל מקרה קצה בלי רשת.
//
// שלושת הכללים שקובעים מה מותר להורה לעשות:
//   1. ההרשמה נפתחת בתאריך שהגן קובע
//   2. ההרשמה לחודש נסגרת N ימים לפני תחילתו (ברירת מחדל 5)
//   3. ביטול עצמאי אפשרי עד M ימים לפני אותו שישי (ברירת מחדל 14)
//
// ומעל שלושתם `approval` — האם הגננת צריכה לאשר. ברירת המחדל היא
// `never`: ההורה נרשם וזה סופי. גן שעובד אחרת בוחר אחרת.

const P2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())}`;
const parseIso = s => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : new Date(NaN);
};
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtHe = s => {
  const d = parseIso(s);
  return isNaN(d) ? '' : `${P2(d.getDate())}.${P2(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const DEFAULTS = {
  active: true,
  price: 150,
  capacity: 12,
  siblings: true,        // מותר להוסיף אח/ות
  showNames: true,       // ההורים רואים מי נרשם
  openFrom: '',          // ריק = פתוח מעכשיו
  closeDaysBefore: 5,    // לפני תחילת החודש שבו חל השישי
  cancelDaysBefore: 14,  // ביטול עצמאי עד
  staffReminderDays: 10, // תזכורת לצוות לפני סוף החודש הקודם
  yearEnd: '',           // היום האחרון של שנת הגן. אחריו אין הרשמה.
  // never  — ההורה נרשם וזה סופי (ברירת מחדל)
  // late   — אישור נדרש רק אחרי שההרשמה לחודש נסגרה
  // always — כל הרשמה עוברת לאישור
  approval: 'never',
};
const settingsOf = s => Object.assign({}, DEFAULTS, s || {});

// כל ימי שישי בשנת לימודים: ספטמבר עד אוגוסט
function fridaysOfYear(schoolYear) {
  const start = Number(String(schoolYear).slice(0, 4));
  if (!start) return [];
  const out = [];
  const d = new Date(start, 8, 1);                 // 1 בספטמבר
  const end = new Date(start + 1, 7, 31);          // 31 באוגוסט
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 7); }
  return out;
}

// ההרשמה לחודש נסגרת N ימים לפני היום הראשון שלו.
// דוגמה: פברואר עם N=5 נסגר ב-27 בינואר.
function lockDateFor(dateIso, closeDaysBefore) {
  const d = parseIso(dateIso);
  if (isNaN(d)) return '';
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  first.setDate(first.getDate() - Number(closeDaysBefore || 0));
  return iso(first);
}

// מצב של יום שישי אחד עבור הורה מסוים
function stateOf(dateIso, rec, set, todayIso) {
  const s = settingsOf(set);
  const mode = s.approval || 'never';
  const today = todayIso || iso(new Date());
  // יום אחרון לגן. בלי זה צריך לסמן ידנית כל שישי של אוגוסט, בכל שנה
  // מחדש, וזה בדיוק סוג הדבר שנשכח.
  const afterEnd = s.yearEnd && dateIso > s.yearEnd;
  const closed = (rec && rec.closed && rec.closed.reason)
    || (afterEnd ? 'אחרי סיום שנת הגן' : '');
  const cap = (rec && rec.capacity) || s.capacity;
  const regs = (rec && rec.regs) || [];
  const taken = regs.filter(r => r.status !== 'rejected')
    .reduce((n, r) => n + 1 + ((r.siblings || []).length), 0);

  const lock = lockDateFor(dateIso, s.closeDaysBefore);
  const beforeOpen = s.openFrom && today < s.openFrom;
  const locked = today >= lock;
  const past = dateIso < today;
  const cancelUntil = addDays(dateIso, -Number(s.cancelDaysBefore || 0));

  // מתי הרשמה הופכת לבקשה שממתינה לאישור. ב-`never` — לעולם לא, ולכן
  // גם הנעילה החודשית לא חוסמת: הורה שנרשם אחריה פשוט נרשם. אין טעם
  // בנעילה שאין דרך לעבור אותה.
  const open = !closed && !past && !beforeOpen;
  const needsOk = mode === 'always' || (mode === 'late' && locked);

  return {
    date: dateIso,
    closed: closed || '',
    approval: mode,
    capacity: cap,
    taken,
    full: taken >= cap,
    lock, cancelUntil, past,
    // מה שההורה יכול לעשות *עכשיו*
    canRegister: open && !needsOk && taken < cap,
    canRequest: open && needsOk,
    canCancel: !past && today < cancelUntil,
    // הנוסח נגזר מהלוגיקה ולא מהדף, אחרת "ההרשמה לחודש נסגרה" יופיע
    // גם לגן שבו כל הרשמה עוברת אישור ממילא.
    requestNote: mode === 'always' ? 'כל הרשמה עוברת לאישור הגננת.'
       : needsOk ? 'ההרשמה לחודש נסגרה — הבקשה תעבור לאישור הגננת.'
       : '',
    why: closed ? closed
       : past ? 'עבר'
       : beforeOpen ? 'ההרשמה טרם נפתחה'
       : needsOk ? 'ההרשמה לחודש הזה נסגרה'
       : taken >= cap ? 'מלא'
       : '',
  };
}

// כמה מקומות תופסת הרשמה אחת — הילד ועוד אחים
const seatsOf = r => 1 + ((r && r.siblings || []).length);

// כשאין צורך באישור, בקשה שנשמרה פעם כ"ממתינה" היא הרשמה לכל דבר.
// בלי זה היא נתקעת ממתינה לנצח — בלי כפתור שיפתור אותה, כי הכפתור
// נעלם יחד עם מצב האישור.
function effStatus(r, set) {
  const st = (r && r.status) || 'ok';
  return (st === 'pending' && (settingsOf(set).approval || 'never') === 'never')
    ? 'ok' : st;
}

module.exports = {
  DEFAULTS, settingsOf, fridaysOfYear, lockDateFor, stateOf, seatsOf, effStatus,
  iso, parseIso, addDays, fmtHe,
};
