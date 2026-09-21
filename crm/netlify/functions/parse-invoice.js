// Read one or more invoices out of a PDF/image using Claude.
// POST /parse-invoice { file_base64, content_type } -> { success, data: { invoices: [...] } }
//
// Handles all three shapes the gan actually gets from Morning:
//   • a single invoice file
//   • one merged PDF holding many invoices (one per page)
//   • a monthly report listing every document issued, as a table
// Same mechanism as parse-child-contract: the model reads the document itself,
// so the PDF's internal font encoding never matters.

const { withAuth } = require('./lib/auth');
const { PDFDocument } = require('pdf-lib');

// Netlify kills a function at 26s, and a whole multi-page file does not fit:
// a 6-page report took ~31s. So the browser asks for a couple of pages at a
// time and we send the model only those pages.
async function slicePages(b64, from, to) {
  const src = await PDFDocument.load(Buffer.from(b64, 'base64'), { ignoreEncryption: true });
  const total = src.getPageCount();
  const out = await PDFDocument.create();
  const idx = [];
  for (let p = Math.max(1, from); p <= Math.min(total, to); p++) idx.push(p - 1);
  if (!idx.length) return { data: b64, total };
  const copied = await out.copyPages(src, idx);
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return { data: Buffer.from(bytes).toString('base64'), total };
}

const INVOICE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    doc_number:         { type: 'string', description: 'מספר המסמך/חשבונית כפי שמופיע במסמך. ריק אם לא נמצא.' },
    doc_type:           { type: 'string', description: 'סוג המסמך, למשל "חשבונית מס קבלה" או "קבלה". ריק אם לא נמצא.' },
    client_name:        { type: 'string', description: 'שם הלקוח שעל שמו הופק המסמך (ההורה המשלם). ריק אם לא נמצא.' },
    client_national_id: { type: 'string', description: 'תעודת זהות או ח"פ של הלקוח, ספרות בלבד. ריק אם לא נמצא.' },
    amount:             { type: 'string', description: 'הסכום הכולל לתשלום כולל מע"מ. ספרות בלבד, בלי ₪ ובלי פסיקים. ריק אם לא נמצא.' },
    date:               { type: 'string', description: 'תאריך הפקת המסמך בפורמט YYYY-MM-DD. ריק אם לא נמצא.' },
    child_name:         { type: 'string', description: 'שם הילד/ה אם מופיע בתיאור השורה או בהערות. ריק אם לא מופיע.' },
  },
  required: ['doc_number', 'doc_type', 'client_name', 'client_national_id', 'amount', 'date', 'child_name'],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { invoices: { type: 'array', items: INVOICE } },
  required: ['invoices'],
};

const PROMPT = `הקובץ הוא מסמך חשבונאי של גן ילדים פרטי, שהופק בתוכנת "מורנינג" (חשבונית ירוקה).
הוא יכול להיות אחד משלושה סוגים:
1. חשבונית בודדת.
2. קובץ מאוחד שמכיל כמה חשבוניות, בדרך כלל אחת בכל עמוד.
3. דוח חודשי שמפרט בטבלה את כל המסמכים שהופקו בחודש.

החזר **כל מסמך שמצאת** כפריט נפרד במערך invoices.

כללים:
- אל תחזיר שורות סיכום, שורות "סה״כ", כותרות טבלה או מספרי עמוד — רק מסמכים אמיתיים.
- amount הוא הסכום הכולל לתשלום כולל מע"מ, ספרות בלבד. אם מופיעים גם סכום לפני מע"מ וגם כולל מע"מ — קח את הכולל.
- client_name הוא שם הלקוח שעל שמו הופקה החשבונית, לא שם הגן ולא שם העסק המפיק.
- אם מופיעים שני שמות לקוח על אותה חשבונית (חשבון משותף), החזר את שניהם בשדה אחד מופרדים ב"ו".
- תעודת זהות: ספרות בלבד. תאריך: YYYY-MM-DD.
- לכל שדה שלא קיים במסמך — החזר מחרוזת ריקה.`;

const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר ANTHROPIC_API_KEY בהגדרות השרת' }) };
  }
  try {
    const { file_base64, content_type, probe, page_from, page_to } = JSON.parse(event.body || '{}');
    if (!file_base64) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא צורף קובץ' }) };
    }
    let data = file_base64.includes(',') ? file_base64.split(',').pop() : file_base64;
    const ct = content_type || 'application/pdf';
    const isPdf = ct === 'application/pdf';

    // שלב א׳: כמה עמודים יש בקובץ. מהיר, בלי קריאה למודל.
    if (probe) {
      if (!isPdf) return { statusCode: 200, body: JSON.stringify({ success: true, data: { pages: 1 } }) };
      const doc = await PDFDocument.load(Buffer.from(data, 'base64'), { ignoreEncryption: true });
      return { statusCode: 200, body: JSON.stringify({ success: true, data: { pages: doc.getPageCount() } }) };
    }

    // שלב ב׳: קריאה של טווח עמודים בלבד.
    if (isPdf && page_from) {
      const cut = await slicePages(data, Number(page_from), Number(page_to || page_from));
      data = cut.data;
    }
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
        // קריאת טבלה מובנית לא דורשת את המודל הכבד. Netlify קוטע פונקציה
        // אחרי 26 שניות, ודוח חודשי של 6 עמודים חרג מזה עם אופוס.
        model: 'claude-sonnet-5',
        max_tokens: 3000,
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
    let parsed = { invoices: [] };
    try { parsed = JSON.parse(textBlock ? textBlock.text : '{}'); } catch (e) { parsed = { invoices: [] }; }
    if (!Array.isArray(parsed.invoices)) parsed.invoices = [];

    return { statusCode: 200, body: JSON.stringify({ success: true, data: parsed }) };
  } catch (err) {
    console.error('parse-invoice error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
