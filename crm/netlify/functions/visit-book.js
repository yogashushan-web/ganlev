// PUBLIC August "ימי היכרות" capsule booking. No auth.
// Slots: dates 23-27 & 30-31 Aug 2026, two capsules/day (09:00-09:50, 10:00-10:50),
// up to 6 families each. One booking per child PER DAY; unlimited across days.
//
// Each booking = one event (calendar='visit', category=CAT). In addition, for every
// capsule we keep ONE summary event (calendar='garden', category=CAT) listing all the
// registered names — this is what shows on the gan calendar and syncs to the personal
// calendar. On cancellation we also send a heads-up email.
//
// GET  ?garden_id=                 -> { dates, slots, capacity, counts, children }
// GET  ?garden_id=&child_id=       -> { ..., childBookings:[{date,time}] }
// GET  ?garden_id=&admin=<key>     -> { ..., board:{ 'date|time':[names] } }
// POST { action:'book',        garden_id, child_id, child_name, date, time_start }
// POST { action:'cancel',      garden_id, child_id, date, time_start }
// POST { action:'email_board', admin:<key> }        -> email the board to the owner
// POST { action:'rebuild',     admin:<key> }         -> rebuild all capsule summaries

const { supabase } = require('./lib/db');
const { syncEventToCalendar } = require('./lib/calendar');

const GARDEN_DEFAULT = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';
const CAT = 'ביקור היכרות';
const CAP = 6;
const SLOTS = [{ s: '09:00', e: '09:50' }, { s: '10:00', e: '10:50' }];
const DATES = ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-30', '2026-08-31'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function currentSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  const s = d.getMonth() >= 6 ? y : y - 1;
  return s + '-' + String(s + 1).slice(2);
}
function childOf(notes) { try { return JSON.parse(notes || '{}').child_id; } catch (_) { return null; } }
function nameOf(notes) { try { return JSON.parse(notes || '{}').child_name || ''; } catch (_) { return ''; } }
function fmtDate(d) { const [y, m, dd] = d.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return `יום ${DAY_NAMES[dow]} · ${dd} ב${MONTHS[m - 1]}`; }

// Rebuild the single "garden" summary event for one capsule from its bookings,
// and push the change to the personal calendar.
async function syncCapsule(gid, date, timeStart, doSync = true) {
  const slot = SLOTS.find(s => s.s === timeStart); if (!slot) return;
  const { data: bookings } = await supabase.from('events')
    .select('notes').eq('garden_id', gid).eq('calendar', 'visit').eq('category', CAT)
    .eq('event_date', date).eq('event_time', timeStart);
  const names = (bookings || []).map(r => nameOf(r.notes)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));

  const { data: sums } = await supabase.from('events')
    .select('id').eq('garden_id', gid).eq('calendar', 'garden').eq('category', CAT)
    .eq('event_date', date).eq('event_time', timeStart);
  const summary = (sums || [])[0];

  if (names.length) {
    const title = `ביקור היכרות (${names.length}): ${names.join(', ')}`;
    const notes = names.join(', ');
    let id = summary && summary.id;
    if (id) {
      await supabase.from('events').update({ title, notes }).eq('id', id);
    } else {
      const { data: ins } = await supabase.from('events').insert({
        garden_id: gid, calendar: 'garden', category: CAT, title,
        event_date: date, event_time: timeStart, end_time: slot.e, notes,
      }).select('id').single();
      id = ins && ins.id;
    }
    if (doSync) try { await syncEventToCalendar('REQUEST', { id, calendar: 'garden', category: CAT, title, event_date: date, event_time: timeStart, end_time: slot.e, notes }); } catch (e) { console.error('cal sync', e); }
  } else if (summary) {
    if (doSync) try { await syncEventToCalendar('CANCEL', { id: summary.id, calendar: 'garden', category: CAT, title: 'ביקור היכרות', event_date: date, event_time: timeStart, end_time: slot.e }); } catch (e) {}
    await supabase.from('events').delete().eq('id', summary.id);
  }
}

async function sendEmail(subject, text) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.PERSONAL_CAL_EMAIL || 'joelkarmeli@gmail.com';
  if (!user || !pass) return;
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({ from: 'גן לב <' + user + '>', to, subject, text });
}

