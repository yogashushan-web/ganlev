// POST /nap-pdf  { sheet }  -> תוכנית חדר השינה כ-PDF, A4.
//
// הדפדפן שולח סנטימטרים עם אפס בפינת החדר — אותה מערכת צירים שהמסך
// מצייר ממנה — ולכן אין כאן לוגיקת פריסה שיכולה להתרחק ממה שרואים.

const { withAuth } = require('./lib/auth');
const { supabase, validateGardenScope } = require('./lib/db');
const { buildNapPdf } = require('./lib/nap-pdf');

// התמונות נשלפות בשרת ולא נשלחות מהדפדפן: ארבע עשרה תמונות הן כמעט
// שני מגה-בייט, וזו בקשת רשת שלא כדאי לשלוח פעמיים.
async function loadFaces(garden_id, ids) {
  if (!ids.length) return {};
  const { data } = await supabase.from('events')
    .select('category,notes')
    .eq('garden_id', garden_id).eq('calendar', 'child-card').in('category', ids);
  const out = {};
  (data || []).forEach(r => {
    try { const p = JSON.parse(r.notes || '{}'); if (p.photo) out[r.category] = p.photo; }
    catch (e) {}
  });
  return out;
}

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }
    const { sheet } = JSON.parse(event.body || '{}');
    if (!sheet || !Array.isArray(sheet.mats)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסרים נתוני הסידור' }) };
    }
    const q = event.queryStringParameters || {};
    validateGardenScope(event.user.garden_id, q.garden_id, event.user.role);
    const ids = [...new Set(sheet.mats.map(m => m.child_id).filter(Boolean))];
    sheet.faces = await loadFaces(q.garden_id, ids);
    const buf = await buildNapPdf(sheet);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="gan-lev-nap.pdf"',
        'Cache-Control': 'no-store',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('nap-pdf error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
