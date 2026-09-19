// Tuition CRUD endpoint
// GET /tuition?garden_id=X&status=pending
// POST /tuition { garden_id, child_id, parent_id, amount, due_date }
// PUT /tuition/:id { status, paid_date, amount }

const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, status, child_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const tuitionId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List tuition with child/parent info
      let query = supabase
        .from('tuition')
        .select(`
          id,
          garden_id,
          child_id,
          parent_id,
          amount,
          due_date,
          paid_date,
          status,
          notes_he,
          created_at,
          children!inner(first_name_he, last_name_he),
          parents(full_name_he)
        `)
        .eq('garden_id', garden_id);

      if (status) query = query.eq('status', status);
      if (child_id) query = query.eq('child_id', child_id);

      const { data, error } = await query.order('due_date', { ascending: true });

      if (error) throw error;

      // Map data to readable format
      const mapped = data?.map(t => ({
        ...t,
        child_name: `${t.children?.first_name_he} ${t.children?.last_name_he}`,
        parent_name: t.parents?.full_name_he || 'לא צוין',
      })) || [];

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: mapped }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create tuition
      const { child_id, parent_id, amount, due_date, status, notes_he } = JSON.parse(event.body || '{}');

      // סכום 0 הוא תקין — ילד בפטור מלא ("waived"), ולכן בודקים null/ריק ולא "falsy".
      if (!child_id || amount == null || amount === '' || !due_date) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('tuition')
        .insert({
          garden_id,
          child_id,
          parent_id: parent_id || null,
          amount: parseFloat(amount),
          due_date,
          status: ['pending', 'paid', 'overdue', 'waived'].includes(status) ? status : 'pending',
          notes_he: notes_he || null,
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'tuition', data.id, { child_id, amount, due_date });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update tuition (mark as paid, change amount, etc)
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('tuition')
        .select('*')
        .eq('id', tuitionId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Tuition not found' }),
        };
      }

      // Auto-set paid_date when marking as paid
      if (body.status === 'paid' && !body.paid_date) {
        body.paid_date = new Date().toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('tuition')
        .update(body)
        .eq('id', tuitionId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'tuition', tuitionId, body);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      // מחיקת שורת שכר לימוד (למשל בעת יצירה מחדש של השנה) — עוברת לפח וניתנת לשחזור.
      const { data: existing } = await supabase
        .from('tuition')
        .select('*')
        .eq('id', tuitionId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Tuition not found' }),
        };
      }

      await moveToTrash('tuition', existing, garden_id);

      const { error } = await supabase.from('tuition').delete().eq('id', tuitionId);
      if (error) throw error;

      await auditLog(garden_id, user.id, 'deleted', 'tuition', tuitionId, { amount: existing.amount, due_date: existing.due_date });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  } catch (err) {
    console.error('Tuition error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
