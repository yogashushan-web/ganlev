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

// Build a human-readable label for a deleted record (for the recycle bin)
function trashLabel(rec) {
  if (!rec) return '(רשומה)';
  if (rec.first_name_he) return (rec.first_name_he + ' ' + (rec.last_name_he || '')).trim();
  return rec.full_name_he || rec.child_name || rec.title || rec.kind || rec.description_he || rec.source_he || '(רשומה)';
}

// Copy a deleted row into the `trash` table so it can be restored later.
async function moveToTrash(table_name, record, garden_id) {
  if (!record) return;
  try {
    await supabase.from('trash').insert({
      garden_id,
      table_name,
      label: trashLabel(record),
      record_json: record,
    });
  } catch (err) {
    console.error('moveToTrash failed:', err);
  }
}

module.exports = {
  supabase,
  scopeQuery,
  auditLog,
  validateGardenScope,
  moveToTrash,
};
