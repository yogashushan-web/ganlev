// Event cards ("מעגל השנה") CRUD: /event-cards
// The backbone of the anchor system — an event is a PROCESS:
// intention (prep) -> ביצוע -> summary -> saved to the person's file.
// Step 1 scope: staff conversations (kind='staff_conversation', staff_id set).
//
// GET    /event-cards?garden_id=&staff_id=&child_id=
// POST   { kind, conv_type, staff_id?, child_id?, title, scheduled_date?, urgency?, prep?, status? }
// PUT    /event-cards/:id  { ...any fields, e.g. status:'done', summary:{...} }
// DELETE /event-cards/:id

const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, staff_id, child_id, event_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const cardId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      let q = supabase.from('event_cards').select('*').eq('garden_id', garden_id);
      if (staff_id) q = q.eq('staff_id', staff_id);
      if (child_id) q = q.eq('child_id', child_id);
      if (event_id) q = q.eq('event_id', event_id);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const { data, error } = await supabase.from('event_cards').insert({
        garden_id,
        kind: b.kind || 'staff_conversation',
        conv_type: b.conv_type || null,
        staff_id: b.staff_id || null,
        child_id: b.child_id || null,
        event_id: b.event_id || null,
        title: b.title || null,
        scheduled_date: b.scheduled_date || null,
        scheduled_time: b.scheduled_time || null,
        urgency: b.urgency || 'important',
        status: b.status || 'planned',
        prep: b.prep || null,
        summary: b.summary || null,
      }).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'created', 'event_cards', data.id, { kind: data.kind, conv_type: data.conv_type });
      return { statusCode: 201, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      // stamp done_at when it flips to done
      if (body.status === 'done' && body.done_at === undefined) body.done_at = new Date().toISOString();
      const { data, error } = await supabase.from('event_cards')
        .update(body).eq('id', cardId).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'updated', 'event_cards', cardId, { status: body.status });
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data, error } = await supabase.from('event_cards')
        .delete().eq('id', cardId).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      await moveToTrash('event_cards', data, garden_id);
      await auditLog(garden_id, user.id, 'deleted', 'event_cards', cardId, {});
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Event-cards error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
