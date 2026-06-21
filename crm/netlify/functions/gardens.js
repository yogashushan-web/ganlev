// Gardens list endpoint: GET /gardens
// Admins (owners) get ALL gardens (powers the garden switcher).
// Other users get only their own garden.
// Response: { success, data: [{ id, name, city }] }

const { supabase } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;

    let query = supabase.from('gardens').select('id, name, city').order('name');
    if (user.role !== 'admin') {
      query = query.eq('id', user.garden_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (err) {
    console.error('Gardens error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
