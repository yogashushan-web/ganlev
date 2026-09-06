// ADMIN management of tour-visit dates ("סיור מקדים") — auth required.
// GET    /tour-slots?garden_id=X                -> list, with booked count per slot
// POST   /tour-slots?garden_id=X { date, time_start, time_end, capacity }
// PUT    /tour-slots/:id?garden_id=X { ...fields }
// DELETE /tour-slots/:id?garden_id=X            -> bookings on it fall back to unbooked (FK ON DELETE SET NULL)

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const id = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data: slots, error } = await supabase.from('tour_slots')
        .select('*').eq('garden_id', garden_id).order('date');
      if (error) throw error;
      const { data: booked } = await supabase.from('interest_forms')
        .select('tour_slot_id').eq('garden_id', garden_id).not('tour_slot_id', 'is', null);
      const counts = {};
      (booked || []).forEach(r => { counts[r.tour_slot_id] = (counts[r.tour_slot_id] || 0) + 1; });
      const data = (slots || []).map(s => ({ ...s, booked: counts[s.id] || 0 }));
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.date) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר תאריך' }) };
      const { data, error } = await supabase.from('tour_slots').insert({
        garden_id, date: b.date, time_start: b.time_start || null, time_end: b.time_end || null,
        capacity: b.capacity ? Number(b.capacity) : 10,
      }).select().single();
      if (error) throw error;
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { ...data, booked: 0 } }) };
    }

    if (event.httpMethod === 'PUT') {
      const b = JSON.parse(event.body || '{}');
      const fields = {};
      ['date', 'time_start', 'time_end'].forEach(f => { if (b[f] !== undefined) fields[f] = b[f] || null; });
      if (b.capacity !== undefined) fields.capacity = Number(b.capacity);
      const { data, error } = await supabase.from('tour_slots').update(fields).eq('id', id).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { error } = await supabase.from('tour_slots').delete().eq('id', id).eq('garden_id', garden_id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('tour-slots error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
