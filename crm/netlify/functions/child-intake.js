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

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';

// The upcoming/adaptation cohort's school year (July boundary -> summer shows next year).
function currentSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = d.getMonth() >= 6 ? y : y - 1;
  return s + '-' + String(s + 1).slice(2);
}

exports.handler = async (event) => {
  // GET -> list of this-year children for the card's dropdown
  if (event.httpMethod === 'GET') {
    try {
      const gid = (event.queryStringParameters || {}).garden_id || GARDEN_DEFAULT;
      const curYear = currentSchoolYear();
      const { data, error } = await supabase.from('children')
        .select('id,first_name_he,last_name_he')
        .eq('garden_id', gid).eq('status', 'active')
        .or(`school_year.eq.${curYear},school_year.is.null`);
      if (error) throw error;
      const children = (data || [])
        .map(c => ({ id: c.id, name: (c.first_name_he + ' ' + (c.last_name_he || '')).trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      return { statusCode: 200, body: JSON.stringify({ success: true, children }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }
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

    // The card now attaches to an EXISTING child chosen from the dropdown (registered
    // via the signed contract). Only fall back to creating one if no child was picked.
    let childId = b.child_id || null;
    if (!childId) {
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
    }
    // if the same child already submitted a card, replace it (one card per child)
    if (childId) {
      try { await supabase.from('events').delete().eq('garden_id', b.garden_id).eq('calendar', 'child-card').eq('category', childId); } catch (e) {}
    }

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
