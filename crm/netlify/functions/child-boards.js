// Owner-only consolidated boards, gated by the shared admin key (VISIT_ADMIN_KEY).
// GET  ?garden_id=&type=nap|cards&admin=<key>  -> children (oldest->youngest) + their data
// POST { action:'email', type, garden_id, admin } -> email the board text to the owner

const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function currentSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = d.getMonth() >= 6 ? y : y - 1;
  return s + '-' + String(s + 1).slice(2);
}
function parse(n) { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } }

// children of the current school year, oldest -> youngest (earliest birth date first; nulls last)
async function orderedChildren(gid) {
  const curYear = currentSchoolYear();
  const { data } = await supabase.from('children').select('id,first_name_he,last_name_he,birth_date')
    .eq('garden_id', gid).eq('status', 'active').or(`school_year.eq.${curYear},school_year.is.null`);
  return (data || [])
    .map(c => ({ id: c.id, name: (c.first_name_he + ' ' + (c.last_name_he || '')).trim(), birth_date: c.birth_date }))
    .sort((a, b) => {
      if (!a.birth_date) return 1; if (!b.birth_date) return -1;
      return a.birth_date < b.birth_date ? -1 : a.birth_date > b.birth_date ? 1 : 0;
    });
}

async function napByChild(gid) {
  const { data } = await supabase.from('events').select('category,notes').eq('garden_id', gid).eq('calendar', 'child-nap');
  const map = {}; (data || []).forEach(e => { map[e.category] = parse(e.notes); }); return map;
}
async function cardByChild(gid) {
  const { data } = await supabase.from('events').select('category,notes').eq('garden_id', gid).eq('calendar', 'child-card');
  const map = {}; (data || []).forEach(e => { map[e.category] = parse(e.notes); }); return map;
}

async function buildBoard(gid, type) {
  const kids = await orderedChildren(gid);
  const data = type === 'cards' ? await cardByChild(gid) : await napByChild(gid);
  return kids.map(k => ({ ...k, data: data[k.id] || null }));
}

function napFilled(d) { return !!(d && ((d.needs && d.needs.length) || d.needs_other || d.ritual || d.notes)); }
function cardFilled(d) { return !!(d && ((d.answers && d.answers.some(a => a && a.a)) || d.favorite_song || d.photo)); }

function boardText(rows, type) {
  const lines = [type === 'cards' ? 'כרטיסים אישיים — גן לב' : 'שנת הצהריים · טקסי הירדמות — גן לב', ''];
  rows.forEach(r => {
    lines.push('— ' + r.name + ' —');
    const d = r.data;
    if (type === 'cards') {
      if (!cardFilled(d)) { lines.push('טרם מולא'); }
      else {
        if (d.favorite_song) lines.push('🎵 שיר אהוב: ' + d.favorite_song);
        (d.answers || []).filter(a => a && a.a).forEach(a => lines.push(a.q + '\n' + a.a));
      }
    } else {
      if (!napFilled(d)) { lines.push('טרם מולא'); }
      else {
        if (d.needs && d.needs.length) lines.push('עוזר להירדם: ' + d.needs.join(', ') + (d.needs_other ? ', ' + d.needs_other : ''));
        if (d.ritual) lines.push('טקס ההירדמות: ' + d.ritual);
        if (d.notes) lines.push('חשוב לדעת: ' + d.notes);
      }
    }
    lines.push('');
  });
  return lines.join('\n');
}

async function sendEmail(subject, text) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.PERSONAL_CAL_EMAIL || 'joelkarmeli@gmail.com';
  if (!user || !pass) return;
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({ from: 'גן לב <' + user + '>', to, subject, text });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const ADMIN = process.env.VISIT_ADMIN_KEY;

    if (event.httpMethod === 'GET') {
      if (!ADMIN || q.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      const type = q.type === 'cards' ? 'cards' : 'nap';
      return json(200, { success: true, type, rows: await buildBoard(gid, type) });
    }
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      if (b.action === 'email') {
        const type = b.type === 'cards' ? 'cards' : 'nap';
        const rows = await buildBoard(gid, type);
        await sendEmail(type === 'cards' ? 'כרטיסים אישיים — גן לב' : 'שנת הצהריים — גן לב', boardText(rows, type));
        return json(200, { success: true });
      }
      return json(400, { success: false, error: 'פעולה לא ידועה' });
    }
    return json(405, { success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('child-boards error:', e);
    return json(500, { success: false, error: e.message });
  }
};
