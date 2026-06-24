// Utilities (water/electricity/property tax...): /utilities
// GET /utilities?garden_id=
// POST /utilities?garden_id= { kind, provider, account_number, contract, notes }
// PUT /utilities/:id?garden_id=   DELETE /utilities/:id?garden_id=

const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const id = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('utilities').select('*').eq('garden_id', garden_id).order('kind');
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const { kind, provider, phone, email, website, account_number, contract, notes } = JSON.parse(event.body || '{}');
      if (!kind) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing kind' }) };
      const { data, error } = await supabase.from('utilities').insert({
        garden_id, kind, provider: provider || null,
        phone: phone || null, email: email || null, website: website || null,
        account_number: account_number || null, contract: contract || null, notes: notes || null,
      }).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'created', 'utilities', data.id, { kind });
      return { statusCode: 201, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { data, error } = await supabase.from('utilities').update(body).eq('id', id).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data, error } = await supabase.from('utilities').delete().eq('id', id).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      await moveToTrash('utilities', data, garden_id);
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Utilities error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
