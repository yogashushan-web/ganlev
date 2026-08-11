// Staff-only list of August "ימי היכרות" bookings. GET /visit-list?garden_id=
const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

exports.handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    validateGardenScope(user.garden_id, garden_id, user.role);
    const { data, error } = await supabase.from('events')
      .select('id,event_date,event_time,end_time,title,notes')
      .eq('garden_id', garden_id).eq('calendar', 'visit').eq('category', 'ביקור היכרות')
      .order('event_date').order('event_time');
    if (error) throw error;
    // hand the logged-in manager the secret key so they can open the printable board
    return { statusCode: 200, body: JSON.stringify({ success: true, data, admin_key: process.env.VISIT_ADMIN_KEY || '' }) };
  } catch (e) {
    console.error('visit-list error:', e);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
});
