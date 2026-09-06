// PUBLIC tour-visit booking (no auth). A family that filled the interest form
// gets a personal link with their interest_forms id (?lead=) and picks one of
// the open dates. One choice per lead — picking again overwrites the previous one.
//
// GET  ?lead=<interest_form id>   -> { lead:{child_name}, slots:[{id,date,time_start,time_end,remaining}], chosen_slot_id }
// POST { lead_id, slot_id }        -> books it (capacity-checked)

const { supabase } = require('./lib/db');
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

async function slotsWithRemaining(gardenId) {
  const { data: slots, error } = await supabase.from('tour_slots').select('*').eq('garden_id', gardenId).order('date');
  if (error) throw error;
  const { data: booked } = await supabase.from('interest_forms').select('tour_slot_id').eq('garden_id', gardenId).not('tour_slot_id', 'is', null);
  const counts = {};
  (booked || []).forEach(r => { counts[r.tour_slot_id] = (counts[r.tour_slot_id] || 0) + 1; });
  return (slots || []).map(s => ({
    id: s.id, date: s.date, time_start: s.time_start, time_end: s.time_end,
    remaining: Math.max(0, s.capacity - (counts[s.id] || 0)),
  }));
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const leadId = (event.queryStringParameters || {}).lead;
      if (!leadId) return json(400, { success: false, error: 'חסר מזהה' });
      const { data: lead, error } = await supabase.from('interest_forms')
        .select('id,garden_id,child_name,parent1_name,tour_slot_id').eq('id', leadId).single();
      if (error || !lead) return json(404, { success: false, error: 'הקישור לא תקין' });
      const slots = await slotsWithRemaining(lead.garden_id);
      return json(200, { success: true, lead: { child_name: lead.child_name, parent1_name: lead.parent1_name }, slots, chosen_slot_id: lead.tour_slot_id });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!b.lead_id || !b.slot_id) return json(400, { success: false, error: 'חסרים פרטים' });
      const { data: lead, error: e1 } = await supabase.from('interest_forms').select('id,garden_id').eq('id', b.lead_id).single();
      if (e1 || !lead) return json(404, { success: false, error: 'הקישור לא תקין' });
      const slots = await slotsWithRemaining(lead.garden_id);
      const slot = slots.find(s => s.id === b.slot_id);
      if (!slot) return json(404, { success: false, error: 'התאריך לא נמצא' });
      if (slot.remaining <= 0) return json(409, { success: false, error: 'התאריך הזה מלא — בחרו תאריך אחר' });
      const { error: e2 } = await supabase.from('interest_forms').update({ tour_slot_id: b.slot_id }).eq('id', b.lead_id);
      if (e2) throw e2;
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('tour-book error:', err);
    return json(500, { success: false, error: err.message });
  }
};
