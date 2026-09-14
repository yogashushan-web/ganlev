// Parents' national ID numbers. Stored in events (calendar='parent-id',
// category=parent_id), one row per parent — no schema change needed.
// Written by the public /id form and by the signed-contract import;
// read by the owner-only IDs tab on the staff boards.

const { supabase } = require('./db');

const digits = s => String(s == null ? '' : s).replace(/\D/g, '');

// Israeli ID check digit (9 digits, shorter numbers are left-padded with zeros).
function validIsraeliId(raw) {
  const id = digits(raw);
  if (!id || id.length > 9) return false;
  const p = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const n = Number(p[i]) * (i % 2 + 1);
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0 && Number(p) > 0;
}

// Replace the stored ID of one parent.
async function saveParentId(gid, { parent_id, parent_name, child_id, national_id }) {
  await supabase.from('events').delete().eq('garden_id', gid).eq('calendar', 'parent-id').eq('category', parent_id);
  const { error } = await supabase.from('events').insert({
    garden_id: gid, calendar: 'parent-id', category: parent_id,
    title: parent_name, event_date: new Date().toISOString().slice(0, 10),
    notes: JSON.stringify({
      parent_id, child_id, parent_name,
      national_id: digits(national_id).padStart(9, '0'), updated_at: new Date().toISOString(),
    }),
  });
  if (error) throw error;
}

// Each current child with its parents and their stored ID numbers (owner-only views).
async function buildIdsBoard(gid) {
  const { orderedChildren } = require('./boards');
  const kids = await orderedChildren(gid);
  const [{ data: parents }, { data: rows }] = await Promise.all([
    supabase.from('parents').select('id,child_id,full_name_he,relationship_type').eq('garden_id', gid),
    supabase.from('events').select('category,notes').eq('garden_id', gid).eq('calendar', 'parent-id'),
  ]);
  const idOf = {};
  (rows || []).forEach(r => { try { idOf[r.category] = JSON.parse(r.notes || '{}').national_id || ''; } catch (_) {} });
  const rank = { mother: 0, father: 1 };
  return kids.map(k => ({
    ...k,
    parents: (parents || []).filter(p => p.child_id === k.id)
      .sort((a, b) => (rank[a.relationship_type] ?? 2) - (rank[b.relationship_type] ?? 2))
      .map(p => ({ name: p.full_name_he, national_id: idOf[p.id] || '' })),
  }));
}

function idsText(rows) {
  const lines = ['תעודות זהות של ההורים — גן לב', ''];
  rows.forEach(r => {
    lines.push('— ' + r.name + ' —');
    if (!r.parents.length) lines.push('אין הורים רשומים');
    r.parents.forEach(p => lines.push(p.name + ': ' + (p.national_id || 'טרם מולא')));
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = { digits, validIsraeliId, saveParentId, buildIdsBoard, idsText };
