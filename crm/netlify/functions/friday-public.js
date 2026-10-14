// PUBLIC — ימי שישי. ההורים נרשמים, מבטלים, ומבקשים אחרי הנעילה.
//
// GET  ?garden_id=                  -> ימי שישי של השנה + ההגדרות
// POST { action:'register', date, child_id, siblings:[] }
// POST { action:'cancel',   date, child_id }
//
// **אין כאן התחברות.** ההורה בוחר את הילד מרשימה, בדיוק כמו בטופס
// שנת הצהריים — זה מה שההורים כבר מכירים. לכן גם לא מוחזר מכאן שום
// מידע שאינו קשור לשישי: לא טלפונים, לא כתובות, ולא שיבוץ הצוות.

const { supabase } = require('./lib/db');
const F = require('./lib/fridays');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב
const CAL = 'friday';
const CAL_CAL = 'gan-cal';

const json = (c, b) => ({
  statusCode: c,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(b),
});
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => F.iso(new Date());
const uid = () => 'r' + Math.random().toString(36).slice(2, 9);

function schoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = d.getMonth() >= 8 ? y : y - 1;
  return s + '-' + String(s + 1).slice(2);
}

async function load(gid) {
  const [dRes, cRes, pRes, kRes, gRes] = await Promise.all([
    supabase.from('events').select('category,notes').eq('garden_id', gid).eq('calendar', CAL),
    supabase.from('events').select('category,title,notes').eq('garden_id', gid).eq('calendar', CAL_CAL),
    supabase.from('events').select('notes').eq('garden_id', gid)
      .eq('calendar', 'garden-profile').eq('category', 'profile').limit(1),
    supabase.from('children').select('id,first_name_he,last_name_he,status,school_year')
      .eq('garden_id', gid),
    supabase.from('gardens').select('name').eq('id', gid).limit(1),
  ]);
  const days = {};
  (dRes.data || []).forEach(r => { days[r.category] = parse(r.notes); });
  const calendar = {};
  (cRes.data || []).forEach(r => { calendar[r.category] = Object.assign({ name: r.title }, parse(r.notes)); });
  const profile = (pRes.data && pRes.data.length) ? parse(pRes.data[0].notes) : {};
  const year = schoolYear();
  const children = (kRes.data || [])
    .filter(c => (c.school_year || year) === year && c.status === 'active')
    .map(c => ({ id: c.id, name: ((c.first_name_he || '') + ' ' + (c.last_name_he || '')).trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const garden = (gRes.data && gRes.data.length && gRes.data[0].name) || 'הגן';
  return { days, calendar, settings: F.settingsOf(profile.fridays), children, garden, year };
}

async function saveDay(gid, date, rec) {
  rec.saved_at = new Date().toISOString();
  const notes = JSON.stringify(rec);
  const { data } = await supabase.from('events').select('id')
    .eq('garden_id', gid).eq('calendar', CAL).eq('category', date).limit(1);
  if (data && data.length) {
    await supabase.from('events').update({ notes, event_date: today() }).eq('id', data[0].id);
  } else {
    await supabase.from('events').insert({
      garden_id: gid, calendar: CAL, category: date, title: 'שישי ' + date,
      event_date: today(), notes,
    });
  }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const st = await load(gid);

    if (event.httpMethod === 'GET') {
      if (!st.settings.active) return json(200, { success: true, active: false });
      const list = F.fridaysOfYear(st.year).map(d => {
        const cal = st.calendar[d];
        const rec = Object.assign({}, st.days[d]);
        if (cal) rec.closed = { reason: cal.name };
        const s = F.stateOf(d, rec, st.settings, today());
        const regs = (st.days[d] && st.days[d].regs) || [];
        return Object.assign(s, {
          // שמות הנרשמים מוצגים רק אם הגן בחר בכך. גן עם שישים
          // משפחות לא בהכרח רוצה רשימה פתוחה.
          names: st.settings.showNames
            ? regs.filter(r => r.status !== 'rejected')
                  .map(r => ({ id: r.id, child_id: r.child_id, name: r.name,
                               siblings: r.siblings || [],
                               pending: F.effStatus(r, st.settings) === 'pending' }))
            : [],
          mine: regs.filter(r => r.status !== 'rejected')
                    .map(r => ({ id: r.id, child_id: r.child_id,
                                 pending: F.effStatus(r, st.settings) === 'pending' })),
        });
      });
      return json(200, {
        success: true, active: true, garden: st.garden, children: st.children,
        fridays: list,
        settings: {
          price: st.settings.price, siblings: st.settings.siblings,
          showNames: st.settings.showNames, cancelDaysBefore: st.settings.cancelDaysBefore,
        },
      });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const date = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json(400, { success: false, error: 'תאריך לא תקין' });
      }
      if (!st.settings.active) return json(400, { success: false, error: 'ההרשמה סגורה' });

      const child = st.children.find(c => c.id === b.child_id);
      if (!child) return json(400, { success: false, error: 'לא נבחר ילד' });

      const rec = Object.assign({ regs: [] }, st.days[date]);
      rec.regs = rec.regs || [];
      const cal = st.calendar[date];
      const probe = Object.assign({}, rec);
      if (cal) probe.closed = { reason: cal.name };
      const s = F.stateOf(date, probe, st.settings, today());

      if (b.action === 'cancel') {
        const mine = rec.regs.find(r => r.child_id === child.id && r.status !== 'rejected');
        if (!mine) return json(404, { success: false, error: 'אין הרשמה לבטל' });
        if (!s.canCancel) {
          return json(400, { success: false,
            error: `ביטול עצמאי אפשרי עד ${st.settings.cancelDaysBefore} ימים לפני. `
                 + 'אפשר לפנות לגננת.' });
        }
        rec.regs = rec.regs.filter(r => r !== mine);
        await saveDay(gid, date, rec);
        return json(200, { success: true });
      }

      if (b.action === 'register') {
        if (s.closed) return json(400, { success: false, error: s.closed });
        if (s.past) return json(400, { success: false, error: 'התאריך עבר' });
        if (rec.regs.some(r => r.child_id === child.id && r.status !== 'rejected')) {
          return json(400, { success: false, error: 'הילד/ה כבר רשומ/ה ליום הזה' });
        }
        const sibs = st.settings.siblings && Array.isArray(b.siblings)
          ? b.siblings.map(x => String(x || '').trim()).filter(Boolean).slice(0, 4) : [];

        // בקשה שממתינה לאישור קיימת רק אם הגן ביקש אישור. בברירת
        // המחדל (`approval: 'never'`) ההורה נרשם וזה סופי.
        if (!s.canRegister && !s.canRequest) {
          return json(400, { success: false, error: s.why || 'לא ניתן להירשם' });
        }
        const pending = !s.canRegister;
        if (!pending && s.taken + 1 + sibs.length > s.capacity) {
          return json(400, { success: false, error: 'אין מספיק מקומות פנויים' });
        }
        rec.regs.push({
          id: uid(), child_id: child.id, name: child.name, siblings: sibs,
          status: pending ? 'pending' : 'ok', at: new Date().toISOString(),
        });
        await saveDay(gid, date, rec);
        return json(200, { success: true, pending });
      }

      return json(400, { success: false, error: 'פעולה לא מוכרת' });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('friday-public error:', err);
    return json(500, { success: false, error: err.message });
  }
};
