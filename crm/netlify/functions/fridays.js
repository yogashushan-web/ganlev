// ימי שישי — הצד המאומת. לוח השנה של הגן, שיבוץ צוות, ואישור בקשות.
//
// אחסון ב-events (אין הרשאה ליצור טבלאות):
//   friday   · category = YYYY-MM-DD · { capacity, regs:[], staff:[] }
//   gan-cal  · category = YYYY-MM-DD · { kind, name }  — חג, חופשה, סגור
//
// ההגדרות יושבות בפרופיל הגן תחת `fridays`, כי הן תיאור של איך הגן
// עובד ולא נתון של הכלי. ראו "העיקרון הראשון" ב-CLAUDE.md.

const { supabase, auditLog, validateGardenScope, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');
const F = require('./lib/fridays');

const CAL = 'friday';
const CAL_CAL = 'gan-cal';

const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => F.iso(new Date());

async function upsert(garden_id, cal, category, title, payload) {
  payload.saved_at = new Date().toISOString();
  const notes = JSON.stringify(payload);
  const { data } = await supabase.from('events').select('id')
    .eq('garden_id', garden_id).eq('calendar', cal).eq('category', category).limit(1);
  if (data && data.length) {
    const { error } = await supabase.from('events')
      .update({ title, notes, event_date: today() }).eq('id', data[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('events')
      .insert({ garden_id, calendar: cal, category, title, event_date: today(), notes });
    if (error) throw error;
  }
}

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    validateGardenScope(user.garden_id, garden_id, user.role);
    const me = user.sub || user.id;

    if (event.httpMethod === 'GET') {
      const [dRes, cRes, pRes] = await Promise.all([
        supabase.from('events').select('category,notes')
          .eq('garden_id', garden_id).eq('calendar', CAL),
        supabase.from('events').select('category,title,notes')
          .eq('garden_id', garden_id).eq('calendar', CAL_CAL),
        supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', 'garden-profile')
          .eq('category', 'profile').limit(1),
      ]);
      if (dRes.error) throw dRes.error;

      const days = {};
      (dRes.data || []).forEach(r => { days[r.category] = parse(r.notes); });
      const calendar = {};
      (cRes.data || []).forEach(r => {
        calendar[r.category] = Object.assign({ name: r.title }, parse(r.notes));
      });
      const profile = (pRes.data && pRes.data.length) ? parse(pRes.data[0].notes) : {};
      const settings = F.settingsOf(profile.fridays);

      return json(200, { success: true, days, calendar, settings });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      // ---- לוח השנה של הגן ----
      // יום בלוח חוסם הרשמה ומציג את הסיבה במקומה. "פסח" במקום
      // טופס הרשמה אומר להורה יותר מאשר שורה ריקה.
      if (b.action === 'calendar') {
        const d = String(b.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          return json(400, { success: false, error: 'תאריך לא תקין' });
        }
        if (b.remove) {
          const { data } = await supabase.from('events').select('*')
            .eq('garden_id', garden_id).eq('calendar', CAL_CAL).eq('category', d).limit(1);
          if (data && data.length) {
            await moveToTrash('events', data[0], garden_id);
            await supabase.from('events').delete().eq('id', data[0].id);
          }
          return json(200, { success: true });
        }
        const name = String(b.name || '').trim();
        if (!name) return json(400, { success: false, error: 'צריך שם ליום' });
        await upsert(garden_id, CAL_CAL, d, name, { kind: b.kind || 'holiday' });
        await auditLog(garden_id, me, 'saved', 'gan-cal', d, { name });
        return json(200, { success: true });
      }

      // ---- טווח חופשה ----
      // לוח חופשות מגיע בטווחים ("פסח 19–28.4"), לא בתאריכים בודדים.
      // נרשמים רק ימי השישי שבתוך הטווח: שאר הימים אינם משפיעים על
      // ההרשמה, ורשימה של עשרה תאריכים מיותרים רק מקשה לקרוא את הלוח.
      if (b.action === 'range') {
        const from = String(b.from || ''), to = String(b.to || '');
        const name = String(b.name || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return json(400, { success: false, error: 'תאריכים לא תקינים' });
        }
        if (!name) return json(400, { success: false, error: 'צריך שם לחופשה' });
        if (to < from) return json(400, { success: false, error: 'תאריך הסיום לפני ההתחלה' });

        const dates = [];
        const d = F.parseIso(from), end = F.parseIso(to);
        while (d <= end) {
          if (d.getDay() === 5 || b.allDays) dates.push(F.iso(d));
          d.setDate(d.getDate() + 1);
          if (dates.length > 200) break;
        }
        for (const dt of dates) {
          await upsert(garden_id, CAL_CAL, dt, name, { kind: b.kind || 'holiday' });
        }
        await auditLog(garden_id, me, 'saved', 'gan-cal', from + '..' + to,
                       { name, n: dates.length });
        return json(200, { success: true, dates });
      }

      // ---- שיבוץ צוות ----
      if (b.action === 'staff') {
        const d = String(b.date || '');
        const { data } = await supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL).eq('category', d).limit(1);
        const rec = (data && data.length) ? parse(data[0].notes) : {};
        rec.staff = Array.isArray(b.staff) ? b.staff.slice(0, 12) : [];
        await upsert(garden_id, CAL, d, 'שישי ' + d, rec);
        return json(200, { success: true });
      }

      // ---- אישור או דחייה של בקשה מאוחרת ----
      if (b.action === 'decide') {
        const d = String(b.date || '');
        const { data } = await supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL).eq('category', d).limit(1);
        const rec = (data && data.length) ? parse(data[0].notes) : {};
        const regs = rec.regs || [];
        const r = regs.find(x => x.id === b.regId);
        if (!r) return json(404, { success: false, error: 'הבקשה לא נמצאה' });
        r.status = b.approve ? 'ok' : 'rejected';
        r.decidedAt = new Date().toISOString();
        rec.regs = regs;
        await upsert(garden_id, CAL, d, 'שישי ' + d, rec);
        await auditLog(garden_id, me, b.approve ? 'approved' : 'rejected', 'friday', d,
                       { child: r.name });
        return json(200, { success: true });
      }

      // ---- הסרה ידנית של נרשם, או שינוי קיבולת ליום בודד ----
      if (b.action === 'day') {
        const d = String(b.date || '');
        const { data } = await supabase.from('events').select('notes')
          .eq('garden_id', garden_id).eq('calendar', CAL).eq('category', d).limit(1);
        const rec = (data && data.length) ? parse(data[0].notes) : {};
        if (b.removeReg) rec.regs = (rec.regs || []).filter(x => x.id !== b.removeReg);
        if (b.capacity !== undefined) {
          rec.capacity = b.capacity === null || b.capacity === '' ? null : Number(b.capacity);
        }
        await upsert(garden_id, CAL, d, 'שישי ' + d, rec);
        return json(200, { success: true });
      }

      return json(400, { success: false, error: 'פעולה לא מוכרת' });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('fridays error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
