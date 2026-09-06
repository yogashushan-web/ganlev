// PUBLIC staff availability form (no auth). A staff member gets a personal link
// with the round id and their own staff id, and marks the half-days they CANNOT work.
//
// GET  ?round=<round_id>&staff=<staff_id>  -> { round, staff_name, existing:{unavailable,notes} }
// POST { round_id, staff_id, unavailable:[{date,part}], notes } -> upsert, sets submitted_at

const { supabase } = require('./lib/db');
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (!q.round || !q.staff) return json(400, { success: false, error: 'חסרים פרטים' });
      const { data: round, error: e1 } = await supabase.from('staff_schedule_rounds').select('*').eq('id', q.round).single();
      if (e1 || !round) return json(404, { success: false, error: 'הקישור לא תקין' });
      const { data: staffRow, error: e2 } = await supabase.from('staff').select('id,full_name_he').eq('id', q.staff).single();
      if (e2 || !staffRow) return json(404, { success: false, error: 'הקישור לא תקין' });
      const { data: existing } = await supabase.from('staff_schedule_constraints')
        .select('unavailable,notes,submitted_at').eq('round_id', q.round).eq('staff_id', q.staff).maybeSingle();
      return json(200, {
        success: true,
        round: { period_type: round.period_type, start_date: round.start_date, end_date: round.end_date, deadline: round.deadline },
        staff_name: staffRow.full_name_he,
        existing: existing || { unavailable: [], notes: null, submitted_at: null },
      });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.round_id || !b.staff_id) return json(400, { success: false, error: 'חסרים פרטים' });
      const { data: round, error: e1 } = await supabase.from('staff_schedule_rounds').select('garden_id').eq('id', b.round_id).single();
      if (e1 || !round) return json(404, { success: false, error: 'הקישור לא תקין' });
      const { error } = await supabase.from('staff_schedule_constraints').upsert({
        round_id: b.round_id, staff_id: b.staff_id, garden_id: round.garden_id,
        unavailable: b.unavailable || [], notes: b.notes || null, submitted_at: new Date().toISOString(),
      }, { onConflict: 'round_id,staff_id' });
      if (error) throw error;
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('staff-constraints error:', err);
    return json(500, { success: false, error: err.message });
  }
};
