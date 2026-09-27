// POST /seating-pdf  { sheet }  -> the seating plan as an A4 landscape PDF.
//
// The browser sends geometry it has already resolved (absolute seat centres,
// table rectangles with their rotation), so the sheet on paper is the same
// sheet on screen and there is no layout logic to keep in sync.

const { withAuth } = require('./lib/auth');
const { buildSeatingPdf } = require('./lib/seating-pdf');

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }
    const { sheet } = JSON.parse(event.body || '{}');
    if (!sheet || !Array.isArray(sheet.seats)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסרים נתוני הסידור' }) };
    }

    const buf = await buildSeatingPdf(sheet);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="gan-lev-seating.pdf"',
        'Cache-Control': 'no-store',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('seating-pdf error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
