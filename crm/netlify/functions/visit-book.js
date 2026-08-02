// PUBLIC August "ימי היכרות" capsule booking. No auth.
// Slots: dates 23-27 & 30-31 Aug 2026, two capsules/day (09:00-09:50, 10:00-10:50),
// up to 7 families each. One booking per child PER DAY; unlimited across days.
// Stored as events (calendar='visit', category=CAT) — no new table needed.
//
// GET  ?garden_id=            -> { dates, slots, capacity, counts, children }
// GET  ?garden_id=&child_id=  -> { ..., childBookings:[{date,time}] }
// POST { action:'book',   garden_id, child_id, child_name, date, time_start }
// POST { action:'cancel', garden_id, child_id, date, time_start }

const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';
const CAT = 'ביקור היכרות';
const CAP = 6;
const SLOTS = [{ s: '09:00', e: '09:50' }, { s: '10:00', e: '10:50' }];
const DATES = ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-30', '2026-08-31'];
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function currentSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = d.getMonth() >= 6 ? y : y - 1;
  return s + '-' + String(s + 1).slice(2);
}
function childOf(notes) { try { return JSON.parse(notes || '{}').child_id; } catch (_) { return null; } }

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;

    if (event.httpMethod === 'GET') {
      const { data: evs } = await supabase.from('events').select('event_date,event_time,notes')
        .eq('garden_id', gid).eq('category', CAT).in('event_date', DATES);
      const counts = {}, childBookings = [];
      (evs || []).forEach(e => {
        const t = (e.event_time || '').slice(0, 5);
        const key = e.event_date + '|' + t;
        counts[key] = (counts[key] || 0) + 1;
        if (q.child_id && childOf(e.notes) === q.child_id) childBookings.push({ date: e.event_date, time: t });
      });
      let children = [];
      if (!q.child_id) {
        const curYear = currentSchoolYear();
        const { data } = await supabase.from('children').select('id,first_name_he,last_name_he')
          .eq('garden_id', gid).eq('status', 'active').or(`school_year.eq.${curYear},school_year.is.null`);
        children = (data || []).map(c => ({ id: c.id, name: (c.first_name_he + ' ' + (c.last_name_he || '')).trim() }))
          .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      }
      return json(200, { success: true, dates: DATES, slots: SLOTS, capacity: CAP, counts, children, childBookings });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.child_id || !b.date || !b.time_start) return json(400, { success: false, error: 'חסרים פרטים' });

      if (b.action === 'cancel') {
        const { data: rows } = await supabase.from('events').select('id,notes')
          .eq('garden_id', gid).eq('category', CAT).eq('event_date', b.date).eq('event_time', b.time_start);
        for (const r of (rows || [])) if (childOf(r.notes) === b.child_id) await supabase.from('events').delete().eq('id', r.id);
        return json(200, { success: true });
      }

      // book
      if (!b.child_name) return json(400, { success: false, error: 'חסר שם ילד/ה' });
      if (!DATES.includes(b.date)) return json(400, { success: false, error: 'תאריך לא תקין' });
      const slot = SLOTS.find(s => s.s === b.time_start);
      if (!slot) return json(400, { success: false, error: 'שעה לא תקינה' });

      // one booking per child per day
      const { data: sameDay } = await supabase.from('events').select('id,event_time,notes')
        .eq('garden_id', gid).eq('category', CAT).eq('event_date', b.date);
      if ((sameDay || []).some(r => childOf(r.notes) === b.child_id))
        return json(409, { success: false, error: 'כבר יש לכם ביקור ביום הזה — בטלו אותו כדי לבחור שעה אחרת' });

      // capacity for that capsule
      const taken = (sameDay || []).filter(r => (r.event_time || '').slice(0, 5) === b.time_start).length;
      if (taken >= CAP) return json(409, { success: false, error: 'הקפסולה מלאה — נסו שעה או יום אחרים' });

      const { error } = await supabase.from('events').insert({
        garden_id: gid, calendar: 'visit', category: CAT, title: b.child_name,
        event_date: b.date, event_time: b.time_start, end_time: slot.e,
        notes: JSON.stringify({ child_id: b.child_id, child_name: b.child_name }),
      });
      if (error) throw error;
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('visit-book error:', e);
    return json(500, { success: false, error: e.message });
  }
};
