-- Expand care_home_matches.status to include workflow statuses
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'care_home_matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  ) LOOP
    EXECUTE format('ALTER TABLE care_home_matches DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE care_home_matches ADD CONSTRAINT care_home_matches_status_check
  CHECK (status IN (
    'suggested','proposed','visited','selected',
    'contacted','agreement_signed','visit_scheduled','visit_completed',
    'shortlisted','family_selected','family_rejected',
    'rejected','sent_to_family'
  ));

ALTER TABLE care_home_matches ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMP;
ALTER TABLE care_home_matches ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMP;
ALTER TABLE care_home_matches ADD COLUMN IF NOT EXISTS visit_scheduled_at TIMESTAMP;
ALTER TABLE care_home_matches ADD COLUMN IF NOT EXISTS visit_completed_at TIMESTAMP;
ALTER TABLE care_home_matches ADD COLUMN IF NOT EXISTS is_shortlisted BOOLEAN DEFAULT FALSE;

ALTER TABLE queue_assignments ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(50) DEFAULT 'matching';
