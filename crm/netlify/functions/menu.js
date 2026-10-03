// בניית תפריט — מאגר המנות, השבועות וההגדרות.
//
// האחסון יושב בטבלת events כ-JSON, בדיוק כמו סידור הישיבה וסידור
// המזרונים: אין הרשאה ליצור טבלאות, ולכן שלושה ערכי calendar ייעודיים.
//
//   menu-dish  · category = מזהה המנה  · title = שם המנה
//   menu       · category = 'standing'  · title = שם התפריט
//   menu-ex    · category = YYYY-MM-DD  · חריג לתאריך מסוים
//
// **התפריט קבוע, לא שבועי.** הגננת לא בונה אותו כל שבוע אלא עורכת
// אותו כשמשהו משתנה; לכן יש רשומה אחת ולא רשומה לשבוע. שינוי חד-פעמי
// ליום מסוים הוא חריג ולא עריכה של התפריט הקבוע — אחרת היא תצטרך
// לזכור להחזיר אותו, וזה בדיוק המקום שבו מערכות נשברות.
//
// הגדרות האוכל — כמה ארוחות, אילו ימים, מה מגיע מהבית, העובדות
// להורים — יושבות ב-garden-profile תחת `food` ולא כאן. ראו את
// "העיקרון הראשון" ב-CLAUDE.md.
//
// לטבלת events אין updated_at — זמן העדכון נשמר בתוך ה-JSON עצמו.

const { supabase, auditLog, validateGardenScope, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL_DISH = 'menu-dish';
const CAL_MENU = 'menu';
const CAL_EX = 'menu-ex';
const STANDING = 'standing';

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

const uid = () => 'd' + Math.random().toString(36).slice(2, 9);

const rowToDish = r => Object.assign({ id: r.category, name: r.title }, parse(r.notes));
const rowToMenu = r => Object.assign(
  { id: r.category, name: r.title, updated: r.event_date }, parse(r.notes));
const rowToEx = r => Object.assign({ date: r.category, note: r.title }, parse(r.notes));

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
      const [dishRes, menuRes, exRes] = await Promise.all([
        supabase.from('events').select('id,category,title,notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_DISH),
        supabase.from('events').select('id,category,title,notes,event_date')
          .eq('garden_id', garden_id).eq('calendar', CAL_MENU),
        supabase.from('events').select('id,category,title,notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_EX),
      ]);
      if (dishRes.error) throw dishRes.error;
      if (menuRes.error) throw menuRes.error;

      const dishes = (dishRes.data || []).map(rowToDish)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
      const menus = (menuRes.data || []).map(rowToMenu);
      const menu = menus.find(m => m.id === STANDING) || null;
      // חריגים שעברו לא מעניינים אף אחד, והם היו הופכים את הדף לארכיון
      const t = today();
      const exceptions = (exRes.data || []).map(rowToEx)
        .filter(x => x.date >= t)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      return json(200, { success: true, dishes, menu, menus, exceptions, seed: SEED });
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
          // המתכון הוא שכבה אופציונלית מתחת למנה, ולא שדות של המנה.
          // גננת שרוצה רק תפריט לא נתקלת בכמויות אף פעם; מי שמבשלת
          // מקבלת הכל. הכמויות **לילד אחד** — מתכון שכתוב "ל-20 ילדים"
          // הופך לשגוי ברגע שנרשם ילד, והמערכת כבר יודעת כמה יש.
          recipe: d.recipe || null,
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

      // ---- התפריט הקבוע ----
      if (b.action === 'menu') {
        const m = b.menu || {};
        const id = m.id || STANDING;
        const payload = {
          days: m.days || {},
          template: m.template || 'table',
          infoPage: m.infoPage !== false,
          live: m.live !== false,
          // שמות המנות נצרבים לתוך התפריט. מנה שתימחק מהמאגר מחר לא
          // תמחק את עצמה מהדף שההורים פתוחים עליו.
          names: m.names || {},
        };
        await upsert(garden_id, CAL_MENU, id, m.name || 'התפריט שלנו', payload);
        await auditLog(garden_id, uidUser, 'saved', 'menu', id, {});
        return json(200, { success: true });
      }

      // ---- חריג ליום מסוים ----
      // לא נוגע בתפריט הקבוע. מופיע להורים כל עוד התאריך לא עבר,
      // ואחר כך נעלם מעצמו בלי שאף אחד צריך לנקות.
      if (b.action === 'exception') {
        const x = b.exception || {};
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date || ''))) {
          return json(400, { success: false, error: 'חסר תאריך לחריג' });
        }
        await upsert(garden_id, CAL_EX, x.date, x.note || 'שינוי בתפריט', {
          day: x.day || '', cancelled: x.cancelled || [], meals: x.meals || null,
        });
        await auditLog(garden_id, uidUser, 'saved', 'menu-ex', x.date, {});
        return json(200, { success: true });
      }

      return json(400, { success: false, error: 'פעולה לא מוכרת' });
    }

    // ---- מחיקה: לפח, וניתן לשחזור ----
    if (event.httpMethod === 'DELETE') {
      const path = event.path.split('/').filter(Boolean);
      const key = decodeURIComponent(path[path.length - 1] || '');
      const cal = q.kind === 'menu' ? CAL_MENU : q.kind === 'exception' ? CAL_EX : CAL_DISH;
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
