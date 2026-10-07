#!/usr/bin/env node
// קביעת סיסמה חדשה למשתמש באתר.
//
//   node crm/set-password.js joelkarmeli@gmail.com
//
// הסקריפט מבקש סיסמה (ההקלדה לא מוצגת), מייצר ממנה את אותו גיבוב
// שהכניסה לאתר מצפה לו, ומדפיס שורת SQL אחת להרצה ב-Supabase.
//
// **הסיסמה לא נשלחת לשום מקום ולא נשמרת בשום קובץ.** היא קיימת רק
// בזיכרון של הריצה הזו. מה שמודפס הוא הגיבוב בלבד — ממנו אי אפשר
// לחזור לסיסמה, וזו בדיוק הסיבה שאי אפשר לשלוף סיסמה קיימת מהמערכת.

const crypto = require('crypto');
const readline = require('readline');

// זהה לחלוטין ל-hashPassword ב-netlify/functions/lib/auth.js.
// אם משנים שם — צריך לשנות גם כאן, אחרת הסיסמה שתיקבע לא תתאים.
const hash = pw => crypto
  .pbkdf2Sync(pw, 'crm-salt-key', 1000, 64, 'sha512')
  .toString('hex');

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('\nשימוש:  node crm/set-password.js <אימייל>\n');
  process.exit(1);
}

// קריאה בלי הד למסך, כדי שהסיסמה לא תישאר על הטרמינל.
//
// כשהקלט אינו טרמינל (צינור, בדיקה אוטומטית) אין מה להסתיר, אבל אי
// אפשר גם לפתוח שני readline זה אחר זה — הראשון סוגר את הזרם והשני
// מקבל שורה ריקה. לכן קוראים את כל הקלט פעם אחת ומחלקים לשורות.
let piped = null, pipedAt = 0;
const readAll = () => new Promise(resolve => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { buf += c; });
  process.stdin.on('end', () => resolve(buf.split(/\r?\n/)));
});

async function ask(prompt) {
  if (!process.stdin.isTTY) {
    if (!piped) piped = await readAll();
    return piped[pipedAt++] || '';
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let first = true;
    rl._writeToOutput = str => {
      if (first) { process.stdout.write(prompt); first = false; }
      else if (str.indexOf('\n') >= 0) process.stdout.write('\n');
    };
    rl.question(prompt, answer => { rl.close(); resolve(answer); });
  });
}

(async () => {
  const pw = await ask('סיסמה חדשה: ');
  if (pw.length < 8) {
    console.error('\nהסיסמה קצרה מדי — לפחות שמונה תווים.\n');
    process.exit(1);
  }
  const again = await ask('שוב, לאימות: ');
  if (pw !== again) {
    console.error('\nשתי ההקלדות לא זהות. לא נוצר כלום.\n');
    process.exit(1);
  }

  console.log('\n— להריץ ב-Supabase, בלשונית SQL Editor —\n');
  console.log(`UPDATE users
   SET password_hash = '${hash(pw)}',
       updated_at    = now()
 WHERE email = '${email}';`);
  console.log('\nאחרי ההרצה אפשר להיכנס לאתר עם הסיסמה שהקלדת.');
  console.log('הסיסמה עצמה לא נשמרה בשום מקום — רק הגיבוב למעלה.\n');
})();
