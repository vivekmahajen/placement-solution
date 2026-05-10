-- Idempotent fix: ensure role and plan_type constraints include all 7 roles
-- Uses pg_constraint (system catalog) which reliably finds inline CHECK constraints

-- Drop ALL check constraints on users.role (by scanning pg_constraint)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'care_home', 'placement_agent', 'referral_agent', 'admin',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));

-- Drop ALL check constraints on subscriptions.plan_type
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%plan_type%'
  ) LOOP
    EXECUTE format('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN (
    'care_home', 'placement_agent', 'referral_agent',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));
