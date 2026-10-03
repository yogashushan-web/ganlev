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

// רגישות שאינה אחת מהשש. ההורים כותבים אותה בטקסט חופשי בכרטיס האישי,
// והיא נשארת שם ולא מגיעה לשום בדיקה — ילד עם אלרגיה לסויה או לקטניות
// פשוט לא ניתן לרישום היום. כאן תופסים את הניסוח ומציעים להוסיף.
//
// לא נרשם אוטומטית. זו הצעה שמישהו מאשר, כי טקסט חופשי מכיל גם
// "אין אלרגיות" ו"בדקנו אלרגיה לחלב ואין".
// הביטוי לא בולע פסיקים בכוונה: "אלרגי לדגים, וגם רגישות לקיווי" הוא
// שתי רגישויות ולא אחת ארוכה, והפסיק הוא מה שעוצר את הראשונה.
const TRIGGER = /(?:אלרגי(?:ה|ת|ת)?|רגיש(?:ות|ה)?)\s*(?:מאוד\s*)?ל\s*([֐-׿\s'"-]{2,40})/g;
const NEGATE = /(?:אין|ללא|לא\s+ידוע|שלילי|נשלל)/;
const STOP = /^(?:כלום|שום|מאכלים|אוכל|דברים|משהו|כל\s)/;

function scanOther(text, knownWords) {
  const t = String(text || '');
  if (!t.trim()) return [];
  const out = [];
  let m;
  TRIGGER.lastIndex = 0;
  while ((m = TRIGGER.exec(t)) !== null) {
    // חלון של 24 תווים לפני הביטוי — "אין אלרגיה לבוטנים" הוא לא רגישות
    const before = t.slice(Math.max(0, m.index - 24), m.index);
    if (NEGATE.test(before)) continue;
    // "סויה ולקטניות" הן שתיים. מפצלים על ו' החיבור ומורידים את הל'
    // שנשארה מ"ולקטניות".
    String(m[1] || '').split(/\s+ו/).forEach((part, i) => {
      let w = part.trim().replace(/^[\s,-]+|[\s,.;-]+$/g, '');
      if (i > 0) w = w.replace(/^ל/, '');
      if (w.length < 2 || w.length > 24 || STOP.test(w)) return;
      if (/רגיש|אלרג/.test(w)) return;
      if (knownWords.some(k => w.indexOf(k) >= 0)) return;   // כבר אחת מהשש
      if (out.indexOf(w) < 0) out.push(w);
    });
  }
  return out.slice(0, 4);
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
      const KNOWN = ALLERGENS.reduce((a, x) => a.concat(x.words), []);
      const other = {};
      (cards || []).forEach(r => {
        const p = parse(r.notes);
        const text = (p.answers || []).map(a => `${a && a.q} ${a && a.a}`).join(' ');
        const found = scanHints(text);
        if (found.length) hints[r.category] = found;
        const extra = scanOther(text, KNOWN);
        if (extra.length) other[r.category] = extra;
      });

      return json(200, { success: true, health, hints, other, allergens: ALLERGENS });
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
