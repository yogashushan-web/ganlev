// בניית תפריט — מאגר המנות, השבועות וההגדרות.
//
// האחסון יושב בטבלת events כ-JSON, בדיוק כמו סידור הישיבה וסידור
// המזרונים: אין הרשאה ליצור טבלאות, ולכן שלושה ערכי calendar ייעודיים.
//
//   menu-dish  · category = מזהה המנה   · title = שם המנה
//   menu       · category = תאריך ראשון · title = שם התפריט
//   menu-set   · category = 'settings'  · title = 'מידע על האוכל'
//
// לטבלת events אין updated_at — זמן העדכון נשמר בתוך ה-JSON עצמו.

const { supabase, auditLog, validateGardenScope, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL_DISH = 'menu-dish';
const CAL_WEEK = 'menu';
const CAL_SET = 'menu-set';
const SET_KEY = 'settings';

const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// המאגר שהגן מתחיל ממנו. **בלי סימון אלרגנים** בכוונה: לנחש שיש ביצים
// בקציצות ירק זו טעות שעלולה להגיע לילד אלרגי. המנות נכנסות לא
// מסומנות, והבדיקה אומרת במפורש אילו מהן עוד לא נבדקו.
const SEED = [
  { cat: 'בוקר',   name: 'חביתה שקשוקה' },
  { cat: 'בוקר',   name: 'חביתה מעדשים אדומות' },
  { cat: 'בוקר',   name: 'דייסת שיבולת שועל עם פירות' },
  { cat: 'בוקר',   name: 'עוגת שיבולת שועל ופירות' },
  { cat: 'בוקר',   name: 'כריכים וסלט' },
  { cat: 'צהריים', name: 'מרק עדשים' },
  { cat: 'צהריים', name: 'מרק עגבניות' },
  { cat: 'צהריים', name: 'מג׳דרה' },
  { cat: 'צהריים', name: 'אורז ושעועית' },
  { cat: 'צהריים', name: 'כוסמת עם ירקות' },
  { cat: 'צהריים', name: 'קציצות ירק' },
  { cat: 'צהריים', name: 'פסטה ברוטב עגבניות' },
  { cat: 'נשנוש',  name: 'פירות העונה' },
  { cat: 'נשנוש',  name: 'ירקות' },
  { cat: 'נשנוש',  name: 'יוגורט ופירות' },
];

// העובדות הקבועות של גן לב, כפי שיואל מסר אותן. נכתבות פעם אחת
// ומופיעות אוטומטית בעמוד המידע שמצורף לתפריט.
const SEED_FACTS = [
  'התפריט צמחוני',
  'האוכל מבושל במקום בגן',
  'משתמשים בחומרי גלם טריים',
  'המנות עשויות להשתנות במהלך השנה בהתאם לרגישויות ולצרכים שמתגלים בקבוצה',
  'בימי שישי ארוחת הבוקר מובאת מהבית על ידי ההורים ומחולקת בגן',
];

const uid = () => 'd' + Math.random().toString(36).slice(2, 9);

const rowToDish = r => Object.assign({ id: r.category, name: r.title }, parse(r.notes));
const rowToWeek = r => {
  const w = parse(r.notes);
  return Object.assign({ weekOf: r.category, name: r.title, updated: r.event_date }, w);
};

async function findRow(garden_id, cal, category) {
  const { data } = await supabase.from('events')
    .select('id').eq('garden_id', garden_id).eq('calendar', cal)
    .eq('category', category).limit(1);
  return (data && data.length) ? data[0] : null;
}

async function upsert(garden_id, cal, category, title, payload) {
  payload.saved_at = new Date().toISOString();
  const notes = JSON.stringify(payload);
  const row = await findRow(garden_id, cal, category);
  if (row) {
    const { error } = await supabase.from('events')
      .update({ title, notes, event_date: today() }).eq('id', row.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('events')
      .insert({ garden_id, calendar: cal, category, title, event_date: today(), notes });
    if (error) throw error;
  }
}

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    validateGardenScope(user.garden_id, garden_id, user.role);
    // ב-withAuth המזהה יושב ב-sub. השימוש ב-user.id במסכים הישנים
    // מעביר undefined ליומן הפעולות.
    const uidUser = user.sub || user.id;

    if (event.httpMethod === 'GET') {
      const [dishRes, weekRes, setRes] = await Promise.all([
        supabase.from('events').select('id,category,title,notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_DISH),
        supabase.from('events').select('id,category,title,notes,event_date')
          .eq('garden_id', garden_id).eq('calendar', CAL_WEEK),
        supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_SET)
          .eq('category', SET_KEY).limit(1),
      ]);
      if (dishRes.error) throw dishRes.error;
      if (weekRes.error) throw weekRes.error;

      const dishes = (dishRes.data || []).map(rowToDish)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
      const weeks = (weekRes.data || []).map(rowToWeek)
        .sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)));
      const settings = (setRes.data && setRes.data.length)
        ? parse(setRes.data[0].notes) : { facts: SEED_FACTS, seeded: false };

      return json(200, { success: true, dishes, weeks, settings, seed: SEED });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      // ---- מאגר המנות ----
      if (b.action === 'dish') {
        const d = b.dish || {};
        if (!String(d.name || '').trim()) {
          return json(400, { success: false, error: 'למנה חייב להיות שם' });
        }
        d.id = d.id || uid();
        const name = String(d.name).trim();
        const payload = {
          cat: d.cat || 'צהריים',
          ingredients: d.ingredients || [],
          allergens: d.allergens || [],
          // מנה "בלי אלרגנים" ומנה "שעוד לא נבדקה" הן לא אותו דבר,
          // ושתיהן נראות כרשימה ריקה. הדגל הזה מבדיל ביניהן.
          allergensSet: !!d.allergensSet,
          tags: d.tags || [],
          note: d.note || '',
          active: d.active !== false,
        };
        await upsert(garden_id, CAL_DISH, d.id, name, payload);
        await auditLog(garden_id, uidUser, 'saved', 'menu-dish', d.id, { name });
        return json(200, { success: true, id: d.id });
      }

      // המאגר הראשוני — פעולה מפורשת של המשתמשת מהמסך הריק,
      // ולא זריעה שקטה מאחורי הגב שלה.
      if (b.action === 'seed') {
        const { data: have } = await supabase.from('events')
          .select('id').eq('garden_id', garden_id).eq('calendar', CAL_DISH).limit(1);
        if (have && have.length) {
          return json(200, { success: true, added: 0 });
        }
        const rows = SEED.map(d => ({
          garden_id, calendar: CAL_DISH, category: uid(), title: d.name,
          event_date: today(),
          notes: JSON.stringify({ cat: d.cat, ingredients: [], allergens: [],
                                  allergensSet: false, tags: [], note: '', active: true }),
        }));
        const { error } = await supabase.from('events').insert(rows);
        if (error) throw error;
        await auditLog(garden_id, uidUser, 'seeded', 'menu-dish', null, { n: rows.length });
        return json(200, { success: true, added: rows.length });
      }

      // ---- השבוע ----
      if (b.action === 'week') {
        const w = b.week || {};
        if (!w.weekOf) return json(400, { success: false, error: 'חסר תאריך לשבוע' });
        const payload = {
          days: w.days || {},
          template: w.template || 'table',
          infoPage: w.infoPage !== false,
          published: !!w.published,
          publishedAt: w.published ? (w.publishedAt || new Date().toISOString()) : null,
          // שמות המנות נצרבים לתוך השבוע בשעת הפרסום. מנה שתימחק
          // מהמאגר מחר לא תמחק את עצמה מהתפריט שההורים כבר קיבלו.
          names: w.names || {},
        };
        await upsert(garden_id, CAL_WEEK, w.weekOf, w.name || ('תפריט ' + w.weekOf), payload);
        await auditLog(garden_id, uidUser, w.published ? 'published' : 'saved',
                       'menu-week', w.weekOf, { published: !!w.published });
        return json(200, { success: true });
      }

      // ---- מידע קבוע ----
      if (b.action === 'settings') {
        const s = b.settings || {};
        await upsert(garden_id, CAL_SET, SET_KEY, 'מידע על האוכל', {
          facts: s.facts || [], meals: s.meals || null, cats: s.cats || null, seeded: true,
        });
        await auditLog(garden_id, uidUser, 'saved', 'menu-set', SET_KEY, {});
        return json(200, { success: true });
      }

      return json(400, { success: false, error: 'פעולה לא מוכרת' });
    }

    // ---- מחיקה: לפח, וניתן לשחזור ----
    if (event.httpMethod === 'DELETE') {
      const path = event.path.split('/').filter(Boolean);
      const key = decodeURIComponent(path[path.length - 1] || '');
      const cal = q.kind === 'week' ? CAL_WEEK : CAL_DISH;
      const { data: rec } = await supabase.from('events')
        .select('*').eq('garden_id', garden_id).eq('calendar', cal)
        .eq('category', key).limit(1);
      if (rec && rec.length) {
        await moveToTrash('events', rec[0], garden_id);
        await supabase.from('events').delete().eq('id', rec[0].id);
      }
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('menu error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
