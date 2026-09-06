// PUBLIC staff availability form (no auth). One shared link per round is sent to
// the team WhatsApp group; each staff member picks themselves ("מי את/ה?"), then
// adds one row per day they need off (reason + who covers for them).
//
// GET  ?round=<round_id>                     -> { round, staff:[{id,name}] } (self-select list)
// GET  ?round=<round_id>&staff=<staff_id>    -> { round, staff_name, staff:[...], entries, responded }
// POST { round_id, staff_id, entries:[{date,part,reason,reason_note,replacement_staff_id}] }
//      -> replaces this staff's entries for the round + marks them as responded

const { supabase } = require('./lib/db');
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

const REASONS = ['family', 'vacation', 'sick', 'other'];
const PARTS = ['full', 'morning', 'afternoon'];

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (!q.round) return json(400, { success: false, error: 'חסר מזהה סבב' });
      const { data: round, error: e1 } = await supabase.from('staff_schedule_rounds').select('*').eq('id', q.round).single();
      if (e1 || !round) return json(404, { success: false, error: 'הקישור לא תקין' });
      const { data: staffList } = await supabase.from('staff')
        .select('id,full_name_he').eq('garden_id', round.garden_id).eq('status', 'active').order('full_name_he');
      const staff = (staffList || []).map(s => ({ id: s.id, name: s.full_name_he }));

      if (!q.staff) {
        return json(200, { success: true, round: { period_type: round.period_type, start_date: round.start_date, end_date: round.end_date, deadline: round.deadline }, staff });
      }
      const staffRow = staff.find(s => s.id === q.staff);
      if (!staffRow) return json(404, { success: false, error: 'עובד/ת לא נמצא/ה' });
      const { data: entries } = await supabase.from('staff_schedule_constraints')
        .select('id,date,part,reason,reason_note,replacement_staff_id').eq('round_id', q.round).eq('staff_id', q.staff).order('date');
      const { data: response } = await supabase.from('staff_schedule_responses')
        .select('submitted_at').eq('round_id', q.round).eq('staff_id', q.staff).maybeSingle();
      return json(200, {
        success: true,
        round: { period_type: round.period_type, start_date: round.start_date, end_date: round.end_date, deadline: round.deadline },
        staff_name: staffRow.name, staff,
        entries: entries || [], responded: !!(response && response.submitted_at),
      });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.round_id || !b.staff_id || !Array.isArray(b.entries)) return json(400, { success: false, error: 'חסרים פרטים' });
      const { data: round, error: e1 } = await supabase.from('staff_schedule_rounds').select('garden_id').eq('id', b.round_id).single();
      if (e1 || !round) return json(404, { success: false, error: 'הקישור לא תקין' });

      for (const e of b.entries) {
        if (!e.date || !PARTS.includes(e.part) || !REASONS.includes(e.reason) || !e.replacement_staff_id) {
          return json(400, { success: false, error: 'שורת אילוץ לא תקינה' });
        }
      }

      const { error: eDel } = await supabase.from('staff_schedule_constraints').delete().eq('round_id', b.round_id).eq('staff_id', b.staff_id);
      if (eDel) throw eDel;
      if (b.entries.length) {
        const rows = b.entries.map(e => ({
          round_id: b.round_id, staff_id: b.staff_id, garden_id: round.garden_id,
          date: e.date, part: e.part, reason: e.reason, reason_note: e.reason_note || null,
          replacement_staff_id: e.replacement_staff_id,
        }));
        const { error: eIns } = await supabase.from('staff_schedule_constraints').insert(rows);
        if (eIns) throw eIns;
      }
      const { error: eResp } = await supabase.from('staff_schedule_responses').upsert({
        round_id: b.round_id, staff_id: b.staff_id, garden_id: round.garden_id, submitted_at: new Date().toISOString(),
      }, { onConflict: 'round_id,staff_id' });
      if (eResp) throw eResp;

      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('staff-constraints error:', err);
    return json(500, { success: false, error: err.message });
  }
};
