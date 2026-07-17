// Push a garden calendar event to the owner's personal Google Calendar, by
// emailing an .ics invite FROM a different account (GMAIL_USER, e.g. ganlev.tlv)
// TO the personal calendar (PERSONAL_CAL_EMAIL, e.g. joelkarmeli). Sending to a
// *different* address is what makes Google auto-add it (a self-invite won't).

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stampUTC = () => new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => (t || '').slice(0, 5);

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return '' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function buildEventICS(method, ev, organizer, attendee) {
  const timed = !!ev.event_time;
  const seq = Math.floor(Date.now() / 1000);   // monotonic -> updates/cancels supersede
  let dtstart, dtend, alarm = [];
  if (timed) {
    dtstart = 'DTSTART:' + ev.event_date.replace(/-/g, '') + 'T' + hhmm(ev.event_time).replace(':', '') + '00';
    dtend = 'DTEND:' + ev.event_date.replace(/-/g, '') + 'T' + hhmm(ev.end_time || ev.event_time).replace(':', '') + '00';
    if (method !== 'CANCEL') alarm = ['BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:תזכורת', 'END:VALARM'];
  } else {
    dtstart = 'DTSTART;VALUE=DATE:' + ev.event_date.replace(/-/g, '');
    dtend = 'DTEND;VALUE=DATE:' + nextDay(ev.event_date);
  }
  const summary = (ev.category ? '[' + ev.category + '] ' : '') + (ev.title || 'אירוע');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gan Lev//Calendar//HE', 'METHOD:' + method, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:event-' + ev.id + '@ganlev.netlify.app',
    'DTSTAMP:' + stampUTC(), dtstart, dtend,
    'SUMMARY:' + icsEsc(summary),
    ...(ev.notes ? ['DESCRIPTION:' + icsEsc(ev.notes)] : []),
    'ORGANIZER;CN=גן לב:mailto:' + organizer,
    'ATTENDEE;CN=' + attendee + ';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + attendee,
    'SEQUENCE:' + seq, 'STATUS:' + (method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
    ...alarm, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

// method: 'REQUEST' (create/update) | 'CANCEL' (delete)
async function syncEventToCalendar(method, ev) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !ev || !ev.event_date) return;
  if (ev.calendar && ev.calendar !== 'garden') return;      // only the gan calendar
  if (ev.category === 'זמן הורים') return;                    // handled by meetings.js (booked slots only)
  const to = process.env.PERSONAL_CAL_EMAIL || user;
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    const summary = (ev.category ? '[' + ev.category + '] ' : '') + (ev.title || 'אירוע');
    await t.sendMail({
      from: 'גן לב <' + user + '>', to,
      subject: (method === 'CANCEL' ? '❌ בוטל — ' : '📅 ') + summary + ' (' + ev.event_date + (ev.event_time ? ' ' + hhmm(ev.event_time) : '') + ')',
      text: summary,
      icalEvent: { method, content: buildEventICS(method, ev, user, to) },
    });
  } catch (e) { console.error('calendar sync failed', e); }
}

module.exports = { syncEventToCalendar };
