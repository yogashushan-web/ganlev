// PUBLIC "תעודות זהות" form — parents add their own national ID numbers.
// No login: the parent picks the child, then proves they belong to the family
// with the last 4 digits of a parent phone that is already on file.
//
// GET                                                  -> { children:[{id,name}] }
// POST { action:'verify', child_id, phone4 }          -> { parents:[{id,name,has_id}] }
// POST { action:'save',   child_id, phone4, ids:[{parent_id,national_id}] }
//
// IDs are stored in events (calendar='parent-id', category=parent_id), one row per
// parent, like the nap form — no schema change needed. They are NEVER sent back
// to this page; only the owner sees them, on the staff boards.

const { supabase } = require('./lib/db');
const { GARDEN_DEFAULT, orderedChildren } = require('./lib/boards');

const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const digits = s => String(s == null ? '' : s).replace(/\D/g, '');

// Israeli ID check digit (9 digits, shorter numbers are left-padded with zeros).
function validIsraeliId(raw) {
  const id = digits(raw);
  if (!id || id.length > 9) return false;
  const p = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(p[i]) * (i % 2 + 1);
    sum += n > 9 ? n - 9 : n;
  }
  return sum % 10 === 0 && Number(p) > 0;
}

async function childParents(gid, childId) {
  const { data, error } = await supabase.from('parents')
    .select('id,full_name_he,phone,relationship_type')
    .eq('garden_id', gid).eq('child_id', childId);
  if (error) throw error;
  // mother first, then father, then anyone else
  const rank = { mother: 0, father: 1 };
  return (data || []).sort((a, b) => (rank[a.relationship_type] ?? 2) - (rank[b.relationship_type] ?? 2));
}

// The family is verified when phone4 matches the end of any parent phone on file.
// If nobody in the family has a phone on file there is nothing to check against.
function verified(parents, phone4) {
  const phones = parents.map(p => digits(p.phone)).filter(p => p.length >= 4);
  if (!phones.length) return true;
  const want = digits(phone4);
  return want.length === 4 && phones.some(p => p.endsWith(want));
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;

    if (event.httpMethod === 'GET') {
      const kids = await orderedChildren(gid);
      const children = kids.map(k => ({ id: k.id, name: k.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      return json(200, { success: true, children });
    }

    if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

    const b = JSON.parse(event.body || '{}');
    if (!b.child_id) return json(400, { success: false, error: 'לא נבחר ילד' });

    // Only children of the current year can be reached through this form.
    const kids = await orderedChildren(gid);
    if (!kids.some(k => k.id === b.child_id)) return json(404, { success: false, error: 'הילד/ה לא נמצא/ה ברשימה' });

    const parents = await childParents(gid, b.child_id);
    if (!parents.length) return json(404, { success: false, error: 'לא מצאנו הורים רשומים לילד/ה הזה/ו — נא לפנות ליואל' });
    if (!verified(parents, b.phone4)) {
      return json(403, { success: false, error: 'הספרות לא תואמות לטלפון שרשום אצלנו. נסו את הטלפון של ההורה השני, או פנו ליואל' });
    }

    if (b.action === 'verify') {
      const { data: existing } = await supabase.from('events').select('category')
        .eq('garden_id', gid).eq('calendar', 'parent-id').in('category', parents.map(p => p.id));
      const has = new Set((existing || []).map(e => e.category));
      return json(200, {
        success: true,
        parents: parents.map(p => ({ id: p.id, name: p.full_name_he, has_id: has.has(p.id) })),
      });
    }

    if (b.action === 'save') {
      const entries = (Array.isArray(b.ids) ? b.ids : []).filter(e => e && digits(e.national_id));
      if (!entries.length) return json(400, { success: false, error: 'לא הוזן אף מספר תעודת זהות' });

      const byId = Object.fromEntries(parents.map(p => [p.id, p]));
      for (const e of entries) {
        const p = byId[e.parent_id];
        if (!p) return json(400, { success: false, error: 'הורה לא מוכר' });
        if (!validIsraeliId(e.national_id)) {
          return json(400, { success: false, error: 'מספר תעודת הזהות של ' + p.full_name_he + ' לא תקין — בדקו שהוקלדו 9 ספרות נכונות' });
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      for (const e of entries) {
        const p = byId[e.parent_id];
        await supabase.from('events').delete().eq('garden_id', gid).eq('calendar', 'parent-id').eq('category', p.id);
        const { error } = await supabase.from('events').insert({
          garden_id: gid, calendar: 'parent-id', category: p.id,
          title: p.full_name_he, event_date: today,
          notes: JSON.stringify({
            parent_id: p.id, child_id: b.child_id, parent_name: p.full_name_he,
            national_id: digits(e.national_id).padStart(9, '0'), updated_at: new Date().toISOString(),
          }),
        });
        if (error) throw error;
      }
      return json(200, { success: true, saved: entries.length });
    }

    return json(400, { success: false, error: 'Unknown action' });
  } catch (e) {
    console.error('parent-ids error:', e);
    return json(500, { success: false, error: e.message });
  }
};

module.exports.validIsraeliId = validIsraeliId;
