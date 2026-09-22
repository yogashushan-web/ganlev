// Staff birthday board — active staff only, nearest birthday first.
//
// GET  /staff-birthdays?garden_id=              -> { rows }
// GET  /staff-birthdays?garden_id=&format=pdf   -> a printable PDF
// POST /staff-birthdays?garden_id= {action:'reminders'}
//      -> creates a "week before" event on the gan calendar for every active
//         staff birthday. The events endpoint's calendar sync mails the invite
//         to the personal calendar too, so one write covers both.

const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');
const { syncEventToCalendar } = require('./lib/calendar');

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const pad = n => String(n).padStart(2, '0');
const CATEGORY = 'יום הולדת לצוות';

// The next occurrence of this birthday, from today onwards.
function nextBirthday(birth, today) {
  const b = new Date(birth);
  let d = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (d < today) d = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
  return d;
}

async function buildRows(garden_id) {
  const { data, error } = await supabase.from('staff')
    .select('id,full_name_he,birth_date,position_he,status')
    .eq('garden_id', garden_id).eq('status', 'active');
  if (error) throw error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (data || [])
    .filter(s => s.birth_date)
    .map(s => {
      const b = new Date(s.birth_date);
      const next = nextBirthday(s.birth_date, today);
      const days = Math.round((next - today) / 86400000);
      const turning = next.getFullYear() - b.getFullYear();
      return {
        id: s.id,
        name: s.full_name_he,
        birth_date: s.birth_date,
        date: `${pad(b.getDate())}.${pad(b.getMonth() + 1)}`,
        weekday: WEEKDAYS[next.getDay()],
        age: String(turning),
        days,
        inDays: days === 0 ? 'היום 🎉' : days === 1 ? 'מחר' : days + ' ימים',
        role: s.position_he || '',
        next_date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      };
    })
    .sort((a, b) => a.days - b.days);
}

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const rows = await buildRows(garden_id);

      if (q.format === 'pdf') {
        const { buildStaffBdayPdf } = require('./lib/staff-bday-pdf');
        const buf = await buildStaffBdayPdf(rows);
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="gan-lev-staff-birthdays.pdf"',
            'Cache-Control': 'no-store',
          },
          body: buf.toString('base64'),
          isBase64Encoded: true,
        };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true, rows }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (b.action !== 'reminders') {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'פעולה לא ידועה' }) };
      }
      const rows = await buildRows(garden_id);

      // What already exists, so re-running never duplicates.
      const { data: existing } = await supabase.from('events')
        .select('event_date,title').eq('garden_id', garden_id).eq('category', CATEGORY);
      const have = new Set((existing || []).map(e => e.event_date + '|' + e.title));

      let created = 0;
      for (const r of rows) {
        const d = new Date(r.next_date);
        d.setDate(d.getDate() - 7);                       // שבוע לפני
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const title = 'שבוע ליום ההולדת של ' + r.name;
        if (have.has(date + '|' + title)) continue;

        const { data: ev, error } = await supabase.from('events').insert({
          garden_id, calendar: 'garden', category: CATEGORY, title,
          event_date: date, event_time: '09:00', end_time: '09:15',
          notes: `${r.name} חוגג/ת ${r.age} ב-${r.date} (יום ${r.weekday}).\nזמן להתארגן: ברכה, עוגה, מתנה קטנה מהצוות.`,
        }).select().single();
        if (error) throw error;
        try { await syncEventToCalendar('REQUEST', ev); } catch (e) { console.error('cal sync failed', e); }
        created++;
      }
      return { statusCode: 200, body: JSON.stringify({ success: true, created, total: rows.length }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('staff-birthdays error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
