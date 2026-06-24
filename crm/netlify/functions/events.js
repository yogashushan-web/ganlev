// Calendar events CRUD: /events
// GET /events?garden_id=&calendar=&date_from=&date_to=
// POST { calendar, title, category, event_date, event_time, notes }
// PUT /events/:id   DELETE /events/:id

const { supabase, validateGardenScope, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, calendar, date_from, date_to } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const eventId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      let q = supabase.from('events').select('*').eq('garden_id', garden_id);
      if (calendar) q = q.eq('calendar', calendar);
      if (date_from) q = q.gte('event_date', date_from);
      if (date_to) q = q.lte('event_date', date_to);
      const { data, error } = await q.order('event_date');
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const { calendar: cal, title, category, event_date, event_time, end_time, notes } = JSON.parse(event.body || '{}');
      if (!title || !event_date) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing title or date' }) };
      }
      const { data, error } = await supabase.from('events').insert({
        garden_id,
        calendar: cal || 'garden',
        title,
        category: category || null,
        event_date,
        event_time: event_time || null,
        end_time: end_time || null,
        notes: notes || null,
      }).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'created', 'events', data.id, { title, event_date });
      return { statusCode: 201, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { data, error } = await supabase.from('events')
        .update(body).eq('id', eventId).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data, error } = await supabase.from('events')
        .delete().eq('id', eventId).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Events error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
