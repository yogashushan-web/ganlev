// Database utilities for Supabase integration
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: Start a query with garden scoping
function scopeQuery(table, gardenId) {
  if (!gardenId) {
    throw new Error('gardenId is required');
  }
  return supabase.from(table).select('*').eq('garden_id', gardenId);
}

// Helper: Audit log entry
async function auditLog(gardenId, userId, actionHe, tableName, recordId, changesJson) {
  try {
    await supabase.from('audit_log').insert({
      garden_id: gardenId,
      user_id: userId,
      action_he: actionHe,
      table_name: tableName,
      record_id: recordId,
      changes_json: changesJson,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
    // Don't throw - audit failure shouldn't break the operation
  }
}

// Helper: Validate garden scope.
// Admins (owners) may operate on ANY garden - this powers the single-login,
// multi-garden switcher. Other roles stay locked to their own garden.
function validateGardenScope(userGardenId, requestGardenId, role) {
  if (role === 'admin') return;
  if (userGardenId !== requestGardenId) {
    throw new Error('Access denied: garden mismatch');
  }
}

module.exports = {
  supabase,
  scopeQuery,
  auditLog,
  validateGardenScope,
};
