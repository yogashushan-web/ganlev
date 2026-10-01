// POST /nap-pdf  { sheet }  -> תוכנית חדר השינה כ-PDF, A4.
//
// הדפדפן שולח סנטימטרים עם אפס בפינת החדר — אותה מערכת צירים שהמסך
// מצייר ממנה — ולכן אין כאן לוגיקת פריסה שיכולה להתרחק ממה שרואים.

const { withAuth } = require('./lib/auth');
const { buildNapPdf } = require('./lib/nap-pdf');

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }
    const { sheet } = JSON.parse(event.body || '{}');
    if (!sheet || !Array.isArray(sheet.mats)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסרים נתוני הסידור' }) };
    }
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
