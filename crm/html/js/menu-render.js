// רינדור התפריט — קובץ אחד שמשרת שני מקומות.
//
// אותו קוד בדיוק מצייר את התצוגה המקדימה בתוך הבונה ואת הדף שההורים
// מקבלים. זו הנקודה: תצוגה מקדימה שמצויירת בקוד אחר מהדף האמיתי היא
// לא תצוגה מקדימה, והפער בין השניים מתגלה רק אחרי הפרסום.
//
// נטען גם בדפדפן (window.MenuRender) וגם ב-node, כדי שאפשר יהיה
// להריץ אותו מקומית ולהסתכל על התוצאה.
//
// הדף נפתח כמעט תמיד בוואטסאפ בטלפון, ולכן הוא נבנה מהטלפון כלפי
// מעלה. אותו CSS גם מדפיס: בסוף יש @page A4.

// עטוף ב-IIFE בכוונה: קובצי script רגילים חולקים מרחב שמות גלובלי
// אחד, והקובץ הזה נטען לצד menu-check.js ולצד הסקריפט של המסך — שניהם
// מצהירים על שמות כמו esc ו-DAYS. בלי העטיפה ההצהרה הכפולה מפילה את
// כל הסקריפט בשקט, והדף נתקע על "טוען…".
(function (root) {
'use strict';

// שישה ימים. שישי נכנס כי בגנים רבים יש בו ארוחה — לרוב ארוחת בוקר
// שמגיעה מהבית — ויום שלא מופיע בתוכנית הוא יום שאף אחד לא תכנן.
// אילו ימים ואילו ארוחות באמת פעילים נקבע בפרופיל הגן, לא כאן.
const DAYS = [
  { key: 'sun', name: 'ראשון' },
  { key: 'mon', name: 'שני' },
  { key: 'tue', name: 'שלישי' },
  { key: 'wed', name: 'רביעי' },
  { key: 'thu', name: 'חמישי' },
  { key: 'fri', name: 'שישי' },
];

// ארבע הארוחות, עם השעות שמופיעות בתבנית "היום שלנו".
// הגן יכול לשנות אותן ב-menu-settings, ולכן זו רק ברירת המחדל.
const MEALS = [
  { key: 'breakfast', name: 'ארוחת בוקר', time: '08:30', icon: 'bowl' },
  { key: 'snack1',    name: 'נשנוש',      time: '10:30', icon: 'fruit' },
  { key: 'lunch',     name: 'ארוחת צהריים', time: '12:00', icon: 'pot' },
  { key: 'snack2',    name: 'נשנוש',      time: '15:30', icon: 'fruit' },
];

// אייקוני קו ולא אמוג'י: אמוג'י נראה אחרת בכל מכשיר, ובהדפסה
// בשחור-לבן הוא נהפך לריבוע. שלוש צורות קצרות עושות את אותו דבר.
const ICONS = {
  bowl: '<path d="M3 10h18c0 5-4 9-9 9s-9-4-9-9z"/><path d="M8.5 6.5V4M12 6.2V3.4M15.5 6.5V4"/>',
  fruit: '<path d="M12 8c-1-2-3-2.6-4.6-1.7C5.3 7.5 4.6 10.6 6 14c1 2.5 2.6 4.6 4.2 5.4.9.5 1.7.5 2.6 0 1.6-.8 3.2-2.9 4.2-5.4 1.4-3.4.7-6.5-1.4-7.7C14 5.4 13 6 12 8z"/><path d="M12 7.6V5.2M12 5.2c1.5-.3 2.4-1.3 2.6-2.6-1.5.1-2.4.9-2.6 2.6z"/>',
  pot: '<path d="M4.5 9h15v5.5c0 2.5-2 4.5-4.5 4.5H9c-2.5 0-4.5-2-4.5-4.5z"/><path d="M4.5 11H2.8M19.5 11h1.7"/><path d="M9 6V4.6M12 5.8V4.2M15 6V4.6"/>',
};
const icon = n => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" '
  + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
  + 'stroke-linejoin="round">' + (ICONS[n] || ICONS.bowl) + '</svg>';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// תאריכים נשמרים כ-YYYY-MM-DD ומחושבים ב*שעון מקומי* בלבד.
// `new Date(iso).toISOString()` מחזיר את התאריך לפי UTC, ובישראל זה
// מזיז הכל יום אחד אחורה — באג שנתפס ברינדור הראשון של הדף הזה.
const P2 = n => String(n).padStart(2, '0');
function parseIso(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : new Date(NaN);
}
const toIso = d => `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())}`;
// 26.09.2026 — הפורמט האחיד של האתר
function fmt(iso) {
  const d = parseIso(iso);
  return isNaN(d) ? '' : `${P2(d.getDate())}.${P2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function addDays(iso, n) {
  const d = parseIso(iso);
  if (isNaN(d)) return iso;
  d.setDate(d.getDate() + n);
  return toIso(d);
}

// ---------- התבניות ----------

// 1 · טבלה שבועית. ימים בעמודות, ארוחות בשורות.
// בטלפון טבלה של חמש עמודות לא קריאה, ולכן מתחת ל-760 פיקסל היא
// נפרסת לאותם כרטיסים של תבנית 2 — אותו מידע, מבנה שנכנס למסך.
function tplTable(ctx) {
  const { meals, cell, days } = ctx;
  let s = '<div class="scroll"><table class="wk"><thead><tr><th class="corner"></th>';
  days.forEach(d => {
    s += `<th><span class="dn">${esc(d.name)}</span></th>`;
  });
  s += '</tr></thead><tbody>';
  meals.forEach(m => {
    s += `<tr><th class="mh">${icon(m.icon)}<span>${esc(m.name)}</span>`
       + `<span class="tm">${esc(m.time)}</span></th>`;
    days.forEach(d => {
      const list = cell(d.key, m.key);
      const home = ctx.fromHome(d.key, m.key);
      s += '<td>' + (list.length
        ? list.map(n => `<span class="d">${esc(n)}</span>`).join('')
        : home ? '<span class="home">מהבית</span>' : '<span class="none">—</span>') + '</td>';
    });
    s += '</tr>';
  });
  return s + '</tbody></table></div>' + tplCards(ctx, true);
}

// 2 · כרטיס ליום
function tplCards(ctx, phoneOnly) {
  const { meals, cell, days } = ctx;
  let s = `<div class="days${phoneOnly ? ' phone' : ''}">`;
  days.forEach(d => {
    s += `<section class="day"><h3>${esc(d.name)}</h3>`;
    meals.forEach(m => {
      const list = cell(d.key, m.key);
      const home = ctx.fromHome(d.key, m.key);
      if (!list.length && !home) return;
      if (!list.length) {
        s += `<div class="meal"><div class="mt">${icon(m.icon)}`
           + `<span>${esc(m.name)}</span><span class="tm">${esc(m.time)}</span></div>`
           + '<ul><li class="home">מהבית</li></ul></div>';
        return;
      }
      // השעה כאן היא מה שמבדיל בין נשנוש הבוקר לנשנוש אחר הצהריים
      s += `<div class="meal"><div class="mt">${icon(m.icon)}`
         + `<span>${esc(m.name)}</span><span class="tm">${esc(m.time)}</span>`
         + `</div><ul>`
         + list.map(n => `<li>${esc(n)}</li>`).join('') + '</ul></div>';
    });
    s += '</section>';
  });
  return s + '</div>';
}

// 3 · היום שלנו — אותו יום חוזר, לפי סדר השעות.
// זו התבנית היחידה שמסבירה להורה *מתי* הילד אוכל, ולכן היא שימושית
// במיוחד בשבוע הראשון של ילד חדש.
function tplDay(ctx) {
  const { meals, cell, days } = ctx;
  let s = '<div class="days">';
  days.forEach(d => {
    s += `<section class="day tl"><h3>${esc(d.name)}</h3><ol class="line">`;
    meals.forEach(m => {
      const list = cell(d.key, m.key);
      const home = ctx.fromHome(d.key, m.key);
      s += `<li${list.length || home ? '' : ' class="off"'}><span class="hh">${esc(m.time)}</span>`
         + `<div class="lb"><span class="mn">${esc(m.name)}</span>`
         + (list.length
            ? '<span class="dl">' + list.map(esc).join(' · ') + '</span>'
            : home ? '<span class="dl home">מהבית</span>' : '<span class="none">—</span>')
         + '</div></li>';
    });
    s += '</ol></section>';
  });
  return s + '</div>';
}

// 4 · מהמטבח שלנו — אותו תוכן, יותר מותג ופחות לוח.
// העובדות על האוכל עולות למעלה במקום להידחק לעמוד שני.
function tplKitchen(ctx) {
  const facts = (ctx.settings.facts || []).slice(0, 3);
  let s = '<div class="kitchen">';
  if (facts.length) {
    s += '<div class="band">' + facts.map(f =>
      `<span class="fact">${esc(f)}</span>`).join('') + '</div>';
  }
  s += tplCards(ctx);
  return s + '</div>';
}

const TEMPLATES = {
  table:   { name: 'טבלה שבועית', fn: tplTable },
  cards:   { name: 'כרטיס ליום',  fn: tplCards },
  day:     { name: 'היום שלנו',   fn: tplDay },
  kitchen: { name: 'מהמטבח שלנו', fn: tplKitchen },
};

// ---------- עמוד המידע ----------
function infoSection(settings, skip) {
  // "מהמטבח שלנו" כבר הציג את הראשונות ברצועה העליונה. לחזור עליהן
  // כאן היה גורם לעמוד המידע להיראות כמו תקלה.
  const facts = (settings.facts || []).slice(skip || 0);
  if (!facts.length) return '';
  return '<section class="info"><h2>על האוכל שלנו</h2><ul>'
    + facts.map(f => `<li>${esc(f)}</li>`).join('')
    + '</ul></section>';
}

// ---------- הרכבה ----------
// התפריט הוא **קבוע**, לא שבועי. הגננת לא בונה אותו כל שבוע — היא
// בונה אותו פעם אחת ועורכת כשמשהו משתנה. לכן אין כאן טווח תאריכים
// ואין "שבוע": יש ימי השבוע, ומתי הוא עודכן לאחרונה.
function renderMenu(opt) {
  const menu = opt.menu || opt.week || {};
  const dishes = opt.dishes || {};
  const settings = opt.settings || {};
  const garden = opt.garden || 'הגן';
  const tpl = TEMPLATES[menu.template] || TEMPLATES.table;
  const meals = (settings.meals && settings.meals.length) ? settings.meals : MEALS;

  // אילו ימים מוצגים בכלל — מהפרופיל. גן שסגור בשישי לא רואה עמודה
  // ריקה, וגן שפתוח בו כן.
  const activeKeys = settings.days && settings.days.length
    ? settings.days : ['sun', 'mon', 'tue', 'wed', 'thu'];
  const days = DAYS.filter(d => activeKeys.indexOf(d.key) >= 0);

  // "מהבית" — ארוחה שההורים שולחים. לא משבצת ריקה שמישהו שכח למלא,
  // ולכן היא נכתבת ולא מוצגת כמקף.
  const home = settings.fromHome || [];
  const fromHome = (day, meal) =>
    home.some(h => h.day === day && h.meal === meal);

  // שם המנה ולא המזהה. מנה שתימחק מהמאגר מחר לא תמחק את עצמה מהתפריט
  // שההורים כבר קיבלו.
  const cell = (day, meal) => {
    const ids = ((menu.days || {})[day] || {})[meal] || [];
    return ids.map(id => (dishes[id] && dishes[id].name)
      || (menu.names && menu.names[id]) || '').filter(Boolean);
  };

  const ctx = { meals, cell, settings, days, fromHome };
  return { body: tpl.fn(ctx), garden, updated: menu.updated || '',
           exceptions: renderExceptions(opt.exceptions, meals),
           infoHtml: menu.infoPage === false ? ''
             : infoSection(settings, tpl === TEMPLATES.kitchen ? 3 : 0) };
}

// חריגים לתאריך מסוים — טיול, חג, יום קצר. הם לא משנים את התפריט
// הקבוע, והם מופיעים רק כל עוד הם רלוונטיים.
function renderExceptions(list, meals) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return '';
  const mn = k => (meals.find(m => m.key === k) || {}).name || '';
  return '<section class="exc"><h2>שינויים קרובים</h2><ul>' + items.map(x => {
    const what = x.cancelled && x.cancelled.length
      ? 'אין ' + x.cancelled.map(mn).filter(Boolean).join(' ו')
      : (x.note || 'שינוי בתפריט');
    return `<li><b>${esc(DAY_NAMES[x.day] || '')} ${esc(fmt(x.date))}</b>`
         + `<span>${esc(what)}${x.note && x.cancelled && x.cancelled.length
              ? ' · ' + esc(x.note) : ''}</span></li>`;
  }).join('') + '</ul></section>';
}
const DAY_NAMES = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי' };

// המעטפת — הכותרת, החריגים, הגוף ועמוד המידע.
function wrapMenu(r) {
  return `<header>
  <p class="gn">${esc(r.garden)}</p>
  <h1>התפריט שלנו</h1>
  ${r.updated ? `<p class="range"><span>עודכן ב-</span><span dir="ltr">${esc(fmt(r.updated))}</span></p>` : ''}
  <div class="rule"></div>
</header>
${r.exceptions}
${r.body}
${r.infoHtml}`;
}

const MENU_CSS = `:root{--ink:#3D3228;--muted:#9B8E82;--faint:#B9AE9F;--brand:#1F3D34;--warm:#C4846C;
 --bg:#F4EFE6;--card:#fff;--soft:#FAF8F4;--line:#E4DED4}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Alef',system-ui,-apple-system,sans-serif;background:var(--bg);
 color:var(--ink);line-height:1.6;-webkit-text-size-adjust:100%}
.wrap{max-width:1000px;margin:0 auto;padding:22px 16px 40px}
.ico{width:1.05em;height:1.05em;flex:0 0 auto}

header{text-align:center;margin-bottom:22px}
.gn{font-size:12px;font-weight:700;letter-spacing:.16em;color:var(--warm);
 margin-bottom:7px}
h1{font-size:clamp(23px,6vw,31px);color:var(--brand);line-height:1.25}
.range{font-size:13.5px;color:var(--muted);margin-top:5px;
 font-variant-numeric:tabular-nums;display:flex;gap:7px;justify-content:center}
.range .sep{color:var(--faint)}
.rule{width:44px;height:2px;background:var(--warm);border-radius:2px;
 margin:13px auto 0;opacity:.55}

/* ---- טבלה שבועית ---- */
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table.wk{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);
 border:1px solid var(--line);border-radius:16px;overflow:hidden;min-width:660px}
.wk th,.wk td{padding:11px 10px;text-align:center;vertical-align:top;
 border-bottom:1px solid var(--line);border-left:1px solid var(--line)}
.wk th:first-child,.wk td:first-child{border-left:0}
.wk tr:last-child th,.wk tr:last-child td{border-bottom:0}
.wk thead th{background:var(--brand);color:#F4EFE6;border-bottom:0;
 border-left-color:rgba(255,255,255,.14)}
.wk thead th.corner{background:var(--brand)}
.dn{display:block;font-size:14.5px;font-weight:700}
.dd{display:block;font-size:11px;opacity:.7;font-variant-numeric:tabular-nums;
 font-weight:400}
.wk th.mh{background:var(--soft);text-align:right;white-space:nowrap;
 display:table-cell}
.wk th.mh span{display:block}
.wk th.mh .ico{display:inline-block;vertical-align:-.17em;margin-left:5px;
 color:var(--warm)}
.wk th.mh>span:first-of-type{display:inline-block;font-size:13.5px;font-weight:700}
.tm{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;
 font-weight:400}
.wk td .d{display:block;font-size:13.5px}
.wk td .d+.d{margin-top:4px;padding-top:4px;border-top:1px dashed var(--line)}
.none{color:var(--faint)}

/* ---- כרטיס ליום ---- */
.days{display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));gap:13px}
.days.phone{display:none}
.day{background:var(--card);border:1px solid var(--line);border-radius:16px;
 padding:15px 15px 14px}
