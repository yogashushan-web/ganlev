// Birthday-call reminder anchor.
// Rule: reminder = birthday −10 days at 17:00; if it lands on Fri/Sat → move to the
// Thursday before. September & August birthdays are pinned to July 10 of the school
// year's END year (Sept=adaptation, Aug=camp → celebrate July / first week of Aug).
// Creates a garden calendar event + a linked event_cards row, and pushes to the
// personal Google calendar. Idempotent (one per child, never in the past).

const { supabase } = require('./db');
const { syncEventToCalendar } = require('./calendar');

const pad = n => String(n).padStart(2, '0');
const PLAN_DEFAULT =
  'מה מביאים לגן:\n• לוח עם תמונות מעולמו של הילד/ה\n• צלחת פירות\n• עוגה\n• מתנה לגן';

function schoolYearStartYr(schoolYear) {
  if (schoolYear && /^\d{4}-\d{2}$/.test(schoolYear)) return parseInt(schoolYear.slice(0, 4), 10);
  const now = new Date();
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// -> { date:'YYYY-MM-DD', batch:bool, occYear } | null
function computeReminderDate(birth_date, startYr) {
  if (!birth_date) return null;
  const [, mm, dd] = String(birth_date).split('-').map(Number);
  if (!mm || !dd) return null;

  // Sept (adaptation) & Aug (camp) -> July 10 of the school-year end year.
  if (mm === 9 || mm === 8) {
    const occYear = mm === 9 ? startYr : startYr + 1;
    return { date: `${startYr + 1}-07-10`, batch: true, occYear };
  }

  // occurrence of the birthday within the school year (Sep-Dec -> startYr, Jan-Jul -> startYr+1)
  const occYear = mm >= 9 ? startYr : startYr + 1;
  const rem = new Date(Date.UTC(occYear, mm - 1, dd));
  rem.setUTCDate(rem.getUTCDate() - 10);
  const dow = rem.getUTCDay();               // 0=Sun … 5=Fri, 6=Sat
  if (dow === 5) rem.setUTCDate(rem.getUTCDate() - 1);       // Fri -> Thu
  else if (dow === 6) rem.setUTCDate(rem.getUTCDate() - 2);  // Sat -> Thu
  const date = `${rem.getUTCFullYear()}-${pad(rem.getUTCMonth() + 1)}-${pad(rem.getUTCDate())}`;
  return { date, batch: false, occYear };
}

function todayISO() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// child = { id, first_name_he, last_name_he, birth_date, school_year }
async function createBirthdayCallReminder(child, garden_id) {
  if (!child || !child.id) return { skipped: true, reason: 'no_child' };
  if (!child.birth_date) return { skipped: true, reason: 'no_birth_date' };
  const startYr = schoolYearStartYr(child.school_year);
  const calc = computeReminderDate(child.birth_date, startYr);
  if (!calc) return { skipped: true, reason: 'bad_date' };
  const name = (child.first_name_he + ' ' + (child.last_name_he || '')).trim();

  // already have one?
  const { data: existing } = await supabase.from('event_cards').select('id')
    .eq('garden_id', garden_id).eq('kind', 'birthday_call').eq('child_id', child.id).limit(1);
  if (existing && existing.length) return { skipped: true, reason: 'exists', name };

  // window already passed -> caller notifies at creation
  if (calc.date < todayISO()) return { skipped: true, reason: 'past', date: calc.date, name };

  const { data: ev, error: e1 } = await supabase.from('events').insert({
    garden_id, calendar: 'garden', category: 'שיחת יום הולדת',
    title: 'שיחת יום הולדת · ' + name, event_date: calc.date,
    event_time: '17:00', end_time: '17:30', notes: null,
  }).select().single();
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('event_cards').insert({
    garden_id, kind: 'birthday_call', child_id: child.id, event_id: ev.id,
    title: name, scheduled_date: calc.date, scheduled_time: '17:00',
    urgency: 'important', status: 'planned',
    summary: { plan: PLAN_DEFAULT, batch: calc.batch, birth_date: child.birth_date, occYear: calc.occYear },
  });
  if (e2) throw e2;

  try { await syncEventToCalendar('REQUEST', ev); } catch (e) { console.error('bday-call cal sync failed', e); }
  return { created: true, date: calc.date, batch: calc.batch, name };
}

module.exports = { createBirthdayCallReminder, computeReminderDate, PLAN_DEFAULT };
