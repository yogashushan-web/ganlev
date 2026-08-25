-- שכר לימוד חודשי חריג ברמת הילד.
-- monthly_fee NULL  = שכר לימוד רגיל (ברירת מחדל, רוב הילדים)
-- monthly_fee 0     = פטור מלא — חובה למלא fee_note עם הסיבה
ALTER TABLE children ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(10,2);
ALTER TABLE children ADD COLUMN IF NOT EXISTS fee_note TEXT;

-- אטלס האי — פטור מלא לשנת 2026-27.
-- להריץ אחרי שהילד נוצר במסך "ילדים" (או להחליף את ה-WHERE ב-id שלו).
UPDATE children
   SET monthly_fee = 0,
       fee_note    = 'פטור מלא — נמצא בגן בחינם בשנת 2026-27'
 WHERE first_name_he = 'אטלס'
   AND last_name_he  = 'האי'
   AND school_year   = '2026-27';
