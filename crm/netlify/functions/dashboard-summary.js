// Dashboard summary endpoint: GET /dashboard-summary?garden_id=X
// Returns: { success, data: { children_count, pending_tuition_count, pending_tuition_amount, staff_count, monthly_expenses } }

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const { garden_id } = event.queryStringParameters || {};
    const user = event.user;

    // Validate garden scope
    validateGardenScope(user.garden_id, garden_id, user.role);

    // Count active children
    const { data: childrenData, error: childrenError } = await supabase
      .from('children')
      .select('id')
      .eq('garden_id', garden_id)
      .eq('status', 'active');

    if (childrenError) throw childrenError;

    // Count pending tuition and amount
    const { data: tuitionData, error: tuitionError } = await supabase
      .from('tuition')
      .select('amount')
      .eq('garden_id', garden_id)
      .eq('status', 'pending');

    if (tuitionError) throw tuitionError;

    const pendingAmount = tuitionData?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;

    // Count active staff
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id')
      .eq('garden_id', garden_id)
      .eq('status', 'active');

    if (staffError) throw staffError;

    // Sum expenses for current month
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = today.toISOString().split('T')[0];

    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('amount')
      .eq('garden_id', garden_id)
      .eq('status', 'approved')
      .gte('expense_date', monthStart)
      .lte('expense_date', monthEnd);

    if (expensesError) throw expensesError;

    const monthlyExpenses = expensesData?.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          children_count: childrenData?.length || 0,
          pending_tuition_count: tuitionData?.length || 0,
          pending_tuition_amount: pendingAmount,
          staff_count: staffData?.length || 0,
          monthly_expenses: monthlyExpenses,
        },
      }),
    };
  } catch (err) {
    console.error('Dashboard summary error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
