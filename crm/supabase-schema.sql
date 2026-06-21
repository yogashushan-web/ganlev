-- CRM System for Kindergarten Management (גנים)
-- Multi-tenant schema with garden_id scoping

-- 1. Gardens table (organization level)
CREATE TABLE IF NOT EXISTS gardens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. Users table (multi-tenant)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  full_name_he TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT unique_email_per_garden UNIQUE (garden_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_garden_email ON users(garden_id, email);
CREATE INDEX IF NOT EXISTS idx_users_garden_role ON users(garden_id, role);

-- 3. Children table
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  first_name_he TEXT NOT NULL,
  last_name_he TEXT NOT NULL,
  birth_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'waitlist', 'archived')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_children_garden_status ON children(garden_id, status);

-- 4. Parents table
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  full_name_he TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relationship_type TEXT CHECK (relationship_type IN ('mother', 'father', 'guardian')),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parents_garden_child ON parents(garden_id, child_id);
CREATE INDEX IF NOT EXISTS idx_parents_garden_email ON parents(garden_id, email);

-- 5. Staff table
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  full_name_he TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position_he TEXT CHECK (position_he IN ('teacher', 'assistant', 'manager')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  hire_date DATE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT unique_email_per_garden_staff UNIQUE (garden_id, email)
);
CREATE INDEX IF NOT EXISTS idx_staff_garden_status ON staff(garden_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_garden_email ON staff(garden_id, email);

-- 6. Salaries table (payroll)
CREATE TABLE IF NOT EXISTS salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: YYYY-MM
  gross_salary DECIMAL(10, 2) NOT NULL,
  deductions DECIMAL(10, 2) DEFAULT 0,
  net_salary DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes_he TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salaries_garden_staff_month ON salaries(garden_id, staff_id, month_year);
CREATE INDEX IF NOT EXISTS idx_salaries_garden_status ON salaries(garden_id, status);

-- 7. Tuition table (per-child billing)
CREATE TABLE IF NOT EXISTS tuition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'waived')),
  notes_he TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tuition_garden_child ON tuition(garden_id, child_id);
CREATE INDEX IF NOT EXISTS idx_tuition_garden_status ON tuition(garden_id, status);
CREATE INDEX IF NOT EXISTS idx_tuition_garden_parent ON tuition(garden_id, parent_id);

-- 8. Income table (revenue tracking)
CREATE TABLE IF NOT EXISTS income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  source_he TEXT NOT NULL, -- tuition, grant, donation, other
  amount DECIMAL(10, 2) NOT NULL,
  receipt_date DATE NOT NULL,
  category_he TEXT,
  notes_he TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_income_garden_date ON income(garden_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_income_garden_category ON income(garden_id, category_he);

-- 9. Expenses table (costs)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  description_he TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  category_he TEXT NOT NULL, -- supplies, utilities, maintenance, staff, other
  payment_method_he TEXT, -- cash, check, transfer, other
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  notes_he TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_garden_date ON expenses(garden_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_garden_status ON expenses(garden_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_garden_category ON expenses(garden_id, category_he);

-- 10. Audit log (compliance)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_he TEXT NOT NULL, -- created, updated, deleted, approved
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  changes_json JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_garden_date ON audit_log(garden_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_garden_user ON audit_log(garden_id, user_id);

-- RLS (Row Level Security) Policies
-- Note: Enable RLS on all tables except gardens
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuition ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only see data from their garden)
-- These assume a user session with garden_id in auth.user.user_metadata.garden_id
-- For this MVP, we'll enforce garden scoping at the API level instead

-- Create a helper function to get current user's garden_id from JWT
CREATE OR REPLACE FUNCTION get_current_garden_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'garden_id')::uuid;
$$ LANGUAGE SQL;

-- Sample RLS policy (optional - we'll handle auth in backend)
-- CREATE POLICY "Users can only access their garden" ON users
-- FOR SELECT USING (garden_id = get_current_garden_id());
