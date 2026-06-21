# CRM System for Kindergarten Management (מערכת ניהול גנים)

A multi-tenant CRM system for managing 2 kindergartens with features for finances, staff, children, and parents.

## Setup Instructions

### 1. Supabase Setup

1. Go to [Supabase Console](https://app.supabase.com)
2. Create a new project (or use existing)
3. Run the schema SQL:
   - Navigate to SQL Editor in Supabase console
   - Copy entire contents of `supabase-schema.sql` 
   - Paste and execute

4. Get your credentials:
   - Go to Settings → API
   - Copy: `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### 2. Create Gardens in Database

Run in Supabase SQL Editor:

```sql
INSERT INTO gardens (name, city, email, phone) VALUES
  ('גן א׳ - מרכז', 'תל אביב', 'garden1@example.com', '03-1234567'),
  ('גן ב׳ - צפון', 'תל אביב', 'garden2@example.com', '03-7654321');

-- Get the garden IDs (you'll need these)
SELECT id, name FROM gardens;
```

Save the UUIDs. You'll use them for the login form.

### 3. Create Test Users

Replace `GARDEN_ID_1` and `GARDEN_ID_2` with your actual UUIDs:

```sql
INSERT INTO users (garden_id, email, password_hash, role, full_name_he, status) VALUES
  ('GARDEN_ID_1', 'admin1@example.com', 'hash_placeholder', 'admin', 'מנהל גן א׳', 'active'),
  ('GARDEN_ID_2', 'admin2@example.com', 'hash_placeholder', 'admin', 'מנהל גן ב׳', 'active');
```

**Note:** The password_hash needs to be computed. For now, use the login function to create users properly.

### 4. Environment Variables

Create `.env` file in project root:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...your-key...
```

Netlify: Add same variables in Settings → Build & deploy → Environment

### 5. Update Login Form

Edit `crm/html/login.html`:

```javascript
const gardens = {
  'garden-1': 'your-garden-1-uuid',
  'garden-2': 'your-garden-2-uuid',
};
```

Replace the UUIDs from step 2.

### 6. Deploy to Netlify

```bash
git add crm/
git commit -m "Add CRM system"
git push origin main
```

Netlify auto-deploys. Check:
- https://yourdomain.netlify.app/crm/html/login.html

---

## File Structure

```
crm/
├── html/
│   ├── login.html                 # Login page
│   ├── dashboard.html             # Main hub
│   ├── children-manage.html       # Manage children
│   ├── parents-tuition.html       # Parents & tuition billing
│   ├── staff-salaries.html        # Staff & payroll
│   ├── income-expenses.html       # Financial tracking
│   ├── settings.html              # (TODO) User settings
│   └── js/
│       ├── api.js                 # API wrapper
│       ├── common.js              # Utilities
├── netlify/functions/
│   ├── lib/
│   │   ├── auth.js                # Auth utilities
│   │   ├── db.js                  # Supabase helpers
│   ├── auth-login.js              # Login endpoint
│   ├── children.js                # Children CRUD
│   ├── parents.js                 # Parents CRUD
│   ├── staff.js                   # Staff CRUD
│   ├── salaries.js                # Salary management
│   ├── tuition.js                 # Tuition CRUD
│   ├── income.js                  # Income tracking
│   ├── expenses.js                # Expense tracking
│   ├── dashboard-summary.js       # Dashboard aggregates
├── supabase-schema.sql            # Database schema
└── README.md                      # This file
```

---

## API Endpoints

All require `Authorization: Bearer <token>` header.

### Authentication
- `POST /.netlify/functions/auth-login` → { email, password, gardenId } → token

### Children
- `GET /.netlify/functions/children?garden_id=X`
- `POST /.netlify/functions/children` 
- `PUT /.netlify/functions/children/:id`
- `DELETE /.netlify/functions/children/:id`

### Staff
- `GET /.netlify/functions/staff?garden_id=X`
- `POST /.netlify/functions/staff`
- `PUT /.netlify/functions/staff/:id`
- `DELETE /.netlify/functions/staff/:id`

### Tuition
- `GET /.netlify/functions/tuition?garden_id=X&status=pending`
- `POST /.netlify/functions/tuition`
- `PUT /.netlify/functions/tuition/:id`

### Salaries
- `GET /.netlify/functions/salaries?garden_id=X&month_year=2026-06`
- `POST /.netlify/functions/salaries`
- `PUT /.netlify/functions/salaries/:id`

### Income/Expenses
- `GET /.netlify/functions/income?garden_id=X&date_from=2026-01-01&date_to=2026-06-30`
- `POST /.netlify/functions/income`
- `GET /.netlify/functions/expenses?garden_id=X&date_from=...&date_to=...`
- `POST /.netlify/functions/expenses`
- `PUT /.netlify/functions/expenses/:id`

### Dashboard
- `GET /.netlify/functions/dashboard-summary?garden_id=X`

---

## Features

### ✅ Implemented (v1)
- Multi-tenant architecture (2 gardens, separate users)
- Hebrew RTL support
- Children management (add/edit/delete)
- Parents & tuition tracking
- Staff directory & payroll
- Income/Expense tracking
- Dashboard with summaries
- Audit logging
- Garden-scoped data isolation

### 📋 Future Enhancements
- Settings page (user profile, garden config)
- Advanced reporting (charts, exports)
- SMS/Email notifications
- Attendance tracking
- Parent portal login
- Mobile app
- Document storage
- Integration with external payment systems

---

## Security Notes

1. **Garden Scoping**: Every query validates `user.garden_id === request.garden_id`
2. **Password Storage**: Uses PBKDF2 (MVP). Upgrade to bcrypt for production.
3. **Token Expiry**: 7-day JWT tokens. Implement refresh logic for long sessions.
4. **RLS Policies**: Database row-level security disabled for MVP. Enable in production.
5. **Audit Trail**: All changes logged to `audit_log` table for compliance.

---

## Troubleshooting

### 401 Unauthorized
- Check token in localStorage (`crm_token`)
- Token may have expired (7 days) → login again
- Garden ID mismatch → verify login form has correct UUIDs

### Data not loading
- Check Supabase connection (look at Function logs in Netlify)
- Verify environment variables set in Netlify
- Ensure garden_id parameter is passed in API calls

### RTL alignment issues
- Clear browser cache (Ctrl+Shift+Delete)
- Check that `direction:rtl` is set on body
- Hebrew fonts may need fallback (already using Heebo)

---

## Testing

1. **Login**: Use credentials from Step 3
2. **Add Data**: Start with children, then parents, then tuition
3. **Verify Dashboard**: Check stats update in real-time
4. **Test Multi-tenant**: Switch between gardens by logging out/in

---

## Support

For issues or questions, check:
- Browser console (F12) for JS errors
- Netlify Function logs for backend errors
- Supabase SQL Editor for data validation

---

Created: 2026-06-20  
Tech: Supabase, Netlify Functions, Vanilla JS, Hebrew RTL
