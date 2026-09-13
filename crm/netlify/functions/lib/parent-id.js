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

module.exports = { digits, validIsraeliId, saveParentId };
