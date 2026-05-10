-- Expand role constraint to include new referral-like roles (free tier)
-- Uses dynamic lookup to handle any auto-generated constraint name
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'users'
    AND tc.constraint_type = 'CHECK'
    AND tc.constraint_name ILIKE '%role%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'care_home', 'placement_agent', 'referral_agent', 'admin',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));

-- Expand plan_type constraint on subscriptions
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'subscriptions'
    AND tc.constraint_type = 'CHECK'
    AND tc.constraint_name ILIKE '%plan_type%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE subscriptions DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN (
    'care_home', 'placement_agent', 'referral_agent',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));