.day h3{font-size:16px;color:var(--brand);display:flex;align-items:baseline;
 justify-content:space-between;gap:8px;padding-bottom:9px;margin-bottom:10px;
 border-bottom:1px solid var(--line)}
.day h3 .dd{display:inline;font-size:11.5px;color:var(--muted);opacity:1}
.meal+.meal{margin-top:11px}
.mt{display:flex;align-items:baseline;gap:6px;font-size:11.5px;font-weight:700;
 color:var(--warm);letter-spacing:.04em}
.mt .ico{align-self:center}
.mt .tm{margin-right:auto}
.meal ul{list-style:none;margin-top:3px;padding-right:21px}
.meal li{font-size:14px;position:relative}
.meal li::before{content:'';position:absolute;right:-13px;top:.62em;width:4px;
 height:4px;border-radius:50%;background:var(--faint)}

/* ---- היום שלנו ---- */
.line{list-style:none;position:relative;padding-right:3px}
.line::before{content:'';position:absolute;right:46px;top:9px;bottom:9px;
 width:1px;background:var(--line)}
.line li{display:flex;gap:11px;align-items:flex-start;padding:7px 0;position:relative}
.line li.off{opacity:.45}
.hh{font-size:11.5px;font-weight:700;color:var(--muted);width:40px;flex:0 0 auto;
 text-align:left;font-variant-numeric:tabular-nums;padding-top:2px}
