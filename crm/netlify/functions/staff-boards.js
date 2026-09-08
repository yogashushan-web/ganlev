// Staff access to the consolidated child boards, via Google sign-in.
// The allow-list is not hardcoded: it IS the active staff list. Move an employee
// to "לא פעילים" in the staff screen and their access disappears on the next load.
//
// GET                          -> { client_id }  (public by design; the browser needs it to render the button)
// POST { id_token, garden_id } -> { viewer, nap: rows, cards: rows }

const { supabase } = require('./lib/db');
const { GARDEN_DEFAULT, buildBoard } = require('./lib/boards');

const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const norm = e => (e || '').trim().toLowerCase();

// Verify the Google ID token and return its verified email, or null.
async function verifyGoogleToken(idToken, clientId) {
  if (!idToken || !clientId) return null;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!r.ok) return null;
  const info = await r.json();
  if (info.aud !== clientId) return null;                          // token minted for a different app
  if (String(info.email_verified) !== 'true') return null;          // unverified Google address
  if (Number(info.exp) * 1000 < Date.now()) return null;            // expired
  return { email: norm(info.email), name: info.name || '' };
}

exports.handler = async (event) => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  try {
    if (event.httpMethod === 'GET') {
      return json(200, { success: true, client_id: CLIENT_ID, configured: !!CLIENT_ID });
    }
    if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

    if (!CLIENT_ID) return json(503, { success: false, error: 'התחברות Google עדיין לא הוגדרה במערכת' });

    const b = JSON.parse(event.body || '{}');
    const gid = b.garden_id || GARDEN_DEFAULT;

    const who = await verifyGoogleToken(b.id_token, CLIENT_ID);
    if (!who) return json(401, { success: false, error: 'ההתחברות נכשלה — נסו שוב' });

    // The owner always gets in, even if his staff record has no email on it.
    const owner = norm(process.env.PERSONAL_CAL_EMAIL);
    let viewerName = who.name;

    if (who.email !== owner) {
      const { data, error } = await supabase.from('staff')
        .select('full_name_he,email').eq('garden_id', gid).eq('status', 'active');
      if (error) throw error;
      const match = (data || []).find(s => norm(s.email) && norm(s.email) === who.email);
      if (!match) {
        return json(403, { success: false, error: 'הכתובת ' + who.email + ' אינה רשומה כעובד/ת פעיל/ה בגן' });
      }
      viewerName = match.full_name_he || who.name;
    }

    const [nap, cards] = await Promise.all([buildBoard(gid, 'nap'), buildBoard(gid, 'cards')]);
    return json(200, { success: true, viewer: { name: viewerName, email: who.email }, nap, cards });
  } catch (e) {
    console.error('staff-boards error:', e);
    return json(500, { success: false, error: e.message });
  }
};
