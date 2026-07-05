// PUBLIC parent meeting booking ("זמן הורים"). Slots are garden-calendar events
// (calendar='garden', category='זמן הורים'). OPEN slot: title IS NULL.
// BOOKED slot: title = child name, notes = JSON { child, child_id, parents[],
// topic, cancel_token, booked_at }.
//
// GET  /meetings?garden_id=                 -> { slots, children:[{id,name}] }
// GET  /meetings?garden_id=&parents_for=ID  -> { parents:[names] }
// POST { action:'book',   garden_id, slot_id, child_id, child_name, parents[], topic }
// POST { action:'cancel', garden_id, slot_id, cancel_token }

const crypto = require('crypto');
const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב
const CAT = 'זמן הורים';
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const hhmm = (t) => (t || '').slice(0, 5);

async function emailGan(subject, message) {
  const key = process.env.WEB3FORMS_KEY;
  if (!key) return;
  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_key: key, subject, from_name: 'מערכת גן לב', message }),
    });
  } catch (e) { console.error('email failed', e); }
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const gid = q.garden_id || GARDEN_DEFAULT;
  try {
    if (event.httpMethod === 'GET') {
      // parents of a specific child (for the "who's coming" checkboxes) — names only
      if (q.parents_for) {
        const { data } = await supabase.from('parents').select('full_name_he')
          .eq('garden_id', gid).eq('child_id', q.parents_for);
        const parents = (data || []).map(p => (p.full_name_he || '').replace(/\s*\(.*\)\s*$/, '').trim()).filter(Boolean);
        return json(200, { success: true, parents });
      }
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      // current school year (Sep-Aug), e.g. '2025-26' — the booking list shows only
      // this year's families (kids starting next September are excluded).
      const startYr = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const curYear = startYr + '-' + String(startYr + 1).slice(2);
      const [slotsRes, kidsRes] = await Promise.all([
        supabase.from('events').select('id,event_date,event_time,end_time,title')
          .eq('garden_id', gid).eq('calendar', 'garden').eq('category', CAT).gte('event_date', today)
          .order('event_date', { ascending: true }).order('event_time', { ascending: true }),
        supabase.from('children').select('id,first_name_he,last_name_he')
          .eq('garden_id', gid).eq('status', 'active')
          .or(`school_year.eq.${curYear},school_year.is.null`),
      ]);
      // OPEN slot has title === CAT ('זמן הורים'); BOOKED has title = child name.
      const slots = (slotsRes.data || []).map(s => {
        const taken = !!s.title && s.title !== CAT;
        return { id: s.id, date: s.event_date, time: hhmm(s.event_time), end: hhmm(s.end_time), taken, child: taken ? s.title : null };
      });
      const children = (kidsRes.data || [])
        .map(c => ({ id: c.id, name: ((c.first_name_he || '') + ' ' + (c.last_name_he || '')).trim() }))
        .filter(c => c.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      return json(200, { success: true, slots, children });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      if (b.action === 'cancel') {
        const { data: row } = await supabase.from('events').select('id,title,notes,event_date,event_time')
          .eq('id', b.slot_id).eq('garden_id', gid).maybeSingle();
        if (!row || !row.title || row.title === CAT) return json(409, { success: false, error: 'הפגישה כבר אינה משובצת' });
        let info = {}; try { info = JSON.parse(row.notes || '{}'); } catch (e) {}
        if (!b.cancel_token || b.cancel_token !== info.cancel_token) {
          return json(403, { success: false, error: 'אין הרשאה לבטל פגישה זו' });
        }
        await supabase.from('events').update({ title: CAT, notes: null }).eq('id', b.slot_id);
        await emailGan('הורה ביטל פגישת "זמן הורים"',
          `${info.child || row.title} ביטל/ה את הפגישה שהייתה ב-${row.event_date} בשעה ${hhmm(row.event_time)}.`);
        return json(200, { success: true });
      }

      // book
      if (!b.slot_id || !b.child_name) return json(400, { success: false, error: 'חסר שם ילד/ה' });
      // one meeting per child
      if (b.child_id) {
        const { data: booked } = await supabase.from('events').select('notes')
          .eq('garden_id', gid).eq('calendar', 'garden').eq('category', CAT).neq('title', CAT);
        const dup = (booked || []).some(e => { try { return JSON.parse(e.notes || '{}').child_id === b.child_id; } catch (_) { return false; } });
        if (dup) return json(409, { success: false, error: 'כבר קבועה פגישה לילד/ה הזה. אפשר לבטל אותה ולשבץ מחדש.' });
      }
      const cancel_token = crypto.randomBytes(12).toString('hex');
      const notes = JSON.stringify({
        child: b.child_name, child_id: b.child_id || null,
        parents: (b.parents || []).slice(0, 4), topic: String(b.topic || '').slice(0, 800),
        cancel_token, booked_at: new Date().toISOString(),
      });
      // atomic: only books if the slot is still OPEN (title === CAT)
      const { data, error } = await supabase.from('events')
        .update({ title: b.child_name, notes })
        .eq('id', b.slot_id).eq('garden_id', gid).eq('category', CAT).eq('title', CAT)
        .select('id,event_date,event_time');
      if (error) throw error;
      if (!data || !data.length) return json(409, { success: false, error: 'אופס — המשבצת נתפסה זה עתה. בחרו משבצת אחרת 🙏' });
      return json(200, { success: true, cancel_token, slot: { date: data[0].event_date, time: hhmm(data[0].event_time) } });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('meetings error', err);
    return json(500, { success: false, error: err.message });
  }
};
