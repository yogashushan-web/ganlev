// Owner-only consolidated boards, gated by the shared admin key (VISIT_ADMIN_KEY).
// GET  ?garden_id=&type=nap|cards&admin=<key>  -> children (oldest->youngest) + their data
// POST { action:'email', type, garden_id, admin } -> email the board text to the owner
// (Staff reach the same boards with a Google sign-in — see staff-boards.js.)

const { GARDEN_DEFAULT, buildBoard, boardText } = require('./lib/boards');

const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

async function sendEmail(subject, text) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.PERSONAL_CAL_EMAIL || 'joelkarmeli@gmail.com';
  if (!user || !pass) return;
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({ from: 'גן לב <' + user + '>', to, subject, text });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const ADMIN = process.env.VISIT_ADMIN_KEY;

    if (event.httpMethod === 'GET') {
      if (!ADMIN || q.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      const type = q.type === 'cards' ? 'cards' : 'nap';
      return json(200, { success: true, type, rows: await buildBoard(gid, type) });
    }
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      if (b.action === 'email') {
        const type = b.type === 'cards' ? 'cards' : 'nap';
        const rows = await buildBoard(gid, type);
        await sendEmail(type === 'cards' ? 'כרטיסים אישיים — גן לב' : 'שנת הצהריים — גן לב', boardText(rows, type));
        return json(200, { success: true });
      }
      return json(400, { success: false, error: 'פעולה לא ידועה' });
    }
    return json(405, { success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('child-boards error:', e);
    return json(500, { success: false, error: e.message });
  }
};
