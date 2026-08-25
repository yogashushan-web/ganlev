// Children CRUD endpoint
// GET /children?garden_id=X
// POST /children { garden_id, first_name_he, last_name_he, birth_date }
// PUT /children/:id { ... }
// DELETE /children/:id

const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');
const { syncBirthdayToCalendar } = require('./lib/calendar');
const { createBirthdayCallReminder } = require('./lib/birthday-call');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const childId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // List children
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('garden_id', garden_id)
        .neq('status', 'archived')
        .order('birth_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create child
      const { first_name_he, last_name_he, birth_date, name_en, gender_he, national_id, prev_framework, school_year, monthly_fee, fee_note } = JSON.parse(event.body || '{}');

      if (!first_name_he || !last_name_he) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Missing required fields' }),
        };
      }

      const { data, error } = await supabase
        .from('children')
        .insert({
          garden_id,
          first_name_he,
          last_name_he,
          birth_date: birth_date || null,
          name_en: name_en || null,
          gender_he: gender_he || null,
          national_id: national_id || null,
          prev_framework: prev_framework || null,
          school_year: school_year || null,
          // ריק/לא נשלח = שכר לימוד רגיל. 0 = פטור מלא.
          monthly_fee: (monthly_fee === 0 || monthly_fee) ? Number(monthly_fee) : null,
          fee_note: fee_note || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'created', 'children', data.id, { first_name_he, last_name_he, birth_date });
      await syncBirthdayToCalendar({ id: data.id, name: (data.first_name_he + ' ' + (data.last_name_he || '')).trim(), birth_date: data.birth_date, type: 'child', school_year: data.school_year });

      // birthday-call reminder (graceful — never blocks child creation)
      let birthday_reminder = null;
      try { birthday_reminder = await createBirthdayCallReminder(data, garden_id); }
      catch (e) { console.error('birthday-call reminder failed:', e); birthday_reminder = { skipped: true, reason: 'error' }; }

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true, data, birthday_reminder }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update child
      const body = JSON.parse(event.body || '{}');

      const { data: existing } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .eq('garden_id', garden_id)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Child not found' }),
        };
      }

      const { data, error } = await supabase
        .from('children')
        .update(body)
        .eq('id', childId)
        .select()
        .single();

      if (error) throw error;

      await auditLog(garden_id, user.id, 'updated', 'children', childId, body);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      // Delete child (recoverable from the recycle bin)
      const { data, error } = await supabase
        .from('children')
        .delete()
        .eq('id', childId)
        .eq('garden_id', garden_id)
        .select()
        .single();

      if (error) throw error;

      await moveToTrash('children', data, garden_id);
      await auditLog(garden_id, user.id, 'deleted', 'children', childId, {});

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
    console.error('Children error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
});

exports.handler = handler;
