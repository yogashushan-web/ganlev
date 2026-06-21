// Expenses CRUD endpoint
// GET /expenses?garden_id=X&date_from=2026-01-01&date_to=2026-06-30
// POST /expenses { garden_id, description_he, amount, expense_date, category_he, payment_method_he }
// PUT /expenses/:id

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, date_from, date_to } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const expenseId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List expenses
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('garden_id', garden_id)
        .order('expense_date', { ascending: false });

      if (date_from) query = query.gte('expense_date', date_from);
      if (date_to) query = query.lte('expense_date', date_to);

      const { data, error } = await query;

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create expense
      const { description_he, amount, expense_date, category_he, payment_method_he, notes_he } = JSON.parse(event.body || '{}');

      if (!description_he || !amount || !expense_date || !category_he) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert({
          garden_id,
          description_he,
          amount: parseFloat(amount),
          expense_date,
          category_he,
          payment_method_he: payment_method_he || null,
          notes_he: notes_he || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'expenses', data.id, { description_he, amount, category_he });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update expense (approve, mark as paid, edit details)
      const body = JSON.parse(event.body || '{}');

      // Only admin/manager can approve
      if (body.status === 'approved' && !['admin', 'manager'].includes(user.role)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ success: false, error: 'Only managers can approve expenses' }),
        };
      }

      const { data: existing } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Expense not found' }),
        };
      }

      const updateData = { ...body };
      if (body.status === 'approved') {
        updateData.approved_by_user_id = user.id;
      }

      const { data, error } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', expenseId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'expenses', expenseId, body);

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
    console.error('Expenses error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
