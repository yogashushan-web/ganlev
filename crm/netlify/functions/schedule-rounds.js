// ADMIN management of staff work-schedule rounds ("סידור עבודה") — auth required.
// Rounds are created automatically on the 15th of every month (monthly-schedule-round.js),
// for the FOLLOWING month. POST here runs that same logic on demand (e.g. for testing,
// or an off-cycle need) — it does not take a custom period.
//
// GET    /schedule-rounds?garden_id=X                 -> list rounds + submission progress
// GET    /schedule-rounds?garden_id=X&id=Y             -> one round + active staff + their entries
// POST   /schedule-rounds?garden_id=X                  -> create+email next month's round now
// DELETE /schedule-rounds/:id?garden_id=X              -> deletes round + its data (cascade)

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');
const { createRoundForNextMonth } = require('./lib/schedule-round');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const { garden_id } = q;
    const path = event.path.split('/').filter(Boolean);
    const pathId = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET' && q.id) {
      const { data: round, error } = await supabase.from('staff_schedule_rounds')
        .select('*').eq('id', q.id).eq('garden_id', garden_id).single();
      if (error || !round) return { statusCode: 404, body: JSON.stringify({ success: false, error: 'הסבב לא נמצא' }) };
      const { data: staff } = await supabase.from('staff')
        .select('id,full_name_he').eq('garden_id', garden_id).eq('status', 'active').order('full_name_he');
      const { data: entries } = await supabase.from('staff_schedule_constraints').select('*').eq('round_id', q.id);
      const { data: responses } = await supabase.from('staff_schedule_responses').select('staff_id,submitted_at').eq('round_id', q.id);
      return { statusCode: 200, body: JSON.stringify({ success: true, round, staff: staff || [], entries: entries || [], responses: responses || [] }) };
    }

    if (event.httpMethod === 'GET') {
      const { data: rounds, error } = await supabase.from('staff_schedule_rounds')
        .select('*').eq('garden_id', garden_id).order('created_at', { ascending: false });
      if (error) throw error;
      const { count: totalStaff } = await supabase.from('staff')
        .select('id', { count: 'exact', head: true }).eq('garden_id', garden_id).eq('status', 'active');
      const ids = (rounds || []).map(r => r.id);
      let submittedCounts = {};
      if (ids.length) {
        const { data: resp } = await supabase.from('staff_schedule_responses').select('round_id').in('round_id', ids);
        (resp || []).forEach(r => { submittedCounts[r.round_id] = (submittedCounts[r.round_id] || 0) + 1; });
      }
      const data = (rounds || []).map(r => ({ ...r, total_staff: totalStaff || 0, submitted_count: submittedCounts[r.id] || 0 }));
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const result = await createRoundForNextMonth(garden_id);
      return { statusCode: 201, body: JSON.stringify({ success: true, data: result }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { error } = await supabase.from('staff_schedule_rounds').delete().eq('id', pathId).eq('garden_id', garden_id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('schedule-rounds error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
