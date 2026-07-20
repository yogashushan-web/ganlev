-- "מעגל השנה" — backbone table for anchor cards (step 1: staff conversations).
-- Generic on purpose: staff_id OR child_id, so the same table later holds
-- parent meetings, birthday calls, etc. Paste into Supabase SQL editor once.

CREATE TABLE IF NOT EXISTS event_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id       UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'staff_conversation',  -- staff_conversation | parent_meeting | birthday_call | ...
  conv_type       TEXT,                                        -- for staff: reflective|development|training|planning|problem|case|performance|hearing
  staff_id        UUID REFERENCES staff(id) ON DELETE SET NULL,
  child_id        UUID REFERENCES children(id) ON DELETE SET NULL,
  event_id        UUID,                                        -- links to the calendar event (events.id) that opens this card
  title           TEXT,
  scheduled_date  DATE,
  scheduled_time  TIME,
  urgency         TEXT DEFAULT 'important',                    -- critical | important | calm
  status          TEXT NOT NULL DEFAULT 'planned',             -- planned | prepared | done
  prep            JSONB,                                       -- [{q, a}, ...] the prep card
  summary         JSONB,                                       -- {happened, decisions, follow_ups, next_time}
  snooze_until    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT now(),
  done_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_cards_staff  ON event_cards(garden_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_event_cards_child  ON event_cards(garden_id, child_id);
CREATE INDEX IF NOT EXISTS idx_event_cards_event  ON event_cards(garden_id, event_id);
