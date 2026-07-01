// Parse an Israeli Form 101 (כרטיס עובד) PDF into structured employee fields using Claude.
// POST /parse-101  { file_base64 }   (base64 of the PDF; a "data:...;base64," prefix is tolerated)
// Returns { success, profile: { full_name_he, national_id, birth_date, phone, email, address } }
// Requires the ANTHROPIC_API_KEY env var (set in Netlify → Site settings → Environment variables).

const { withAuth } = require('./lib/auth');

// Structured-output schema: all fields are strings (empty string when not found),
// all listed in `required`, additionalProperties:false — the shape Opus 4.8 enforces.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    full_name_he: { type: 'string', description: 'שם מלא של העובד בעברית (פרטי + משפחה). מחרוזת ריקה אם לא נמצא.' },
    national_id:  { type: 'string', description: 'מספר תעודת זהות של העובד, 9 ספרות. מחרוזת ריקה אם לא נמצא.' },
    birth_date:   { type: 'string', description: 'תאריך לידה של העובד בפורמט YYYY-MM-DD. מחרוזת ריקה אם לא נמצא.' },
    phone:        { type: 'string', description: 'טלפון נייד של העובד, מתחיל ב-05. מחרוזת ריקה אם לא נמצא.' },
    email:        { type: 'string', description: 'כתובת אימייל של העובד. מחרוזת ריקה אם לא נמצא.' },
    address:      { type: 'string', description: 'כתובת מגורים של העובד (רחוב + עיר). מחרוזת ריקה אם לא נמצא.' },
  },
  required: ['full_name_he', 'national_id', 'birth_date', 'phone', 'email', 'address'],
};

const PROMPT = `זהו טופס 101 (כרטיס עובד) ישראלי. חלץ את הפרטים של ה*עובד/ת* בלבד — לא של המעסיק או מקום העבודה.
שים לב: בטפסים דיגיטליים הספרות מופיעות לעיתים בסדר הפוך (RTL). יישר תאריך לידה ותעודת זהות לסדר הנכון.
- תאריך לידה: החזר בפורמט YYYY-MM-DD.
- תעודת זהות: 9 ספרות (הספרה האחרונה היא ספרת ביקורת).
- טלפון: הנייד של העובד (מתחיל ב-05), לא טלפון המעסיק.
- אל תבלבל בין שם / כתובת / טלפון של העובד לבין אלו של המעסיק.
אם שדה כלשהו לא קיים בטופס, החזר מחרוזת ריקה עבורו.`;

const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר ANTHROPIC_API_KEY בהגדרות השרת' }) };
  }

  try {
    const { file_base64 } = JSON.parse(event.body || '{}');
    if (!file_base64) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא צורף קובץ' }) };
    }
    // tolerate a "data:application/pdf;base64,XXXX" prefix
    const data = file_base64.includes(',') ? file_base64.split(',').pop() : file_base64;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });

    const out = await res.json();
    if (!res.ok) {
      console.error('anthropic error', JSON.stringify(out));
      return { statusCode: 502, body: JSON.stringify({ success: false, error: (out.error && out.error.message) || 'שגיאת AI' }) };
    }
    if (out.stop_reason === 'refusal') {
      return { statusCode: 422, body: JSON.stringify({ success: false, error: 'הבקשה נדחתה על ידי ה-AI' }) };
    }

    const textBlock = (out.content || []).find((b) => b.type === 'text');
    let profile = {};
    try { profile = JSON.parse(textBlock ? textBlock.text : '{}'); } catch (e) { profile = {}; }

    return { statusCode: 200, body: JSON.stringify({ success: true, profile }) };
  } catch (err) {
    console.error('parse-101 error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
