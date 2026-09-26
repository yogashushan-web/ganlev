// סידורי ישיבה בארוחות — שמירה, טעינה וגרסאות.
//
// GET    /seating?garden_id=            -> רשימת הסידורים
// GET    /seating?garden_id=&id=        -> סידור אחד + גרסאותיו
// POST   /seating?garden_id= {action:'save',    plan}     -> יצירה/עדכון
// POST   /seating?garden_id= {action:'version', id, note} -> שמירת גרסה
// POST   /seating?garden_id= {action:'restore', id, version_id}
// DELETE /seating/:id?garden_id=
//
// האחסון יושב בטבלת events כ-JSON, בדיוק כמו טופס שנת הצהריים והכרטיס
// האישי. כך אין צורך בטבלה חדשה, ואפשר להעביר למבנה ייעודי בהמשך.

const { supabase, validateGardenScope, moveToTrash, auditLog } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const CAL = 'seating';       // הסידור הנוכחי
const CAL_VER = 'seating-v'; // גרסאות שמורות
const json = (c, b) => ({ statusCode: c, body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const q = event.queryStringParameters || {};
    const garden_id = q.garden_id;
    const path = event.path.split('/').filter(Boolean);
    const urlId = path[path.length - 1];
    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      // לטבלת האירועים אין updated_at — הזמן האחרון נשמר בתוך ה-JSON עצמו.
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
      return json(200, { success: true, plans });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');

      if (b.action === 'save') {
        const p = b.plan || {};
        if (!p.id || !p.name) return json(400, { success: false, error: 'חסר מזהה או שם לסידור' });
        p.saved_at = new Date().toISOString();
        const body = {
          garden_id, calendar: CAL, category: p.id, title: p.name,
          event_date: today(), notes: JSON.stringify(p),
        };
        const { data: existing } = await supabase.from('events')
          .select('id').eq('garden_id', garden_id).eq('calendar', CAL).eq('category', p.id).limit(1);
        if (existing && existing.length) {
          const { error } = await supabase.from('events')
            .update({ title: p.name, notes: body.notes, event_date: today() })
            .eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('events').insert(body);
          if (error) throw error;
        }
        await auditLog(garden_id, user.id, 'saved', 'seating', p.id, { name: p.name });
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
    console.error('seating error:', err);
    return json(500, { success: false, error: err.message });
  }
});

exports.handler = handler;
