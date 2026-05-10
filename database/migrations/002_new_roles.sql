-- Expand role constraint to include new referral-like roles (free tier)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'care_home', 'placement_agent', 'referral_agent', 'admin',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));

-- Expand plan_type constraint on subscriptions
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN (
    'care_home', 'placement_agent', 'referral_agent',
    'case_manager', 'discharge_planner', 'medical_social_worker'
  ));