.lb{flex:1;min-width:0;padding-right:11px;position:relative}
.lb::before{content:'';position:absolute;right:-4px;top:9px;width:7px;height:7px;
 border-radius:50%;background:var(--card);border:1.5px solid var(--warm)}
.line li.off .lb::before{border-color:var(--faint)}
.mn{display:block;font-size:11.5px;font-weight:700;color:var(--warm)}
.dl{display:block;font-size:14px}

/* ---- מהמטבח שלנו ---- */
.band{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:16px}
.fact{background:var(--card);border:1px solid var(--line);border-radius:999px;
 padding:7px 15px;font-size:12.5px;color:var(--muted)}
.kitchen .day h3{color:var(--warm)}

/* ---- עמוד המידע ---- */
.info{margin-top:26px;background:var(--soft);border:1px solid var(--line);
 border-radius:16px;padding:19px 18px}
.info h2{font-size:17px;color:var(--brand);margin-bottom:11px}
.info ul{list-style:none;display:grid;gap:9px}
.info li{font-size:14px;color:var(--muted);padding-right:19px;position:relative}
.info li::before{content:'';position:absolute;right:0;top:.62em;width:6px;height:6px;
 border-radius:50%;background:var(--warm);opacity:.55}

.home{color:var(--muted);font-style:italic}
.exc{background:#fdf6ef;border:1px solid #f0dcc4;border-radius:14px;padding:15px 17px;
 margin-bottom:16px}
.exc h2{font-size:14px;color:var(--warm);margin-bottom:9px}
.exc ul{list-style:none;display:grid;gap:7px}
.exc li{font-size:13.5px;display:flex;gap:9px;flex-wrap:wrap;align-items:baseline}
.exc li b{color:var(--ink)}
.exc li span{color:var(--muted)}
footer{margin-top:24px;text-align:center;font-size:12px;color:var(--faint)}

@media (max-width:760px){
  .scroll{display:none}
  .days.phone{display:grid}
  .days{grid-template-columns:1fr}
}
@media print{
  @page{size:A4;margin:11mm}
  body{background:#fff}
  .wrap{max-width:none;padding:0}
  .scroll{display:block;overflow:visible}
  .days.phone{display:none}
  table.wk{min-width:0;border-radius:10px}
  .day,.info,table.wk{break-inside:avoid}
  .days{grid-template-columns:repeat(5,1fr);gap:7px}
  footer{display:none}
}
`;

const EXPORTS = { renderMenu, wrapMenu, MENU_CSS, TEMPLATES, DAYS, MEALS, fmt, addDays };
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
root.MenuRender = EXPORTS;

})(typeof globalThis !== 'undefined' ? globalThis : this);
