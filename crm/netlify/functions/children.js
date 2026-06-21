// Children CRUD endpoint
// GET /children?garden_id=X
// POST /children { garden_id, first_name_he, last_name_he, birth_date }
// PUT /children/:id { ... }
// DELETE /children/:id

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const childId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List children
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('garden_id', garden_id)
        .neq('status', 'archived')
        .order('first_name_he');

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create child
      const { first_name_he, last_name_he, birth_date } = JSON.parse(event.body || '{}');

      if (!first_name_he || !last_name_he) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('children')
        .insert({
          garden_id,
          first_name_he,
          last_name_he,
          birth_date: birth_date || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'children', data.id, { first_name_he, last_name_he, birth_date });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update child
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Child not found' }),
        };
      }

      const { data, error } = await supabase
        .from('children')
        .update(body)
        .eq('id', childId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'children', childId, body);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      // Soft delete child
      const { data, error } = await supabase
        .from('children')
        .update({ status: 'archived' })
        .eq('id', childId)
        .eq('garden_id', garden_id)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'deleted', 'children', childId, {});

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
    console.error('Children error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
