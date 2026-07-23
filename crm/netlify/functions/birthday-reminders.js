// Backfill birthday-call reminders for all current-school-year children.
// POST /birthday-reminders?garden_id=   (staff button)
const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');
const { createBirthdayCallReminder } = require('./lib/birthday-call');

exports.handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    validateGardenScope(user.garden_id, garden_id, user.role);

    const now = new Date();
    const startYr = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const curYear = startYr + '-' + String(startYr + 1).slice(2);

    const { data: kids, error } = await supabase.from('children')
      .select('id,first_name_he,last_name_he,birth_date,school_year')
      .eq('garden_id', garden_id).eq('status', 'active')
      .or(`school_year.eq.${curYear},school_year.is.null`);
    if (error) throw error;

    let created = 0, existed = 0, past = 0, other = 0;
    const pastKids = [];
    for (const c of (kids || [])) {
      try {
        const r = await createBirthdayCallReminder(c, garden_id);
        if (r.created) created++;
        else if (r.reason === 'exists') existed++;
        else if (r.reason === 'past') { past++; pastKids.push(r.name); }
        else other++;
      } catch (e) { other++; }
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, created, existed, past, other, pastKids }) };
  } catch (e) {
    console.error('birthday-reminders error:', e);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
});
