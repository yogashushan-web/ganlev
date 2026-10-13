// POST /name-tags  { shape, children:[{first,last}] }  -> גיליון מדבקות A4
//
// הדפדפן שולח את השמות כפי שהם מופיעים ברשימת הילדים, כדי שהדף
// המודפס לא יוכל להתרחק ממה שרואים על המסך.

const { withAuth } = require('./lib/auth');
const { buildTagsPdf } = require('./lib/tags-pdf');

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }
    const { shape, children } = JSON.parse(event.body || '{}');
    if (!Array.isArray(children) || !children.length) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא נבחרו ילדים' }) };
    }
    const buf = await buildTagsPdf({ shape, children });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="gan-lev-name-tags.pdf"',
        'Cache-Control': 'no-store',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('name-tags error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
