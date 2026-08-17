// Hands the logged-in manager the shared owner-board key (so management pages can
// show the "full board" buttons). Authenticated — only staff get it.
const { withAuth } = require('./lib/auth');

exports.handler = withAuth(async () => {
  return { statusCode: 200, body: JSON.stringify({ success: true, admin_key: process.env.VISIT_ADMIN_KEY || '' }) };
});
