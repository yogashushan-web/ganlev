// Income CRUD endpoint
// GET /income?garden_id=X&date_from=2026-01-01&date_to=2026-06-30
// POST /income { garden_id, source_he, amount, receipt_date, category_he, notes_he }

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, date_from, date_to } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const incomeId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List income
      let query = supabase
        .from('income')
        .select('*')
        .eq('garden_id', garden_id)
        .order('receipt_date', { ascending: false });

      if (date_from) query = query.gte('receipt_date', date_from);
      if (date_to) query = query.lte('receipt_date', date_to);

      const { data, error } = await query;

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create income
      const { source_he, amount, receipt_date, category_he, notes_he } = JSON.parse(event.body || '{}');

      if (!source_he || !amount || !receipt_date) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('income')
        .insert({
          garden_id,
          source_he,
          amount: parseFloat(amount),
          receipt_date,
          category_he: category_he || null,
          notes_he: notes_he || null,
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'income', data.id, { source_he, amount });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update income
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('income')
        .select('*')
        .eq('id', incomeId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Income not found' }),
        };
      }

      const { data, error } = await supabase
        .from('income')
        .update(body)
        .eq('id', incomeId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'income', incomeId, body);

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
    console.error('Income error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
