// Recycle bin: /trash
// GET    /trash?garden_id=            -> list deleted items
// POST   /trash?garden_id= { id }     -> restore an item (re-insert it)
// DELETE /trash/:id?garden_id=        -> purge permanently

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const trashId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('trash')
        .select('id, table_name, label, deleted_at')
        .eq('garden_id', garden_id)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      // restore
      const { id } = JSON.parse(event.body || '{}');
      const { data: t, error: e1 } = await supabase.from('trash').select('*').eq('id', id).eq('garden_id', garden_id).single();
      if (e1 || !t) return { statusCode: 404, body: JSON.stringify({ success: false, error: 'Item not found' }) };

      const { error: e2 } = await supabase.from(t.table_name).insert(t.record_json);
      if (e2) throw e2;

      await supabase.from('trash').delete().eq('id', id);
      return { statusCode: 200, body: JSON.stringify({ success: true, table: t.table_name }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data: t } = await supabase.from('trash').select('*').eq('id', trashId).eq('garden_id', garden_id).single();
      // if it was a document, remove the underlying file too
      if (t && t.table_name === 'documents' && t.record_json && t.record_json.file_path) {
        try { await supabase.storage.from('documents').remove([t.record_json.file_path]); } catch (e) {}
      }
      const { error } = await supabase.from('trash').delete().eq('id', trashId).eq('garden_id', garden_id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Trash error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
