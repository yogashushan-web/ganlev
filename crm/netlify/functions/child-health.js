// אלרגיות ורגישויות מזון של ילדים.
//
// GET  /child-health?garden_id=            -> { health, hints }
// POST /child-health?garden_id= { child_id, allergies:[codes] }
//
// אין עמודה ייעודית ב-children ואין הרשאה ליצור אחת, ולכן משתמשים
// בדפוס שעובד באתר: JSON בתוך events.notes עם calendar ייעודי.
//
// hints: ההורים כבר כתבו על רגישויות בכרטיס האישי, בטקסט חופשי
// ("הרגלי אכילה", "מגבלות רפואיות"). הסריקה כאן מחפשת בו שמות של
// אלרגנים ומחזירה רמזים בלבד — היא לא מסמנת ילד מעצמה, כי טקסט חופשי
// יודע גם לומר "אין אלרגיה לבוטנים" והתוכנה לא מבינה שלילה.

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL = 'child-health';
const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

// שש הנפוצות אצל פעוטות בישראל. shortName הוא מה שנכתב על הדף המודפס.
const ALLERGENS = [
  { code: 'milk',    name: 'חלב',     words: ['חלב', 'לקטוז', 'מוצרי חלב'] },
  { code: 'egg',     name: 'ביצים',   words: ['ביצה', 'ביצים'] },
  { code: 'peanut',  name: 'בוטנים',  words: ['בוטן', 'בוטנים', 'במבה'] },
  { code: 'nuts',    name: 'אגוזים',  words: ['אגוז', 'אגוזים', 'שקד', 'שקדים', 'קשיו', 'פקאן', 'אגוזי מלך'] },
  { code: 'sesame',  name: 'שומשום',  words: ['שומשום', 'טחינה', 'חלבה'] },
  { code: 'gluten',  name: 'גלוטן',   words: ['גלוטן', 'צליאק', 'חיטה'] },
];

function scanHints(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  return ALLERGENS.filter(a => a.words.some(w => t.includes(w))).map(a => a.code);
}

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('events')
        .select('id,category,notes')
        .eq('garden_id', garden_id).eq('calendar', CAL);
      if (error) throw error;

      const health = {};
      (data || []).forEach(r => {
        const p = parse(r.notes);
        if (Array.isArray(p.allergies)) health[r.category] = p.allergies;
      });

      // רמזים מהטקסט החופשי שההורים מילאו בכרטיס האישי
      const hints = {};
      const { data: cards } = await supabase.from('events')
        .select('category,notes')
        .eq('garden_id', garden_id).eq('calendar', 'child-card');
      (cards || []).forEach(r => {
        const p = parse(r.notes);
        const text = (p.answers || []).map(a => `${a && a.q} ${a && a.a}`).join(' ');
        const found = scanHints(text);
        if (found.length) hints[r.category] = found;
      });

      return json(200, { success: true, health, hints, allergens: ALLERGENS });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.child_id) return json(400, { success: false, error: 'חסר מזהה ילד' });
      const list = Array.isArray(b.allergies)
        ? b.allergies.filter(c => typeof c === 'string' && c.trim()).slice(0, 12)
        : [];

      const { data: existing } = await supabase.from('events')
        .select('id').eq('garden_id', garden_id).eq('calendar', CAL)
        .eq('category', b.child_id).limit(1);

      const notes = JSON.stringify({ allergies: list, updated_at: new Date().toISOString() });

      if (existing && existing.length) {
        const { error } = await supabase.from('events')
          .update({ notes, event_date: today() }).eq('id', existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert({
          garden_id, calendar: CAL, category: b.child_id,
          title: 'אלרגיות', event_date: today(), notes,
        });
        if (error) throw error;
      }
      return json(200, { success: true, allergies: list });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('child-health error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
