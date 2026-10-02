// PUBLIC — התפריט שההורים פותחים ב-/menu. בלי התחברות.
//
// GET /menu-public?garden_id=            -> השבוע המפורסם האחרון
// GET /menu-public?garden_id=&week=YYYY-MM-DD  -> שבוע מסוים, אם פורסם
//
// מחזיר JSON בלבד; הציור קורה ב-crm/html/menu.html עם js/menu-render.js,
// אותו קובץ שמצייר את התצוגה המקדימה בבונה.
//
// **רק שבוע שפורסם יוצא מכאן.** טיוטה של הגננת לא דולפת להורים גם אם
// מישהו ינחש את התאריך שלה.

const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב
const CAL_WEEK = 'menu';
const CAL_SET = 'menu-set';

const json = (c, b) => ({
  statusCode: c,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(b),
});
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;

    const [weekRes, setRes, gRes] = await Promise.all([
      supabase.from('events').select('category,title,notes')
        .eq('garden_id', gid).eq('calendar', CAL_WEEK),
      supabase.from('events').select('notes')
        .eq('garden_id', gid).eq('calendar', CAL_SET).eq('category', 'settings').limit(1),
      supabase.from('gardens').select('name').eq('id', gid).limit(1),
    ]);
    if (weekRes.error) throw weekRes.error;

    const published = (weekRes.data || [])
      .map(r => Object.assign({ weekOf: r.category, name: r.title }, parse(r.notes)))
      .filter(w => w.published);

    let week = null;
    if (q.week) {
      week = published.find(w => w.weekOf === q.week) || null;
    } else {
      // השבוע הנוכחי אם פורסם, אחרת האחרון שפורסם. הורה שפותח את
      // הקישור ביום שישי עדיין צריך לראות משהו ולא עמוד ריק.
      const d = new Date(), p = n => String(n).padStart(2, '0');
      const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const sorted = published.slice()
        .sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)));
      week = sorted.find(w => w.weekOf <= t) || sorted[0] || null;
    }

    if (!week) return json(200, { success: true, week: null });

    const settings = (setRes.data && setRes.data.length) ? parse(setRes.data[0].notes) : {};
    const garden = (gRes.data && gRes.data.length && gRes.data[0].name) || 'הגן';

    // המנות נשלחות מתוך השבוע עצמו ולא מהמאגר: הדף שההורים קיבלו
    // חייב להישאר קריא גם אחרי שמנה נמחקה מהמאגר.
    const dishes = {};
    Object.keys(week.names || {}).forEach(id => { dishes[id] = { name: week.names[id] }; });

    return json(200, {
      success: true, week, dishes, settings, garden,
      weeks: published.map(w => w.weekOf).sort().reverse(),
    });
  } catch (err) {
    console.error('menu-public error:', err);
    return json(500, { success: false, error: err.message });
  }
};
