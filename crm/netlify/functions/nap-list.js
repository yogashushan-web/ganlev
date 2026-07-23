// Staff-only list of nap-ritual submissions. GET /nap-list?garden_id=
const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

exports.handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    validateGardenScope(user.garden_id, garden_id, user.role);
    const { data, error } = await supabase.from('nap_forms')
      .select('*').eq('garden_id', garden_id).order('updated_at', { ascending: false });
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
  } catch (e) {
    console.error('nap-list error:', e);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
});
