// סידור מזרונים בחדר השינה — שמירה, טעינה, גרסאות, וטקסי ההירדמות.
//
// GET    /nap-layout?garden_id=        -> { plans, rituals }
// GET    /nap-layout?garden_id=&id=    -> { plan, versions }
// POST   /nap-layout?garden_id= {action:'save',    plan}
// POST   /nap-layout?garden_id= {action:'version', plan, note}
// POST   /nap-layout?garden_id= {action:'del-version', version_id}
// POST   /nap-layout?garden_id= {action:'ritual', child_id, needs[], needs_other, ritual, notes}
// DELETE /nap-layout/:id?garden_id=
//
// אותו דפוס אחסון כמו סידור הישיבה: JSON בתוך events.notes עם calendar
// ייעודי, כי אין הרשאה ליצור טבלאות.
//
// טקסי ההירדמות נקראים ונכתבים לאותו מקום שאליו כותב הטופס הציבורי
// (calendar='child-nap'), ולכן יש מקור אמת אחד: מה שההורים מילאו הוא
// מה שהגננת רואה על הדף, ועריכה שלה חוזרת לאותה רשומה.

const { supabase, validateGardenScope, moveToTrash, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL = 'nap-plan';
const CAL_VER = 'nap-plan-v';
const CAL_RITUAL = 'child-nap';
const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

async function readRituals(garden_id) {
  const { data } = await supabase.from('events')
    .select('category,notes')
    .eq('garden_id', garden_id).eq('calendar', CAL_RITUAL);
  const out = {};
  (data || []).forEach(r => {
    const p = parse(r.notes);
    out[r.category] = {
      needs: Array.isArray(p.needs) ? p.needs : [],
      needs_other: p.needs_other || '',
      ritual: p.ritual || '',
      notes: p.notes || '',
    };
  });
  return out;
}

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    const path = event.path.split('/').filter(Boolean);
    const urlId = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('events')
        .select('id,category,title,notes,created_at,event_date')
        .eq('garden_id', garden_id).eq('calendar', CAL);
      if (error) throw error;

      const plans = (data || []).map(r => {
        const p = parse(r.notes);
        return { id: r.category, row_id: r.id, name: r.title,
                 updated: p.saved_at || r.event_date || r.created_at, plan: p };
      }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));

      if (q.id) {
        const one = plans.find(p => p.id === q.id);
        const { data: vers } = await supabase.from('events')
          .select('id,title,notes,event_date,created_at')
          .eq('garden_id', garden_id).eq('calendar', CAL_VER).eq('category', q.id);
        const versions = (vers || []).map(v => ({
          id: v.id, note: v.title, date: v.event_date, created: v.created_at, plan: parse(v.notes),
        })).sort((a, b) => String(b.created).localeCompare(String(a.created)));
        return json(200, { success: true, plan: one || null, versions });
      }
      return json(200, { success: true, plans, rituals: await readRituals(garden_id) });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      if (b.action === 'save') {
        const p = b.plan || {};
        if (!p.id || !p.name) return json(400, { success: false, error: 'חסר מזהה או שם לסידור' });
        p.saved_at = new Date().toISOString();
        const notes = JSON.stringify(p);
        const { data: existing } = await supabase.from('events')
          .select('id').eq('garden_id', garden_id).eq('calendar', CAL).eq('category', p.id).limit(1);
        if (existing && existing.length) {
          const { error } = await supabase.from('events')
            .update({ title: p.name, notes, event_date: today() }).eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('events').insert({
            garden_id, calendar: CAL, category: p.id, title: p.name,
            event_date: today(), notes,
          });
          if (error) throw error;
        }
        await auditLog(garden_id, user.id, 'saved', 'nap-plan', p.id, { name: p.name });
        return json(200, { success: true });
      }

      if (b.action === 'version') {
        const p = b.plan || {};
        if (!p.id) return json(400, { success: false, error: 'חסר מזהה סידור' });
        const { error } = await supabase.from('events').insert({
          garden_id, calendar: CAL_VER, category: p.id,
          title: b.note || ('גרסה מ-' + today()),
          event_date: today(), notes: JSON.stringify(p),
        });
        if (error) throw error;
        return json(200, { success: true });
      }

      if (b.action === 'del-version') {
        if (!b.version_id) return json(400, { success: false, error: 'חסר מזהה גרסה' });
        const { data: rec } = await supabase.from('events')
          .select('*').eq('garden_id', garden_id).eq('calendar', CAL_VER).eq('id', b.version_id).limit(1);
        if (rec && rec.length) {
          await moveToTrash('events', rec[0], garden_id);
          await supabase.from('events').delete().eq('id', rec[0].id);
        }
        return json(200, { success: true });
      }

      // עריכת טקס ההירדמות מתוך הסידור. נכתב לאותה רשומה שאליה כותב
      // הטופס הציבורי, כדי שלא ייווצרו שתי אמיתות על אותו ילד.
      if (b.action === 'ritual') {
        if (!b.child_id) return json(400, { success: false, error: 'חסר מזהה ילד' });
        const payload = {
          child_id: b.child_id,
          child_name: b.child_name || null,
          needs: Array.isArray(b.needs) ? b.needs.slice(0, 12) : [],
          needs_other: (b.needs_other || '').trim() || null,
          ritual: (b.ritual || '').trim() || null,
          notes: (b.notes || '').trim() || null,
          submitted_at: new Date().toISOString(),
          edited_by_staff: true,
        };
        const { data: existing } = await supabase.from('events')
          .select('id').eq('garden_id', garden_id).eq('calendar', CAL_RITUAL)
          .eq('category', b.child_id).limit(1);
        if (existing && existing.length) {
          const { error } = await supabase.from('events')
            .update({ notes: JSON.stringify(payload), event_date: today() })
            .eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('events').insert({
            garden_id, calendar: CAL_RITUAL, category: b.child_id,
            title: 'ככה אני נרדם/ת', event_date: today(),
            notes: JSON.stringify(payload),
          });
          if (error) throw error;
        }
        return json(200, { success: true, ritual: payload });
      }

      return json(400, { success: false, error: 'פעולה לא ידועה' });
    }

    if (event.httpMethod === 'DELETE') {
      const { data: rec } = await supabase.from('events')
        .select('*').eq('garden_id', garden_id).eq('calendar', CAL).eq('category', urlId).limit(1);
      if (rec && rec.length) {
        await moveToTrash('events', rec[0], garden_id);
        await supabase.from('events').delete().eq('id', rec[0].id);
      }
      await supabase.from('events').delete()
        .eq('garden_id', garden_id).eq('calendar', CAL_VER).eq('category', urlId);
      return json(200, { success: true });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('nap-layout error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
