// PUBLIC child registration (no auth): POST /child-intake
// The parent "כרטיס אישי" form posts here. Stores the submission as an isolated
// event (calendar='child-card') with the full answers in notes, and emails the manager.
// Body: { garden_id, child_name, birth_date, answers: [{q, a}, ...] }

const { supabase } = require('./lib/db');

// Next school year in the same format the children list uses ('2026-27').
// Registrations now (before September) are for the upcoming year.
function nextSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = (d.getMonth() >= 8 ? y : y - 1) + 1;
  return s + '-' + String(s + 1).slice(2);
}

async function notifyByEmail(childName, birthDate, answers, gardenName) {
  const key = process.env.WEB3FORMS_KEY;
  if (!key) return;
  const lines = ['כרטיס אישי חדש מההורים:', 'שם הילד/ה: ' + (childName || ''), 'תאריך לידה: ' + (birthDate || '-'), ''];
  (answers || []).forEach(a => { if (a && a.a) lines.push(a.q + '\n' + a.a + '\n'); });
  lines.push('גן: ' + (gardenName || ''));
  await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: key,
      subject: 'כרטיס אישי חדש - ' + (childName || ''),
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
    const childName = b.child_name || [b.first_name_he, b.last_name_he].filter(Boolean).join(' ');
    if (!b.garden_id || !childName) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר שם ילד/ה או גן' }) };
    }
    const today = new Date().toISOString().slice(0, 10);

    // 1) Add the child to next year's roster (2026-27), so the list builds itself.
    let childId = null;
    try {
      const { data: child, error: cErr } = await supabase.from('children').insert({
        garden_id: b.garden_id,
        first_name_he: b.first_name_he || childName,
        last_name_he: b.last_name_he || '-',
        birth_date: b.birth_date || null,
        school_year: nextSchoolYear(),
        status: 'active',
      }).select().single();
      if (cErr) throw cErr;
      childId = child.id;
    } catch (e) { console.error('child create failed', e); }

    // 2) Store the full "כרטיס אישי" answers, linked to the child (category = child id).
    const { data, error } = await supabase.from('events').insert({
      garden_id: b.garden_id,
      calendar: 'child-card',
      category: childId || 'registration',
      title: childName,
      event_date: b.birth_date || today,
      notes: JSON.stringify({ child_id: childId, child_name: childName, birth_date: b.birth_date || null, submitted_at: today, answers: b.answers || [], favorite_song: b.favorite_song || null, photo: b.photo || null }),
    }).select().single();
    if (error) throw error;

    let gardenName = '';
    try {
      const g = await supabase.from('gardens').select('name').eq('id', b.garden_id).single();
      gardenName = g.data && g.data.name;
    } catch (e) {}

    try { await notifyByEmail(childName, b.birth_date, b.answers, gardenName); } catch (e) { console.error('email failed', e); }

    return { statusCode: 200, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (err) {
    console.error('child-intake error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
