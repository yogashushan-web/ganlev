// Staff CRUD endpoint
// GET /staff?garden_id=X
// POST /staff { garden_id, full_name_he, email, phone, position_he, hire_date }
// PUT /staff/:id
// DELETE /staff/:id

const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const staffId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List staff
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('garden_id', garden_id)
        .neq('status', 'archived')
        .order('full_name_he');

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create staff
      const b = JSON.parse(event.body || '{}');

      if (!b.full_name_he) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('staff')
        .insert({
          garden_id,
          full_name_he: b.full_name_he,
          email: b.email || null,
          phone: b.phone || null,
          position_he: b.position_he || null,
          hire_date: b.hire_date || null,
          national_id: b.national_id || null,
          birth_date: b.birth_date || null,
          address: b.address || null,
          years_experience: (b.years_experience !== undefined && b.years_experience !== '') ? parseInt(b.years_experience) : null,
          ece_training: b.ece_training || null,
          in_neighborhood: b.in_neighborhood || null,
          job_scope: b.job_scope || null,
          salary_type: b.salary_type || null,
          notes_he: b.notes_he || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'staff', data.id, { full_name_he: b.full_name_he });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update staff
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('staff')
        .select('*')
        .eq('id', staffId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Staff not found' }),
        };
      }

      const { data, error } = await supabase
        .from('staff')
        .update(body)
        .eq('id', staffId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'staff', staffId, body);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      // Delete staff (recoverable from the recycle bin)
      const { data, error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId)
        .eq('garden_id', garden_id)
        .select()
        .single();

      if (error) throw error;

      await moveToTrash('staff', data, garden_id);
      await auditLog(garden_id, user.id, 'deleted', 'staff', staffId, {});

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
    console.error('Staff error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
