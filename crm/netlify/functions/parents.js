// Parents CRUD endpoint
// GET /parents?garden_id=X&child_id=Y
// POST /parents { garden_id, child_id, full_name_he, phone, email, relationship_type, is_primary }
// PUT /parents/:id
// DELETE /parents/:id

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, child_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const parentId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List parents
      let query = supabase
        .from('parents')
        .select('*')
        .eq('garden_id', garden_id);

      if (child_id && child_id !== 'undefined' && child_id !== 'null') {
        query = query.eq('child_id', child_id);
      }

      const { data, error } = await query.order('is_primary', { ascending: false });

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create parent
      const { child_id, full_name_he, phone, email, relationship_type, is_primary, address, occupation } = JSON.parse(event.body || '{}');

      if (!full_name_he) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('parents')
        .insert({
          garden_id,
          child_id: child_id || null,
          full_name_he,
          phone: phone || null,
          email: email || null,
          address: address || null,
          occupation: occupation || null,
          relationship_type: relationship_type || null,
          is_primary: is_primary || false,
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'parents', data.id, { child_id, full_name_he });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update parent
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('parents')
        .select('*')
        .eq('id', parentId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Parent not found' }),
        };
      }

      const { data, error } = await supabase
        .from('parents')
        .update(body)
        .eq('id', parentId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'parents', parentId, body);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      // Delete parent
      const { data, error } = await supabase
        .from('parents')
        .delete()
        .eq('id', parentId)
        .eq('garden_id', garden_id)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'deleted', 'parents', parentId, {});

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  } catch (err) {
    console.error('Parents error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
