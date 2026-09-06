// ADMIN management of staff work-schedule rounds ("סידור עבודה") — auth required.
// GET    /schedule-rounds?garden_id=X                 -> list rounds + submission progress
// GET    /schedule-rounds?garden_id=X&id=Y             -> one round + active staff + their constraints
// POST   /schedule-rounds?garden_id=X { period_type, start_date, deadline }
// DELETE /schedule-rounds/:id?garden_id=X              -> deletes round + its constraints (cascade)

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

function endDateFor(periodType, startDate) {
  const [y, m, d] = startDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  let end;
  if (periodType === 'month') {
    end = new Date(Date.UTC(y, m, 0)); // last day of that month
  } else {
    end = new Date(Date.UTC(y, m - 1, d + 6)); // 7-day week
  }
  return end.toISOString().slice(0, 10);
}

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
        .select('id,full_name_he,phone').eq('garden_id', garden_id).eq('status', 'active').order('full_name_he');
      const { data: constraints } = await supabase.from('staff_schedule_constraints')
        .select('*').eq('round_id', q.id);
      return { statusCode: 200, body: JSON.stringify({ success: true, round, staff: staff || [], constraints: constraints || [] }) };
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
        const { data: subs } = await supabase.from('staff_schedule_constraints')
          .select('round_id').in('round_id', ids).not('submitted_at', 'is', null);
        (subs || []).forEach(s => { submittedCounts[s.round_id] = (submittedCounts[s.round_id] || 0) + 1; });
      }
      const data = (rounds || []).map(r => ({ ...r, total_staff: totalStaff || 0, submitted_count: submittedCounts[r.id] || 0 }));
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.period_type || !b.start_date || !b.deadline) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסרים פרטים' }) };
      }
      const end_date = endDateFor(b.period_type, b.start_date);
      const { data, error } = await supabase.from('staff_schedule_rounds').insert({
        garden_id, period_type: b.period_type, start_date: b.start_date, end_date, deadline: b.deadline,
      }).select().single();
      if (error) throw error;
      return { statusCode: 201, body: JSON.stringify({ success: true, data }) };
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
