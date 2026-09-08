// Public parent contact roster (the link lives in the parents' WhatsApp group).
// Always built live from the database, so adding or removing a child updates it.
//
// GET                -> { rows, updated }   for the page
// GET ?format=pdf    -> a PDF snapshot to keep on the phone

const { GARDEN_DEFAULT } = require('./lib/boards');
const { buildRoster } = require('./lib/parents-roster');

const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function pdfName() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `gan-lev-contacts-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.pdf`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { success: false, error: 'Method not allowed' });

    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const rows = await buildRoster(gid);

    if (q.format === 'pdf') {
      const { buildPdf } = require('./lib/parents-pdf');
      const buf = await buildPdf(rows);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName()}"`,
          'Cache-Control': 'no-store',
        },
        body: buf.toString('base64'),
        isBase64Encoded: true,
      };
    }

    return json(200, { success: true, rows, updated: new Date().toISOString() });
  } catch (e) {
    console.error('parents-list error:', e);
    return json(500, { success: false, error: e.message });
  }
};
