// Shared logic: create next month's staff-schedule round + email the link to Yoel.
// Used by both the manual "run now" admin action and the 15th-of-the-month cron.

const { supabase } = require('./db');

function nextMonthRange() {
  const d = new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // 0-11, this month
  const start = new Date(Date.UTC(y, m + 1, 1));
  const end = new Date(Date.UTC(y, m + 2, 0)); // last day of next month
  const deadline = new Date(Date.UTC(y, m + 1, 0)); // last day of THIS month
  const fmt = dt => dt.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end), deadline: fmt(deadline) };
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

async function sendLinkEmail(round, gardenName) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) { console.error('schedule-round: missing GMAIL_USER/GMAIL_APP_PASSWORD, skipping email'); return; }
  const to = 'joelkarmeli@gmail.com';
  const link = 'https://ganlev.netlify.app/crm/html/staff-constraints.html?round=' + round.id;
  const monthName = MONTHS_HE[new Date(round.start_date + 'T00:00:00Z').getUTCMonth()];
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({
    from: 'גן לב <' + user + '>',
    to,
    subject: `אילוצים לחודש ${monthName} — קישור לשליחה לצוות`,
    text: `היי,\n\nהקישור למילוי אילוצים לחודש ${monthName} (${gardenName || ''}) מוכן.\nאפשר להעביר אותו לקבוצת הוואטסאפ של הצוות:\n\n${link}\n\nדדליין למילוי: ${round.deadline}\n\n💛`,
  });
}

// Creates the round if one doesn't already exist for this garden+start_date (idempotent).
async function createRoundForNextMonth(gardenId) {
  const { start_date, end_date, deadline } = nextMonthRange();
  const { data: existing } = await supabase.from('staff_schedule_rounds')
    .select('*').eq('garden_id', gardenId).eq('start_date', start_date).maybeSingle();
  let round = existing;
  if (!round) {
    const { data, error } = await supabase.from('staff_schedule_rounds').insert({
      garden_id: gardenId, period_type: 'month', start_date, end_date, deadline,
    }).select().single();
    if (error) throw error;
    round = data;
  }
  let gardenName = '';
  try { const g = await supabase.from('gardens').select('name').eq('id', gardenId).single(); gardenName = g.data && g.data.name; } catch (e) {}
  try { await sendLinkEmail(round, gardenName); } catch (e) { console.error('schedule-round email failed', e); }
  return round;
}

module.exports = { createRoundForNextMonth, nextMonthRange };
