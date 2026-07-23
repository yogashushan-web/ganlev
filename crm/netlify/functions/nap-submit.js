// PUBLIC nap-ritual form ("שנת הצהריים"). No auth — parents fill it.
// GET  /nap-submit?garden_id=            -> { children:[{id,name}] } (current school year)
// POST { garden_id, child_id, child_name, needs[], needs_other, ritual, notes }
//   -> upsert one row per child.

const { supabase } = require('./lib/db');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31'; // גן לב
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;

    if (event.httpMethod === 'GET') {
      const now = new Date();
      const startYr = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const curYear = startYr + '-' + String(startYr + 1).slice(2);
      const { data, error } = await supabase.from('children')
        .select('id,first_name_he,last_name_he')
        .eq('garden_id', gid).eq('status', 'active')
        .or(`school_year.eq.${curYear},school_year.is.null`);
      if (error) throw error;
      const children = (data || [])
        .map(c => ({ id: c.id, name: (c.first_name_he + ' ' + (c.last_name_he || '')).trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      return json(200, { success: true, children });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.child_id) return json(400, { success: false, error: 'לא נבחר ילד' });
      const row = {
        garden_id: gid,
        child_id: b.child_id,
        child_name: b.child_name || null,
        needs: Array.isArray(b.needs) ? b.needs : [],
        needs_other: (b.needs_other || '').trim() || null,
        ritual: (b.ritual || '').trim() || null,
        notes: (b.notes || '').trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('nap_forms').upsert(row, { onConflict: 'garden_id,child_id' });
      if (error) throw error;
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('nap-submit error:', e);
    return json(500, { success: false, error: e.message });
  }
};
