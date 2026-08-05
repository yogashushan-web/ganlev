// Staff-only list of nap-ritual submissions. GET /nap-list?garden_id=
const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

exports.handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    validateGardenScope(user.garden_id, garden_id, user.role);
    // Submissions are stored as events (calendar='child-nap'); unwrap the JSON payload.
    const { data, error } = await supabase.from('events')
      .select('id,notes,created_at').eq('garden_id', garden_id).eq('calendar', 'child-nap');
    if (error) throw error;
    const rows = (data || []).map(e => {
      let p = {}; try { p = JSON.parse(e.notes || '{}'); } catch (_) {}
      return { id: e.id, child_name: p.child_name, needs: p.needs || [], needs_other: p.needs_other, ritual: p.ritual, notes: p.notes, updated_at: p.updated_at || e.created_at };
    }).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return { statusCode: 200, body: JSON.stringify({ success: true, data: rows }) };
  } catch (e) {
    console.error('nap-list error:', e);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
});
