// ADMIN: draft a weekly/monthly staff work schedule from submitted constraints, via Claude.
// POST /schedule-generate?garden_id=X { round_id }
//
// This is a DRAFT based only on who marked themselves unavailable — it does not know
// classroom/ratio requirements, so a human (Sharon/Yoel) should review before publishing.

const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { supabase, validateGardenScope } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function datesBetween(start, end) {
  const out = [];
  let d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const ScheduleSchema = z.object({
  days: z.array(z.object({
    date: z.string(),
    morning: z.object({ working_staff_ids: z.array(z.string()), warning: z.string().nullable() }),
    afternoon: z.object({ working_staff_ids: z.array(z.string()), warning: z.string().nullable() }),
  })),
  summary: z.string(),
});

const handler = withAuth(async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    const user = event.user;
    const { garden_id } = event.queryStringParameters || {};
    validateGardenScope(user.garden_id, garden_id, user.role);
    const b = JSON.parse(event.body || '{}');
    if (!b.round_id) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'חסר מזהה סבב' }) };

    const { data: round, error: e1 } = await supabase.from('staff_schedule_rounds').select('*').eq('id', b.round_id).eq('garden_id', garden_id).single();
    if (e1 || !round) return { statusCode: 404, body: JSON.stringify({ success: false, error: 'הסבב לא נמצא' }) };

    const { data: staff } = await supabase.from('staff').select('id,full_name_he').eq('garden_id', garden_id).eq('status', 'active');
    const { data: constraints } = await supabase.from('staff_schedule_constraints').select('*').eq('round_id', b.round_id);
    if (!staff || !staff.length) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'אין עובדים פעילים בגן' }) };

    const dates = datesBetween(round.start_date, round.end_date);
    const byStaff = {};
    (constraints || []).forEach(c => { byStaff[c.staff_id] = c; });

    const staffLines = staff.map(s => {
      const c = byStaff[s.id];
      const unavailable = (c && c.unavailable) || [];
      const status = c && c.submitted_at ? 'מילא/ה אילוצים' : 'לא מילא/ה אילוצים (יש להניח זמין/ה לכל התקופה)';
      const unavailStr = unavailable.length
        ? unavailable.map(u => `${u.date} (${u.part === 'morning' ? 'בוקר' : 'צהריים'})`).join(', ')
        : 'אין אילוצים שסומנו';
      return `- ${s.full_name_he} [id: ${s.id}] — ${status}. לא זמין/ה ב: ${unavailStr}${c && c.notes ? '. הערה: ' + c.notes : ''}`;
    }).join('\n');

    const dateLines = dates.map(d => {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      return `${d} (יום ${DAY_NAMES_HE[dow]})`;
    }).join('\n');

    const prompt = `את/ה עוזר/ת שמכין/ה טיוטת סידור עבודה שבועי/חודשי לגן ילדים ("גן לב"), על בסיס האילוצים שהצוות מילא.

התקופה (${round.period_type === 'week' ? 'שבוע' : 'חודש'}):
${dateLines}

רשימת הצוות והאילוצים שלהם:
${staffLines}

הנחיות:
1. כברירת מחדל כל עובד/ת עובד/ת בכל יום, בוקר וצהריים כאחד — חוץ מהתאריכים/החלקים שסומנו במפורש כ"לא זמין/ה" עבורו/ה.
2. אל תשבצי עובד/ת בזמן שבו הוא/היא סימנ/ה שאינו/ה זמין/ה.
3. נסי לאזן את העומס בין העובדים באופן סביר.
4. אם ביום/חצי-יום מסוים נשארים פחות משני עובדים זמינים, ציין/י את זה כאזהרה קצרה בשדה warning של אותו slot (אחרת warning=null).
5. בשדה summary כתבי סיכום קצר וברור (2-4 משפטים) בעברית פשוטה וזורמת, כולל כל דבר שחשוב שמנהלת הגן תבדוק ידנית לפני פרסום הסידור (למשל ימים חסרי כיסוי, עובדים שלא מילאו אילוצים כלל).
6. החזירי בכל slot את מזהי העובדים (id) בדיוק כפי שהופיעו למעלה, לא את השם.

זו טיוטה ראשונית בלבד — מנהלת הגן תבדוק ותתאים אותה ידנית, כולל דרישות תקן/יחס מטפלות-ילדים שלא ידועות לך.`;

    const client = new Anthropic();
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: zodOutputFormat(ScheduleSchema) },
    });

    if (!response.parsed_output) {
      return { statusCode: 502, body: JSON.stringify({ success: false, error: 'לא הצלחנו לפרש את תשובת ה-AI, נסי שוב' }) };
    }

    const generated_schedule = response.parsed_output;
    const { data: updated, error: e2 } = await supabase.from('staff_schedule_rounds')
      .update({ generated_schedule, generated_at: new Date().toISOString(), status: 'generated' })
      .eq('id', b.round_id).select().single();
    if (e2) throw e2;

    return { statusCode: 200, body: JSON.stringify({ success: true, data: updated }) };
  } catch (err) {
    console.error('schedule-generate error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
