// The parent contact roster: one line per active child of the current school year.
// Shared by the web page and the PDF so the two can never drift apart.

const { supabase } = require('./db');
const { orderedChildren } = require('./boards');

// Mother first, then father — that is how the roster is read aloud. When the
// relationship was never recorded, fall back to the "primary parent" flag.
function orderParents(list) {
  const mother = list.find(p => p.relationship_type === 'mother');
  const father = list.find(p => p.relationship_type === 'father');
  const rest = list
    .filter(p => p !== mother && p !== father)
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
  return [mother || rest.shift() || null, father || rest.shift() || null];
}

const clean = s => (s == null ? '' : String(s)).trim();

async function buildRoster(gid) {
  const kids = await orderedChildren(gid);
  if (!kids.length) return [];

  const { data, error } = await supabase.from('parents')
    .select('child_id,full_name_he,phone,address,relationship_type,is_primary')
    .eq('garden_id', gid);
  if (error) throw error;

  const byChild = {};
  (data || []).forEach(p => { (byChild[p.child_id] = byChild[p.child_id] || []).push(p); });

  return kids.map(k => {
    const [m, f] = orderParents(byChild[k.id] || []);
    // One household per family, so the first address on file represents it.
    const address = clean((m && m.address) || (f && f.address));
    return {
      child: k.name,
      parent1: clean(m && m.full_name_he),
      phone1: clean(m && m.phone),
      parent2: clean(f && f.full_name_he),
      phone2: clean(f && f.phone),
      address,
    };
  }).sort((a, b) => a.child.localeCompare(b.child, 'he'));
}

module.exports = { buildRoster };
