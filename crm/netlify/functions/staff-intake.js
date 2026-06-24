// PUBLIC employee intake (no auth): POST /staff-intake
// The new-employee questionnaire posts here. Saves a staff row + (optionally) emails the manager.
// Body: { garden_id, full_name_he, phone, email, national_id, birth_date, address,
//         years_experience, ece_training, in_neighborhood, job_scope, salary_type, notes_he, position_he }

const { supabase } = require('./lib/db');

async function notifyByEmail(b, gardenName) {
  const key = process.env.WEB3FORMS_KEY;
  if (!key) return;
  const lines = [
    'עובד/ת חדש/ה מילא/ה את השאלון:',
    'שם: ' + (b.full_name_he || ''),
    'טלפון: ' + (b.phone || ''),
    'אימייל: ' + (b.email || ''),
    'ת"ז: ' + (b.national_id || ''),
    'תאריך לידה: ' + (b.birth_date || ''),
    'כתובת: ' + (b.address || ''),
    'שנות ניסיון בחינוך: ' + (b.years_experience || ''),
    'הכשרה לגיל הרך: ' + (b.ece_training || ''),
    'מגורים בשכונה: ' + (b.in_neighborhood || ''),
    'היקף משרה: ' + (b.job_scope || ''),
    'סוג שכר: ' + (b.salary_type || ''),
    'הערות: ' + (b.notes_he || ''),
    'גן: ' + (gardenName || ''),
  ].join('\n');
  await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: key,
      subject: 'שאלון עובד חדש - ' + (b.full_name_he || ''),
      from_name: 'מערכת גן לב',
      message: lines,
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }
  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.garden_id || !b.full_name_he) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר שם או גן' }) };
    }

    const { data, error } = await supabase.from('staff').insert({
      garden_id: b.garden_id,
      full_name_he: b.full_name_he,
      phone: b.phone || null,
      email: b.email || null,
      national_id: b.national_id || null,
      birth_date: b.birth_date || null,
      address: b.address || null,
      years_experience: (b.years_experience !== undefined && b.years_experience !== '') ? parseInt(b.years_experience) : null,
      ece_training: b.ece_training || null,
      in_neighborhood: b.in_neighborhood || null,
      job_scope: b.job_scope || null,
      salary_type: b.salary_type || null,
      notes_he: b.notes_he || null,
      position_he: b.position_he || null,
      status: 'active',
    }).select().single();
    if (error) throw error;

    let gardenName = '';
    try {
      const g = await supabase.from('gardens').select('name').eq('id', b.garden_id).single();
      gardenName = g.data && g.data.name;
    } catch (e) {}

    try { await notifyByEmail(b, gardenName); } catch (e) { console.error('email failed', e); }

    return { statusCode: 200, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (err) {
    console.error('staff-intake error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
