// Scheduled: runs on the 15th of every month. Creates next month's staff-schedule
// round for every garden that has active staff, and emails the shared fill-in
// link to Yoel so he can forward it to the team WhatsApp group.
// Registered also in netlify.toml (belt-and-suspenders — see comment there).

const { supabase } = require('./lib/db');
const { createRoundForNextMonth } = require('./lib/schedule-round');

exports.handler = async () => {
  try {
    const { data: gardens } = await supabase.from('gardens').select('id,name');
    const results = [];
    for (const g of (gardens || [])) {
      const { count } = await supabase.from('staff').select('id', { count: 'exact', head: true }).eq('garden_id', g.id).eq('status', 'active');
      if (!count) continue;
      try {
        const round = await createRoundForNextMonth(g.id);
        results.push({ garden: g.name, round_id: round.id });
      } catch (e) {
        console.error('monthly-schedule-round failed for garden', g.id, e);
        results.push({ garden: g.name, error: e.message });
      }
    }
    console.log('monthly-schedule-round summary', results);
    return { statusCode: 200, body: JSON.stringify({ success: true, results }) };
  } catch (err) {
    console.error('monthly-schedule-round error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};

// 06:00 UTC on the 15th ≈ 08:00–09:00 Israel time.
exports.config = { schedule: '0 6 15 * *' };
