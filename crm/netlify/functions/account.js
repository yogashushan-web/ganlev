// סיסמת כניסה ושאלת ביטחון.
//
// מאומת:   POST { action:'password', current, next }
//          POST { action:'question', question, answer, current }
//          GET                                   -> { hasQuestion, question }
// ציבורי:  POST { action:'ask',   email }        -> { question }
//          POST { action:'reset', email, answer, next }
//
// **הסיסמה לא נשמרת בשום מקום בצורה קריאה, וגם לא התשובה לשאלה.**
// תשובה לשאלת ביטחון היא סיסמה שנייה לכל דבר: מי שיודע אותה נכנס.
// לכן היא עוברת את אותו גיבוב בדיוק ולא נשמרת כטקסט.
//
// השאלה והתשובה יושבות ב-events (אין הרשאה ליצור טבלאות):
//   calendar='user-sec' · category=<user id>

const { supabase } = require('./lib/db');
const { withAuth, hashPassword, verifyPassword } = require('./lib/auth');

const CAL = 'user-sec';
const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(b) });
const parse = n => { try { return JSON.parse(n || '{}'); } catch (_) { return {}; } };
const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// תשובה מנורמלת: רווחים וגודל אותיות לא אמורים להכשיל מישהו שזוכר
// נכון. "תל אביב" ו-"תל  אביב " הן אותה תשובה.
const normAnswer = a => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase();

const WEAK = /^(?:1234|12345|123456|1234567|12345678|123456789|password|qwerty|אאאאאא)$/i;
function badPassword(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'הסיסמה צריכה להיות באורך שמונה תווים לפחות';
  if (WEAK.test(s)) return 'הסיסמה הזו נפוצה מדי — אפשר לבחור משהו אחר';
  return null;
}

async function secRow(userId) {
  const { data } = await supabase.from('events').select('id,notes,title')
    .eq('calendar', CAL).eq('category', String(userId)).limit(1);
  return (data && data.length) ? data[0] : null;
}

async function saveSec(gardenId, userId, payload) {
  const row = await secRow(userId);
  const notes = JSON.stringify(payload);
  if (row) {
    const { error } = await supabase.from('events')
      .update({ notes, event_date: today() }).eq('id', row.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('events').insert({
      garden_id: gardenId, calendar: CAL, category: String(userId),
      title: 'שאלת ביטחון', event_date: today(), notes,
    });
    if (error) throw error;
  }
}

async function setPassword(userId, next) {
  const { error } = await supabase.from('users')
    .update({ password_hash: hashPassword(next), updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// ---------- החלק הציבורי: שכחתי סיסמה ----------
// חמישה ניסיונות, ואז נעילה לשעה. בלי זה שאלת ביטחון היא הזמנה לנחש
// "איפה נולדת" עד שמצליחים.
const MAX_TRIES = 5, LOCK_MIN = 60;

async function publicHandler(event) {
  const b = JSON.parse(event.body || '{}');
  const email = String(b.email || '').trim().toLowerCase();
  if (!email) return json(400, { success: false, error: 'חסר אימייל' });

  const { data: users } = await supabase.from('users')
    .select('id,garden_id,email').eq('email', email).limit(1);
  const user = users && users[0];

  if (b.action === 'ask') {
    // אם אין משתמש או אין שאלה — אותה תשובה בדיוק, כדי שהמסך הזה לא
    // יהפוך לכלי שבודק אילו כתובות רשומות במערכת.
    if (!user) return json(200, { success: true, question: null });
    const row = await secRow(user.id);
    const sec = row ? parse(row.notes) : null;
    return json(200, { success: true, question: (sec && sec.q) || null });
  }

  if (b.action === 'reset') {
    const generic = { success: false, error: 'התשובה אינה נכונה' };
    if (!user) return json(401, generic);
    const row = await secRow(user.id);
    const sec = row ? parse(row.notes) : null;
    if (!sec || !sec.aHash) return json(401, generic);

    const now = Date.now();
    if (sec.lockedUntil && now < sec.lockedUntil) {
      const mins = Math.ceil((sec.lockedUntil - now) / 60000);
      return json(429, { success: false,
        error: `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${mins} דקות` });
    }

    if (!verifyPassword(normAnswer(b.answer), sec.aHash)) {
      sec.tries = (sec.tries || 0) + 1;
      if (sec.tries >= MAX_TRIES) {
        sec.lockedUntil = now + LOCK_MIN * 60000;
        sec.tries = 0;
      }
      await saveSec(user.garden_id, user.id, sec);
      return json(401, generic);
    }

    const bad = badPassword(b.next);
    if (bad) return json(400, { success: false, error: bad });

    await setPassword(user.id, b.next);
    sec.tries = 0; delete sec.lockedUntil;
    sec.resetAt = new Date().toISOString();
    await saveSec(user.garden_id, user.id, sec);
    return json(200, { success: true });
  }

  return json(400, { success: false, error: 'פעולה לא מוכרת' });
}

// ---------- החלק המאומת ----------
const authed = withAuth(async (event) => {
  const user = event.user;
  const userId = user.sub || user.id;

  if (event.httpMethod === 'GET') {
    const row = await secRow(userId);
    const sec = row ? parse(row.notes) : null;
    // השאלה חוזרת, התשובה לעולם לא
    return json(200, { success: true, hasQuestion: !!(sec && sec.aHash),
                       question: (sec && sec.q) || '' });
  }

  const b = JSON.parse(event.body || '{}');

  // אימות הסיסמה הנוכחית לפני כל שינוי. בלי זה, מסך פתוח בטלפון
  // שנשאר ללא השגחה הוא השתלטות על החשבון.
  const { data: rows } = await supabase.from('users')
    .select('id,password_hash,garden_id').eq('id', userId).limit(1);
  const me = rows && rows[0];
  if (!me) return json(404, { success: false, error: 'המשתמש לא נמצא' });
  if (!verifyPassword(String(b.current || ''), me.password_hash)) {
    return json(401, { success: false, error: 'הסיסמה הנוכחית אינה נכונה' });
  }

  if (b.action === 'password') {
    const bad = badPassword(b.next);
    if (bad) return json(400, { success: false, error: bad });
    if (verifyPassword(String(b.next), me.password_hash)) {
      return json(400, { success: false, error: 'זו אותה סיסמה. צריך סיסמה חדשה' });
    }
    await setPassword(userId, b.next);
    return json(200, { success: true });
  }

  if (b.action === 'question') {
    const q = String(b.question || '').trim();
    const a = normAnswer(b.answer);
    if (q.length < 5) return json(400, { success: false, error: 'השאלה קצרה מדי' });
    if (a.length < 2) return json(400, { success: false, error: 'התשובה קצרה מדי' });
    const row = await secRow(userId);
    const prev = row ? parse(row.notes) : {};
    await saveSec(me.garden_id, userId, {
      q, aHash: hashPassword(a), setAt: new Date().toISOString(),
      tries: 0, resetAt: prev.resetAt || null,
    });
    return json(200, { success: true });
  }

  if (b.action === 'clear') {
    const row = await secRow(userId);
    if (row) await supabase.from('events').delete().eq('id', row.id);
    return json(200, { success: true });
  }

  return json(400, { success: false, error: 'פעולה לא מוכרת' });
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      // שתי הפעולות האלה רצות ממסך הכניסה, כלומר בלי טוקן
      if (b.action === 'ask' || b.action === 'reset') return await publicHandler(event);
    }
    return await authed(event);
  } catch (err) {
    console.error('account error:', err);
    return json(500, { success: false, error: err.message });
  }
};
