// PUBLIC parent meeting-booking endpoint (no auth). Slots are stored as rows in
// the `events` table with calendar='meeting' (category 'open' | 'booked').
// GET  /meetings?garden_id=      -> { success, slots:[{id,date,time,end,with,taken}], children:[names] }
// POST /meetings { garden_id, slot_id, child_name, topic } -> books a slot atomically

const { supabase } = require('./lib/db');
const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב

const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const hhmm = (t) => (t || '').slice(0, 5);

exports.handler = async (event) => {
  const gid = (event.queryStringParameters && event.queryStringParameters.garden_id) || GARDEN_DEFAULT;
  try {
    if (event.httpMethod === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      const [slotsRes, kidsRes] = await Promise.all([
        supabase.from('events').select('id,event_date,event_time,end_time,title,category')
          .eq('garden_id', gid).eq('calendar', 'meeting').gte('event_date', today)
          .order('event_date', { ascending: true }).order('event_time', { ascending: true }),
        supabase.from('children').select('first_name_he,last_name_he')
          .eq('garden_id', gid).eq('status', 'active'),
      ]);
      const slots = (slotsRes.data || []).map(s => ({
        id: s.id, date: s.event_date, time: hhmm(s.event_time), end: hhmm(s.end_time),
        with: s.title || '', taken: s.category === 'booked',
      }));
      const children = (kidsRes.data || [])
        .map(c => ((c.first_name_he || '') + ' ' + (c.last_name_he || '')).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'he'));
      return json(200, { success: true, slots, children });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.slot_id || !b.child_name) return json(400, { success: false, error: 'חסר שם ילד/ה או משבצת' });
      const notes = JSON.stringify({
        child: String(b.child_name).slice(0, 80),
        topic: String(b.topic || '').slice(0, 800),
        booked_at: new Date().toISOString(),
      });
      // Atomic booking: only succeeds if the slot is still 'open'.
      const { data, error } = await supabase.from('events')
        .update({ category: 'booked', notes })
        .eq('id', b.slot_id).eq('garden_id', gid).eq('calendar', 'meeting').eq('category', 'open')
        .select('id,event_date,event_time,title');
      if (error) throw error;
      if (!data || !data.length) {
        return json(409, { success: false, error: 'אופס — המשבצת הזו נתפסה זה עתה. בחרו משבצת אחרת 🙏' });
      }
      const s = data[0];
      return json(200, { success: true, slot: { date: s.event_date, time: hhmm(s.event_time), with: s.title } });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('meetings error', err);
    return json(500, { success: false, error: err.message });
  }
};
