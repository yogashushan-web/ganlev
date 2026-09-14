// Owner-only consolidated boards, gated by the shared admin key (VISIT_ADMIN_KEY).
// GET  ?garden_id=&type=nap|cards|ids&admin=<key>  -> children (oldest->youngest) + their data
// POST { action:'email', type, garden_id, admin }  -> email the board text to the owner
// POST { action:'send_link', type }                -> email the owner a direct link to the board.
//   Needs no key: the link only ever goes to the owner's own inbox.
// (Staff reach the nap/cards boards with a Google sign-in — see staff-boards.js.)

const { GARDEN_DEFAULT, buildBoard, boardText } = require('./lib/boards');
const { buildIdsBoard, idsText } = require('./lib/parent-id');

const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

const TITLES = { nap: 'שנת הצהריים — גן לב', cards: 'כרטיסים אישיים — גן לב', ids: 'תעודות זהות של ההורים — גן לב' };
const PAGES = { nap: 'nap-board.html', cards: 'cards-board.html', ids: 'ids-board.html' };
const typeOf = t => (t === 'cards' || t === 'ids') ? t : 'nap';

async function sendEmail(subject, text) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.PERSONAL_CAL_EMAIL || 'joelkarmeli@gmail.com';
  if (!user || !pass) throw new Error('שליחת מייל לא מוגדרת במערכת');
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({ from: 'גן לב <' + user + '>', to, subject, text });
}

async function rowsFor(gid, type) {
  return type === 'ids' ? buildIdsBoard(gid) : buildBoard(gid, type);
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const gid = q.garden_id || GARDEN_DEFAULT;
    const ADMIN = process.env.VISIT_ADMIN_KEY;

    if (event.httpMethod === 'GET') {
      if (!ADMIN || q.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      const type = typeOf(q.type);
      return json(200, { success: true, type, rows: await rowsFor(gid, type) });
    }
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const type = typeOf(b.type);

      if (b.action === 'send_link') {
        if (!ADMIN) return json(503, { success: false, error: 'חסר קוד גישה במערכת' });
        const link = 'https://ganlev.netlify.app/crm/html/' + PAGES[type] + '?admin=' + encodeURIComponent(ADMIN);
        await sendEmail('🔐 קישור אישי: ' + TITLES[type],
          'שלום יואל,\n\nזה הקישור האישי שלך ללוח "' + TITLES[type] + '":\n' + link +
          '\n\nהקישור פותח את הלוח בלי התחברות — לא להעביר אותו לאחרים.\n');
        return json(200, { success: true });
      }

      if (!ADMIN || b.admin !== ADMIN) return json(403, { success: false, error: 'אין הרשאה' });
      if (b.action === 'email') {
        const rows = await rowsFor(gid, type);
        await sendEmail(TITLES[type], type === 'ids' ? idsText(rows) : boardText(rows, type));
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
