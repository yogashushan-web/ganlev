// Parse a signed kindergarten enrollment contract (חוזה גן חתום) into a child +
// parents, using Claude. POST /parse-child-contract { file_base64, content_type }
// (base64 of a PDF or image; a "data:...;base64," prefix is tolerated)
// Returns { success, data: { <child fields>, parents: [...] } }
// Requires the ANTHROPIC_API_KEY env var (same one parse-101 uses).

const { withAuth } = require('./lib/auth');

const PARENT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    full_name_he:      { type: 'string', description: 'שם מלא של ההורה בעברית. ריק אם לא נמצא.' },
    relationship_type: { type: 'string', enum: ['mother', 'father', 'guardian', ''], description: "קרבה: 'mother' לאם, 'father' לאב, 'guardian' לאפוטרופוס. הסק לפי שם/הקשר. ריק אם לא ידוע." },
    national_id:       { type: 'string', description: 'תעודת זהות של ההורה, 9 ספרות. ריק אם לא נמצא.' },
    phone:             { type: 'string', description: 'טלפון נייד של ההורה (מתחיל ב-05). ריק אם לא נמצא.' },
    email:             { type: 'string', description: 'אימייל של ההורה. ריק אם לא נמצא.' },
    address:           { type: 'string', description: 'כתובת מגורים (רחוב + עיר). ריק אם לא נמצא.' },
  },
  required: ['full_name_he', 'relationship_type', 'national_id', 'phone', 'email', 'address'],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    first_name_he: { type: 'string', description: 'שם פרטי של הילד/ה בעברית. ריק אם לא נמצא.' },
    last_name_he:  { type: 'string', description: 'שם משפחה של הילד/ה בעברית. ריק אם לא נמצא.' },
    name_en:       { type: 'string', description: 'השם המלא של הילד/ה באנגלית. אם לא מופיע בחוזה — תעתק את השם העברי לאנגלית (למשל "עמליה ערמוני" → "Amalia Ermoni").' },
    gender_he:     { type: 'string', enum: ['זכר', 'נקבה', ''], description: 'מין הילד/ה. אם לא מצוין במפורש, הסק מהשם הפרטי. ריק רק אם באמת לא ניתן להסיק.' },
    national_id:   { type: 'string', description: 'תעודת זהות של ה*ילד/ה* (לא של ההורה!), 9 ספרות. ריק אם לא נמצא.' },
    birth_date:    { type: 'string', description: 'תאריך לידה של הילד/ה בפורמט YYYY-MM-DD. ריק אם לא נמצא.' },
    school_year:   { type: 'string', description: "שנת הלימוד בפורמט 'YYYY-YY' (למשל '2025-26'). הסק מתקופת ההתקשרות בחוזה (למשל 1/9/2025 עד 31/8/2026 → '2025-26'). ריק אם לא נמצא." },
    parents:       { type: 'array', items: PARENT, description: 'ההורים/החותמים על החוזה (בדרך כלל עד 2).' },
  },
  required: ['first_name_he', 'last_name_he', 'name_en', 'gender_he', 'national_id', 'birth_date', 'school_year', 'parents'],
};

const PROMPT = `זהו חוזה הרשמה חתום של ילד/ה לגן ילדים ("חוזה גן"). חלץ את פרטי הילד/ה ואת פרטי ההורים/החותמים.
כללים:
- אל תבלבל בין פרטי ה*ילד/ה* לבין פרטי ה*הורה*. תעודת זהות/טלפון/כתובת שמופיעים ליד חתימת ההורה שייכים להורה.
- בטפסים סרוקים הספרות עלולות להופיע בסדר הפוך (RTL) — יישר תעודות זהות ותאריכים לסדר הנכון.
- תאריך לידה: פורמט YYYY-MM-DD. תעודת זהות: 9 ספרות.
- name_en: אם אין שם באנגלית בחוזה, תעתק את שם הילד/ה לאנגלית.
- gender_he: הסק מהשם הפרטי אם לא מצוין.
- school_year: הסק מתקופת השכירות/ההתקשרות בחוזה.
- parents: כל הורה/חותם בנפרד, עם קרבה (mother/father/guardian).
- לכל שדה שלא קיים בחוזה — החזר מחרוזת ריקה (ומערך ריק אם אין הורים).`;

const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר ANTHROPIC_API_KEY בהגדרות השרת' }) };
  }
  try {
    const { file_base64, content_type } = JSON.parse(event.body || '{}');
    if (!file_base64) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא צורף קובץ' }) };
    }
    const data = file_base64.includes(',') ? file_base64.split(',').pop() : file_base64;
    const ct = content_type || 'application/pdf';

    // PDF -> document block; image -> image block.
    const fileBlock = ct === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: ct, data } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
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
    let parsed = {};
    try { parsed = JSON.parse(textBlock ? textBlock.text : '{}'); } catch (e) { parsed = {}; }

    return { statusCode: 200, body: JSON.stringify({ success: true, data: parsed }) };
  } catch (err) {
    console.error('parse-child-contract error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
