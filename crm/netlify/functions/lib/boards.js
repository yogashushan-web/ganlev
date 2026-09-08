// Shared builders for the consolidated child boards (nap ritual / personal cards).
// Used by child-boards.js (owner key) and staff-boards.js (Google sign-in).

const { supabase } = require('./db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';

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

async function byChild(gid, calendar) {
  const { data } = await supabase.from('events').select('category,notes').eq('garden_id', gid).eq('calendar', calendar);
  const map = {}; (data || []).forEach(e => { map[e.category] = parse(e.notes); }); return map;
}

async function buildBoard(gid, type) {
  const kids = await orderedChildren(gid);
  const data = await byChild(gid, type === 'cards' ? 'child-card' : 'child-nap');
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

module.exports = { GARDEN_DEFAULT, currentSchoolYear, orderedChildren, buildBoard, boardText, napFilled, cardFilled };
