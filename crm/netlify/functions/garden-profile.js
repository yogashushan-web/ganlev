// פרופיל הגן — השכבה שכל הכלים קוראים ממנה ומעשירים אותה.
//
// ראו את "העיקרון הראשון" ב-CLAUDE.md: לא בונים זרימת עבודה אחת לכל
// הגנים, בונים מערכת שלומדת את הגן ואז מרכיבה את הזרימה שמתאימה לו.
//
// שתי רשומות, שתיהן JSON ב-events (אין הרשאה ליצור טבלאות):
//   garden-profile · category='profile'      · מה שנכון לגן כולו
//   user-pref      · category=<user id>      · מה שנכון למשתמש אחד
//
// **מה שאפשר להסיק לא נשמר כאן.** מספר הילדים, הגילאים ומספר השולחנות
// נגזרים בדפדפן מהנתונים הקיימים בכל טעינה. ערך קפוא הוא ערך ששקרי
// ביום שבו המציאות משתנה, ואף אחד לא מרגיש.

const { supabase, auditLog, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL = 'garden-profile';
const CAL_PREF = 'user-pref';
const KEY = 'profile';

const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// מיזוג עמוק: הכלים כותבים ענף אחד בלבד ("אוכל", "שינה") ולא את כל
// הפרופיל, אחרת שני מסכים פתוחים במקביל היו דורסים זה את זה.
function merge(base, patch) {
  const out = Object.assign({}, base);
  Object.keys(patch || {}).forEach(k => {
    const v = patch[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? merge(base[k] || {}, v) : v;
  });
  return out;
}

async function upsert(garden_id, cal, category, title, payload) {
  const notes = JSON.stringify(payload);
  const { data } = await supabase.from('events').select('id')
    .eq('garden_id', garden_id).eq('calendar', cal).eq('category', category).limit(1);
  if (data && data.length) {
    const { error } = await supabase.from('events')
      .update({ title, notes, event_date: today() }).eq('id', data[0].id);
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
    const me = user.sub || user.id;

    if (event.httpMethod === 'GET') {
      const [pr, uf, g] = await Promise.all([
        supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL).eq('category', KEY).limit(1),
        supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_PREF)
          .eq('category', String(me)).limit(1),
        supabase.from('gardens').select('name').eq('id', garden_id).limit(1),
      ]);
      const profile = (pr.data && pr.data.length) ? parse(pr.data[0].notes) : null;
      const prefs = (uf.data && uf.data.length) ? parse(uf.data[0].notes) : {};
      const gardenName = (g.data && g.data.length && g.data[0].name) || '';
      // profile === null אומר "עוד לא נשאל מעולם", והוא מה שמפעיל את
      // מסך הכניסה הראשונה. פרופיל ריק {} הוא מצב אחר לגמרי.
      return json(200, { success: true, profile, prefs, gardenName,
                         setup: !!(profile && profile.setupAt) });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      if (b.prefs) {
        const { data } = await supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_PREF)
          .eq('category', String(me)).limit(1);
        const cur = (data && data.length) ? parse(data[0].notes) : {};
        const next = merge(cur, b.prefs);
        next.updated_at = new Date().toISOString();
        await upsert(garden_id, CAL_PREF, String(me), 'העדפות משתמש', next);
        if (!b.patch) return json(200, { success: true, prefs: next });
      }

      const patch = b.patch || {};
      const { data } = await supabase.from('events').select('notes')
        .eq('garden_id', garden_id).eq('calendar', CAL).eq('category', KEY).limit(1);
      const cur = (data && data.length) ? parse(data[0].notes) : {};
      const next = merge(cur, patch);

      // לכל ערך שנענה נשמר מאיפה הוא הגיע ומתי — כדי שמסך ההגדרות
      // יוכל להראות את זה, ושאף ערך לא ייראה כאילו המערכת החליטה לבד.
      if (b.source && Object.keys(patch).length) {
        next.answered = next.answered || {};
        Object.keys(patch).forEach(k => {
          next.answered[k] = { at: new Date().toISOString(), by: b.source };
        });
      }
      if (b.setup) next.setupAt = next.setupAt || new Date().toISOString();
      next.updated_at = new Date().toISOString();

      await upsert(garden_id, CAL, KEY, 'פרופיל הגן', next);
      await auditLog(garden_id, me, 'saved', 'garden-profile', KEY,
                     { keys: Object.keys(patch) });

      // שם הגן יושב בטבלת gardens ולא בפרופיל — שם הוא כבר קיים,
      // ושתי אמיתות לאותו ערך הן באג שמחכה לקרות.
      if (b.gardenName) {
        await supabase.from('gardens').update({ name: b.gardenName }).eq('id', garden_id);
      }
      return json(200, { success: true, profile: next });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('garden-profile error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
