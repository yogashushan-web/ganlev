// ADMIN view of interest-form submissions (auth required).
// GET    /interest-forms?garden_id=X                 -> list, newest first
// PUT    /interest-forms/:id?garden_id=X { status }   -> update status only
// DELETE /interest-forms/:id?garden_id=X              -> move to trash + delete

const { supabase, validateGardenScope, moveToTrash, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const STATUSES = ['new', 'contacted', 'waitlist', 'accepted', 'declined'];

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const id = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('interest_forms')
        .select('*').eq('garden_id', garden_id).order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data: data || [] }) };
    }

    if (event.httpMethod === 'PUT') {
      const b = JSON.parse(event.body || '{}');
      if (!STATUSES.includes(b.status)) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'סטטוס לא תקין' }) };
      }
      const { data, error } = await supabase.from('interest_forms')
        .update({ status: b.status }).eq('id', id).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data: rec } = await supabase.from('interest_forms').select('*').eq('id', id).eq('garden_id', garden_id).single();
      const { error } = await supabase.from('interest_forms').delete().eq('id', id).eq('garden_id', garden_id);
      if (error) throw error;
      await moveToTrash('interest_forms', rec, garden_id);
      await auditLog(garden_id, user.id, 'deleted', 'interest_forms', id, {});
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('interest-forms error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
