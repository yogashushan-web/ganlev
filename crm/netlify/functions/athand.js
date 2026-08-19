// "בהישג יד" — key accounts, contracts & vendors organizer.
// Stored as events (calendar='athand') so no dedicated table is needed. Each item's
// structured fields live in notes (JSON). Attached files use the documents table
// (section='athand', category=item id) via the existing documents endpoint.
//
// GET    /athand?garden_id=X
// POST   /athand?garden_id=X { group, name, ...fields }
// PUT    /athand/:id?garden_id=X { ...fields }
// DELETE /athand/:id?garden_id=X

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const FIELDS = ['group', 'name', 'provider', 'account_number', 'phone', 'email', 'website', 'username', 'password', 'amount', 'pay_day', 'notes'];
const pick = (b) => { const o = {}; FIELDS.forEach(f => { if (b[f] !== undefined) o[f] = b[f]; }); return o; };

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const id = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('events')
        .select('id,notes,created_at').eq('garden_id', garden_id).eq('calendar', 'athand');
      if (error) throw error;
      const items = (data || []).map(e => {
        let f = {}; try { f = JSON.parse(e.notes || '{}'); } catch (_) {}
        return { id: e.id, ...f };
      });
      return { statusCode: 200, body: JSON.stringify({ success: true, data: items }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const fields = pick(b);
      const { data, error } = await supabase.from('events').insert({
        garden_id, calendar: 'athand', category: fields.group || null,
        title: fields.name || 'פריט', event_date: new Date().toISOString().slice(0, 10),
        notes: JSON.stringify(fields),
      }).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'created', 'athand', data.id, { name: fields.name });
      return { statusCode: 201, body: JSON.stringify({ success: true, data: { id: data.id, ...fields } }) };
    }

    if (event.httpMethod === 'PUT') {
      const b = JSON.parse(event.body || '{}');
      const { data: cur } = await supabase.from('events').select('notes').eq('id', id).eq('garden_id', garden_id).single();
      let f = {}; try { f = JSON.parse((cur && cur.notes) || '{}'); } catch (_) {}
      const merged = { ...f, ...pick(b) };
      const { data, error } = await supabase.from('events')
        .update({ category: merged.group || null, title: merged.name || 'פריט', notes: JSON.stringify(merged) })
        .eq('id', id).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data: { id: data.id, ...merged } }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { error } = await supabase.from('events').delete().eq('id', id).eq('garden_id', garden_id);
      if (error) throw error;
      // also remove its attached documents
      try { await supabase.from('documents').delete().eq('garden_id', garden_id).eq('section', 'athand').eq('category', id); } catch (_) {}
      await auditLog(garden_id, user.id, 'deleted', 'athand', id, {});
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('athand error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
