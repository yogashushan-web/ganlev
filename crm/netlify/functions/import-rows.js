// Bulk import endpoint: POST /import-rows
// Body: { garden_id, type: 'children' | 'income' | 'expenses', rows: [...] }
// Validates + bulk-inserts rows for the active garden. Returns counts + skipped.

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const MAX_ROWS = 1000;

function num(v) {
  if (v === null || v === undefined) return NaN;
  return parseFloat(String(v).replace(/[₪,\s]/g, ''));
}

function cleanDate(v) {
  // Expecting YYYY-MM-DD already normalised by the client; null otherwise.
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }

    const user = event.user;
    const { garden_id, type, rows } = JSON.parse(event.body || '{}');

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (!garden_id || !type || !Array.isArray(rows)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing garden_id, type or rows' }) };
    }
    if (rows.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'אין שורות לייבוא' }) };
    }
    if (rows.length > MAX_ROWS) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: `יותר מדי שורות (מקסימום ${MAX_ROWS})` }) };
    }

    const today = new Date().toISOString().split('T')[0];
    let table;
    const valid = [];
    const skipped = [];

    rows.forEach((r, i) => {
      if (type === 'children') {
        table = 'children';
        const first = (r.first_name_he || '').trim();
        const last = (r.last_name_he || '').trim();
        if (!first && !last) { skipped.push(i + 1); return; }
        valid.push({
          garden_id,
          first_name_he: first || last,
          last_name_he: last || '-',
          birth_date: cleanDate(r.birth_date),
          status: 'active',
        });
      } else if (type === 'income') {
        table = 'income';
        const amount = num(r.amount);
        if (!r.source_he || isNaN(amount)) { skipped.push(i + 1); return; }
        valid.push({
          garden_id,
          source_he: String(r.source_he).trim(),
          amount,
          receipt_date: cleanDate(r.receipt_date) || today,
          category_he: r.category_he ? String(r.category_he).trim() : null,
          notes_he: r.notes_he ? String(r.notes_he).trim() : null,
        });
      } else if (type === 'expenses') {
        table = 'expenses';
        const amount = num(r.amount);
        if (!r.description_he || isNaN(amount)) { skipped.push(i + 1); return; }
        valid.push({
          garden_id,
          description_he: String(r.description_he).trim(),
          amount,
          expense_date: cleanDate(r.expense_date) || today,
          category_he: r.category_he ? String(r.category_he).trim() : 'אחר',
          payment_method_he: r.payment_method_he ? String(r.payment_method_he).trim() : null,
          status: 'pending',
        });
      }
    });

    if (!table) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'סוג ייבוא לא חוקי' }) };
    }
    if (valid.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא נמצאו שורות תקינות לייבוא', skipped: skipped.length }) };
    }

    const { data, error } = await supabase.from(table).insert(valid).select('id');
    if (error) throw error;

    await auditLog(garden_id, user.id, 'imported', table, garden_id, { type, inserted: data.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted: data.length,
        skipped: skipped.length,
        skipped_rows: skipped,
      }),
    };
  } catch (err) {
    console.error('Import error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
