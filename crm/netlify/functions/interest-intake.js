// PUBLIC interest form (no auth): POST /interest-intake
// The "טופס התעניינות" (yearly interest form, sent every January) posts here.
// Stores each submission as its own row in interest_forms, and emails the manager.
// Body: { garden_id, school_year, child_name, birth_date, gender, parent1_name,
//         parent1_phone, parent2_name, parent2_phone, family_info, child_info }

const { supabase } = require('./lib/db');

async function notifyByEmail(b, gardenName) {
  const key = process.env.WEB3FORMS_KEY;
  if (!key) return;
  const lines = [
    'התעניינות חדשה לשנת ' + (b.school_year || '') + ':',
    'שם הילד/ה: ' + (b.child_name || ''),
    'תאריך לידה: ' + (b.birth_date || '-'),
    'מין: ' + (b.gender || '-'),
    '',
    'הורה 1: ' + (b.parent1_name || '-') + ' · ' + (b.parent1_phone || '-'),
    'הורה 2: ' + (b.parent2_name || '-') + ' · ' + (b.parent2_phone || '-'),
    '',
    'על המשפחה: ' + (b.family_info || '-'),
    'על הילד/ה: ' + (b.child_info || '-'),
    '',
    'גן: ' + (gardenName || ''),
  ];
  await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: key,
      subject: 'התעניינות חדשה - ' + (b.child_name || ''),
      from_name: 'מערכת גן לב',
      message: lines.join('\n'),
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }
  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.garden_id || !b.child_name || !b.parent1_phone) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסרים פרטי חובה' }) };
    }
    const { data, error } = await supabase.from('interest_forms').insert({
      garden_id: b.garden_id,
      school_year: b.school_year || null,
      child_name: b.child_name,
      birth_date: b.birth_date || null,
      gender: b.gender || null,
      parent1_name: b.parent1_name || null,
      parent1_phone: b.parent1_phone,
      parent2_name: b.parent2_name || null,
      parent2_phone: b.parent2_phone || null,
      family_info: b.family_info || null,
      child_info: b.child_info || null,
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
    console.error('interest-intake error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
