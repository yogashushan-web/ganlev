// הבדיקה שרצה לפני הפרסום.
//
// **מתריע ולא חוסם.** אותו עיקרון בדיוק כמו whyImpossible בסידור
// הישיבה ו-checkViolations בסידור המזרונים: המערכת אומרת מה היא רואה,
// וההחלטה נשארת אצל הגננת. אין כאן שום ערך מוחזר שמונע פרסום.
//
// רץ בדפדפן, לא בשרת: החישוב קל, והגננת רואה את התוצאה בזמן שהיא
// בונה ולא רק כשהיא לוחצת. מודול טהור — נכנס אובייקט, יוצאת רשימה.

// עטוף ב-IIFE בכוונה: קובצי script רגילים חולקים מרחב שמות גלובלי
// אחד, והקובץ הזה נטען לצד menu-check.js ולצד הסקריפט של המסך — שניהם
// מצהירים על שמות כמו esc ו-DAYS. בלי העטיפה ההצהרה הכפולה מפילה את
// כל הסקריפט בשקט, והדף נתקע על "טוען…".
(function (root) {
'use strict';

const DAY_NAMES = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי' };
const ALL_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

// שש הקטגוריות של child-health. אותם קודים בדיוק, כדי שרגישות שנרשמה
// על כרטיס הילד תיתפס כאן בלי שום תרגום באמצע.
const ALLERGEN_NAME = {
  milk: 'חלב', egg: 'ביצים', peanut: 'בוטנים',
  nuts: 'אגוזים', sesame: 'שומשום', gluten: 'גלוטן',
};

// הארוחות שחייבות להופיע בכל יום. נשנוש הוא לא חובה — יש ימים
// שבהם ההורים שולחים נשנוש מהבית, וזו לא תקלה.
const REQUIRED = ['breakfast', 'lunch'];

const listNames = ns => ns.length === 1 ? ns[0]
  : ns.slice(0, -1).join(', ') + ' ו' + ns[ns.length - 1];
const TIMES = { 2:'פעמיים', 3:'שלוש פעמים', 4:'ארבע פעמים', 5:'חמש פעמים' };
const times = n => TIMES[n] || (n + ' פעמים');
// כל הניסוחים כאן נמנעים מפועל שמתאים את עצמו למין: שם של מנה יכול
// להיות זכר או נקבה ("מרק" מול "חביתה"), ואת המין של ילד אסור לנחש.
const q = s => '\u00ab' + s + '\u00bb';

function checkWeek(opt) {
  const week = opt.week || {};
  const dishes = opt.dishes || {};
  const sens = opt.sensitivities || [];        // [{ name, codes:[] }]
  const meals = opt.meals || [];
  const days = week.days || {};
  const out = [];
  // אילו ימים בכלל פעילים — מפרופיל הגן. גן שסגור בשישי לא אמור לקבל
  // התרעה על יום שישי ריק.
  const DAY_KEYS = (opt.days && opt.days.length) ? opt.days.slice() : ALL_DAYS.slice(0, 5);
  // ארוחה שמגיעה מהבית היא לא ארוחה חסרה. זו ההבחנה שבלעדיה הבדיקה
  // תצעק על יום שישי בכל גן שההורים שולחים בו אוכל.
  const home = opt.fromHome || [];
  const fromHome = (d, m) => home.some(h => h.day === d && h.meal === m);
  const mealName = k => (meals.find(m => m.key === k) || {}).name || k;

  const at = (day, meal) => ((days[day] || {})[meal] || []);

  // ---- 1 · ארוחה חסרה, ויום ריק לגמרי ----
  DAY_KEYS.forEach(day => {
    const total = meals.reduce((n, m) => n + at(day, m.key).length, 0)
      + meals.reduce((n, m) => n + (fromHome(day, m.key) ? 1 : 0), 0);
    if (!total) {
      out.push({ level: 'warn', day, meal: null,
        text: `יום ${DAY_NAMES[day]} ריק לגמרי — אין בו אף מנה.` });
      return;                                   // לא להציף אותו יום בארבע התרעות
    }
    REQUIRED.forEach(mk => {
      if (!at(day, mk).length && !fromHome(day, mk)) {
        out.push({ level: 'warn', day, meal: mk,
          text: `חסרה ${mealName(mk)} ביום ${DAY_NAMES[day]}.` });
      }
    });
  });

  // ---- 2 · מנה שחוזרת ----
  // ספירה אחת לכל השבוע, ולא ספירה ליום: מנה שמופיעה פעמיים באותו
  // יום היא כנראה טעות הקלדה, ופעמיים בשבוע היא שאלה של גיוון.
  const seen = {}, main = {};
  DAY_KEYS.forEach(day => meals.forEach(m => at(day, m.key).forEach(id => {
    (seen[id] = seen[id] || []).push({ day, meal: m.key });
    // נשנוש שחוזר כל יום הוא לא תקלה — פירות העונה אמורים לחזור.
    // הגיוון נמדד על ארוחת הבוקר והצהריים בלבד.
    if (REQUIRED.indexOf(m.key) >= 0) (main[id] = main[id] || []).push({ day, meal: m.key });
  })));
  Object.keys(main).forEach(id => {
    const hits = main[id];
    if (hits.length < 2) return;
    const name = (dishes[id] && dishes[id].name) || 'מנה';
    const where = listNames(hits.map(h => DAY_NAMES[h.day]));
    out.push({ level: hits.length >= 3 ? 'warn' : 'note',
      day: hits[1].day, meal: hits[1].meal,
      text: `${q(name)} — ${times(hits.length)} השבוע: ${where}.` });
  });

  // ---- 3 · אלרגן שסומן בקבוצה ----
  // זו הבדיקה היחידה כאן שיכולה להיות קריטית, ולכן היא נוקבת בשם
  // הילד: "מכיל חלב" לבד לא אומר לגננת מה לעשות.
  const byCode = {};
  sens.forEach(s => (s.codes || []).forEach(c => (byCode[c] = byCode[c] || []).push(s.name)));
  const flagged = {};
  DAY_KEYS.forEach(day => meals.forEach(m => at(day, m.key).forEach(id => {
    const d = dishes[id];
    if (!d || !Array.isArray(d.allergens)) return;
    d.allergens.forEach(code => {
      const kids = byCode[code];
      if (!kids || !kids.length) return;
      const key = id + '|' + code;
      if (flagged[key]) return;                 // פעם אחת למנה, לא בכל יום
      flagged[key] = true;
      out.push({ level: 'warn', day, meal: m.key,
        text: `${ALLERGEN_NAME[code] || code} ב${q(d.name)} — `
            + `רגישות אצל ${listNames(kids)}.` });
    });
  })));

  // ---- 4 · מנות שעוד לא סומנו ----
  // מסך שמראה רק את מה שיש מסתיר את מה שחסר. בלי ההתרעה הזו בדיקת
  // האלרגנים נראית נקייה בדיוק כשהיא הכי חסרת ערך.
  const used = Object.keys(seen);
  const unmarked = used.filter(id => dishes[id] && !dishes[id].allergensSet)
                       .map(id => dishes[id].name);
  if (unmarked.length && sens.length) {
    out.push({ level: 'note', day: null, meal: null,
      text: unmarked.length === 1
        ? `${q(unmarked[0])} — עוד בלי סימון אלרגנים, ולכן מחוץ לבדיקה.`
        : `${unmarked.length} מנות עוד בלי סימון אלרגנים, ולכן מחוץ לבדיקה: `
          + unmarked.map(q).join(', ') + '.' });
  }

  // ---- 5 · גיוון ----
  const lunches = DAY_KEYS.reduce((n, d) => n + at(d, 'lunch').length, 0);
  const distinct = new Set(DAY_KEYS.flatMap(d => at(d, 'lunch'))).size;
  if (lunches >= 5 && distinct <= 2) {
    out.push({ level: 'note', day: null, meal: null,
      text: `כל ארוחות הצהריים השבוע הן ${distinct} מנות בלבד.` });
  }

  out.sort((a, b) => (a.level === b.level) ? 0 : (a.level === 'warn' ? -1 : 1));
  return out;
}

const EXPORTS = { checkWeek, DAY_NAMES, ALL_DAYS, ALLERGEN_NAME };
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
root.MenuCheck = EXPORTS;

})(typeof globalThis !== 'undefined' ? globalThis : this);
