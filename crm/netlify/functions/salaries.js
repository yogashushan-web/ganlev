// Salaries CRUD endpoint
// GET /salaries?garden_id=X&month_year=2026-06
// POST /salaries { garden_id, staff_id, month_year, gross_salary, deductions, net_salary }
// PUT /salaries/:id { status, ... }

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, month_year, staff_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const salaryId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List salaries with staff info
      let query = supabase
        .from('salaries')
        .select(`
          id,
          garden_id,
          staff_id,
          month_year,
          gross_salary,
          deductions,
          net_salary,
          status,
          notes_he,
          created_at,
          staff!inner(full_name_he)
        `)
        .eq('garden_id', garden_id);

      if (month_year) query = query.eq('month_year', month_year);
      if (staff_id) query = query.eq('staff_id', staff_id);

      const { data, error } = await query.order('month_year', { ascending: false });

      if (error) throw error;

      // Map to readable format
      const mapped = data?.map(s => ({
        ...s,
        staff_name: s.staff?.full_name_he,
      })) || [];

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: mapped }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create salary
      const { staff_id, month_year, gross_salary, deductions, net_salary } = JSON.parse(event.body || '{}');

      if (!staff_id || !month_year || !gross_salary || net_salary === undefined) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      // Only admin/manager can create salaries
      if (!['admin', 'manager'].includes(user.role)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ success: false, error: 'Only managers can create salaries' }),
        };
      }

      const { data, error } = await supabase
        .from('salaries')
        .insert({
          garden_id,
          staff_id,
          month_year,
          gross_salary: parseFloat(gross_salary),
          deductions: parseFloat(deductions || 0),
          net_salary: parseFloat(net_salary),
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'salaries', data.id, { staff_id, month_year, gross_salary });

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update salary (approve or mark as paid)
      const body = JSON.parse(event.body || '{}');

      // Only admin/manager can approve
      if ((body.status === 'approved' || body.status === 'paid') && !['admin', 'manager'].includes(user.role)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ success: false, error: 'Only managers can approve/pay salaries' }),
        };
      }

      const { data: existing } = await supabase
        .from('salaries')
        .select('*')
        .eq('id', salaryId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Salary not found' }),
        };
      }

      const { data, error } = await supabase
        .from('salaries')
        .update(body)
        .eq('id', salaryId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'salaries', salaryId, body);

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
    console.error('Salaries error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
