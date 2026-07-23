-- "שנת הצהריים" — parent nap-ritual submissions (public form).
-- Isolated from event_cards so the public endpoint never touches internal data.
-- One row per child (upsert). Paste into Supabase SQL editor once.

CREATE TABLE IF NOT EXISTS nap_forms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id    UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  child_id     UUID REFERENCES children(id) ON DELETE CASCADE,
  child_name   TEXT,
  needs        JSONB,        -- ["מוצץ","שמיכה","הנקה", ...]
  needs_other  TEXT,         -- free text under the checkboxes
  ritual       TEXT,         -- part 2: how the child falls asleep at home
  notes        TEXT,         -- part 3: anything else that helps
  created_at   TIMESTAMP DEFAULT now(),
  updated_at   TIMESTAMP DEFAULT now()
);
-- one submission per child (enables upsert on re-fill)
CREATE UNIQUE INDEX IF NOT EXISTS uq_nap_child ON nap_forms(garden_id, child_id);