async function boardByCapsule(gid) {
  const { data } = await supabase.from('events')
    .select('event_date,event_time,notes').eq('garden_id', gid).eq('calendar', 'visit').eq('category', CAT).in('event_date', DATES);
  const board = {};
  (data || []).forEach(e => {
    const key = e.event_date + '|' + (e.event_time || '').slice(0, 5);
    (board[key] = board[key] || []).push(nameOf(e.notes));
  });
  Object.keys(board).forEach(k => board[k].sort((a, b) => a.localeCompare(b, 'he')));
  return board;
}
function boardToText(board) {
  const lines = ['לוח ימי היכרות — גן לב', ''];
  DATES.forEach(date => {
    lines.push(fmtDate(date));
    SLOTS.forEach(sl => {
      const names = board[date + '|' + sl.s] || [];
      lines.push(`  ${sl.s}–${sl.e} (${names.length}): ` + (names.join(', ') || '—'));
    });
    lines.push('');
  });
  return lines.join('\n');
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const ADMIN = process.env.VISIT_ADMIN_KEY;

    if (event.httpMethod === 'GET') {
      const { data: evs } = await supabase.from('events').select('event_date,event_time,notes')
        .eq('garden_id', gid).eq('calendar', 'visit').eq('category', CAT).in('event_date', DATES);
      const counts = {}, childBookings = [];
      (evs || []).forEach(e => {
        const t = (e.event_time || '').slice(0, 5);
        const key = e.event_date + '|' + t;
        counts[key] = (counts[key] || 0) + 1;
        if (q.child_id && childOf(e.notes) === q.child_id) childBookings.push({ date: e.event_date, time: t });
      });
      let children = [];
      if (!q.child_id) {
        const curYear = currentSchoolYear();
        const { data } = await supabase.from('children').select('id,first_name_he,last_name_he')
          .eq('garden_id', gid).eq('status', 'active').or(`school_year.eq.${curYear},school_year.is.null`);
        children = (data || []).map(c => ({ id: c.id, name: (c.first_name_he + ' ' + (c.last_name_he || '')).trim() }))
          .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      }
      const out = { success: true, dates: DATES, slots: SLOTS, capacity: CAP, counts, children, childBookings };
      if (ADMIN && q.admin === ADMIN) out.board = await boardByCapsule(gid);
      return json(200, out);
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      if (b.action === 'email_board') {
        if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
        try { await sendEmail('לוח ימי היכרות — גן לב', boardToText(await boardByCapsule(gid))); return json(200, { success: true }); }
        catch (e) { return json(500, { success: false, error: e.message }); }
      }
      if (b.action === 'rebuild') {
        // DB-only refresh of all summary events (fast, no calendar emails)
        if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
        for (const d of DATES) for (const s of SLOTS) await syncCapsule(gid, d, s.s, false);
        return json(200, { success: true });
      }
      if (b.action === 'sync_cal') {
        // push ONE day's capsules to the personal calendar (2 emails; call per day)
        if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
        if (!DATES.includes(b.date)) return json(400, { success: false, error: 'תאריך לא תקין' });
        for (const s of SLOTS) await syncCapsule(gid, b.date, s.s, true);
        return json(200, { success: true });
      }

      if (!b.child_id || !b.date || !b.time_start) return json(400, { success: false, error: 'חסרים פרטים' });

      if (b.action === 'cancel') {
        const { data: rows } = await supabase.from('events').select('id,notes')
          .eq('garden_id', gid).eq('calendar', 'visit').eq('category', CAT).eq('event_date', b.date).eq('event_time', b.time_start);
        let who = '';
        for (const r of (rows || [])) if (childOf(r.notes) === b.child_id) { who = nameOf(r.notes); await supabase.from('events').delete().eq('id', r.id); }
        await syncCapsule(gid, b.date, b.time_start);
        try { await sendEmail('❌ ביטול ביקור היכרות — ' + (who || ''), (who || 'משפחה') + ' ביטל/ה את הביקור ב' + fmtDate(b.date) + ' בשעה ' + b.time_start + '.'); } catch (e) {}
        return json(200, { success: true });
      }

      // book
      if (!b.child_name) return json(400, { success: false, error: 'חסר שם ילד/ה' });
      if (!DATES.includes(b.date)) return json(400, { success: false, error: 'תאריך לא תקין' });
      const slot = SLOTS.find(s => s.s === b.time_start);
      if (!slot) return json(400, { success: false, error: 'שעה לא תקינה' });

      const { data: sameDay } = await supabase.from('events').select('id,event_time,notes')
        .eq('garden_id', gid).eq('calendar', 'visit').eq('category', CAT).eq('event_date', b.date);
      if ((sameDay || []).some(r => childOf(r.notes) === b.child_id))
        return json(409, { success: false, error: 'כבר יש לכם ביקור ביום הזה — בטלו אותו כדי לבחור שעה אחרת' });
      const taken = (sameDay || []).filter(r => (r.event_time || '').slice(0, 5) === b.time_start).length;
      if (taken >= CAP) return json(409, { success: false, error: 'הקפסולה מלאה — נסו שעה או יום אחרים' });

      const { error } = await supabase.from('events').insert({
        garden_id: gid, calendar: 'visit', category: CAT, title: b.child_name,
        event_date: b.date, event_time: b.time_start, end_time: slot.e,
        notes: JSON.stringify({ child_id: b.child_id, child_name: b.child_name }),
      });
      if (error) throw error;
      await syncCapsule(gid, b.date, b.time_start);
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('visit-book error:', e);
    return json(500, { success: false, error: e.message });
  }
};
