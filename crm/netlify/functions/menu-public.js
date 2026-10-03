// PUBLIC — התפריט שההורים פותחים ב-/menu. בלי התחברות.
//
// GET /menu-public?garden_id=   -> התפריט הקבוע + חריגים קרובים
//
// מחזיר JSON בלבד; הציור קורה ב-crm/html/menu.html עם js/menu-render.js,
// אותו קובץ שמצייר את התצוגה המקדימה בבונה.
//
// **התפריט קבוע ולא שבועי**, ולכן אין כאן "השבוע הנוכחי" ואין תאריכים
// — יש ימי השבוע, מתי הוא עודכן, ושינויים חד-פעמיים קרובים.
//
// תפריט שעוד לא הועלה לאוויר (`live:false`) לא יוצא מכאן.

const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב
const CAL_MENU = 'menu';
const CAL_EX = 'menu-ex';
const CAL_PROFILE = 'garden-profile';
const STANDING = 'standing';

const json = (c, b) => ({
  statusCode: c,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(b),
});
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + n);
  const p = v => String(v).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;

    const [mRes, xRes, pRes, gRes] = await Promise.all([
      supabase.from('events').select('category,title,notes,event_date')
        .eq('garden_id', gid).eq('calendar', CAL_MENU).eq('category', STANDING).limit(1),
      supabase.from('events').select('category,title,notes')
        .eq('garden_id', gid).eq('calendar', CAL_EX),
      supabase.from('events').select('notes')
        .eq('garden_id', gid).eq('calendar', CAL_PROFILE).eq('category', 'profile').limit(1),
      supabase.from('gardens').select('name').eq('id', gid).limit(1),
    ]);
    if (mRes.error) throw mRes.error;

    const row = (mRes.data && mRes.data[0]) || null;
    const menu = row
      ? Object.assign({ name: row.title, updated: row.event_date }, parse(row.notes))
      : null;
    if (!menu || menu.live === false) return json(200, { success: true, menu: null });

    // רק שבועיים קדימה. חריג לעוד חודשיים הוא רעש בדף שההורים
    // פותחים היום.
    const t = today(), until = addDays(t, 14);
    const exceptions = (xRes.data || [])
      .map(r => Object.assign({ date: r.category, note: r.title }, parse(r.notes)))
      .filter(x => x.date >= t && x.date <= until)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // הגדרות האוכל מגיעות מפרופיל הגן — אילו ימים פעילים, אילו ארוחות,
    // מה מגיע מהבית, והעובדות שמופיעות בעמוד המידע.
    const profile = (pRes.data && pRes.data.length) ? parse(pRes.data[0].notes) : {};
    const food = profile.food || {};
    const settings = {
      facts: food.facts || [],
      meals: food.meals || null,
      days: food.days || null,
      fromHome: food.fromHome || [],
    };
    const garden = (gRes.data && gRes.data.length && gRes.data[0].name) || 'הגן';

    // שמות המנות מגיעים מתוך התפריט עצמו ולא מהמאגר: הדף חייב להישאר
    // קריא גם אחרי שמנה נמחקה מהמאגר.
    const dishes = {};
    Object.keys(menu.names || {}).forEach(id => { dishes[id] = { name: menu.names[id] }; });

    return json(200, { success: true, menu, dishes, settings, garden, exceptions });
  } catch (err) {
    console.error('menu-public error:', err);
    return json(500, { success: false, error: err.message });
  }
};
