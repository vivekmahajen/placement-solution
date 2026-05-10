-- CareConnect Initial Schema Migration
-- 001_initial_schema.sql

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('care_home','placement_agent','referral_agent','admin')),
  status VARCHAR(30) DEFAULT 'pending_verification' CHECK (status IN ('active','suspended','pending_verification','cancelled')),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  email_verification_token VARCHAR(255),
  email_verification_expires_at TIMESTAMP,
  refresh_token_hash VARCHAR(255),
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type VARCHAR(30) CHECK (plan_type IN ('care_home','placement_agent','referral_agent')),
  trial_start_date DATE NOT NULL,
  trial_end_date DATE NOT NULL,
  billing_start_date DATE,
  monthly_amount DECIMAL(8,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','cancelled','paused')),
  stripe_customer_id VARCHAR(100),
  stripe_sub_id VARCHAR(100),
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_trial_end ON subscriptions(trial_end_date);

-- ============================================================
-- CARE HOMES
-- ============================================================
CREATE TABLE care_homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) NOT NULL,
  license_state CHAR(2) NOT NULL,
  license_expiry DATE,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(100),
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL,
  zip VARCHAR(10) NOT NULL,
  county VARCHAR(100),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  phone VARCHAR(20) NOT NULL,
  fax VARCHAR(20),
  email VARCHAR(255) NOT NULL,
  website VARCHAR(255),
  admin_name VARCHAR(255),
  bed_capacity INTEGER,
  facility_type VARCHAR(30) CHECK (facility_type IN ('assisted_living','skilled_nursing','memory_care','residential_care','adult_day','hospice','continuing_care')),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_care_homes_user_id ON care_homes(user_id);
CREATE INDEX idx_care_homes_state ON care_homes(state);
CREATE INDEX idx_care_homes_zip ON care_homes(zip);
CREATE INDEX idx_care_homes_city ON care_homes(city);
CREATE INDEX idx_care_homes_is_active ON care_homes(is_active);
CREATE INDEX idx_care_homes_is_verified ON care_homes(is_verified);

-- ============================================================
-- CARE HOME AVAILABILITY
-- ============================================================
CREATE TABLE care_home_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_home_id UUID NOT NULL REFERENCES care_homes(id) ON DELETE CASCADE,
  room_type VARCHAR(10) NOT NULL CHECK (room_type IN ('private','shared')),
  gender_preference VARCHAR(10) NOT NULL DEFAULT 'any' CHECK (gender_preference IN ('male','female','any')),
  rooms_available INTEGER NOT NULL DEFAULT 0,
  base_price_monthly DECIMAL(10,2) NOT NULL,
  notes TEXT,
  last_updated_at TIMESTAMP DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES users(id),
  UNIQUE (care_home_id, room_type, gender_preference)
);

CREATE INDEX idx_availability_care_home_id ON care_home_availability(care_home_id);
CREATE INDEX idx_availability_rooms ON care_home_availability(rooms_available);

-- ============================================================
-- CARE HOME SERVICES
-- ============================================================
CREATE TABLE care_home_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_home_id UUID NOT NULL REFERENCES care_homes(id) ON DELETE CASCADE,
  service_code VARCHAR(50) NOT NULL,
  service_label VARCHAR(100) NOT NULL,
  additional_cost DECIMAL(8,2) DEFAULT 0.00,
  is_available BOOLEAN DEFAULT TRUE,
  UNIQUE (care_home_id, service_code)
);

CREATE INDEX idx_services_care_home_id ON care_home_services(care_home_id);

-- ============================================================
-- PLACEMENT AGENTS
-- ============================================================
CREATE TABLE placement_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  company_name VARCHAR(255),
  license_number VARCHAR(100),
  address_line1 VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL,
  zip VARCHAR(10) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_placement_agents_user_id ON placement_agents(user_id);

CREATE TABLE placement_agent_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES placement_agents(id) ON DELETE CASCADE,
  coverage_type VARCHAR(10) NOT NULL CHECK (coverage_type IN ('city','zip','county')),
  coverage_value VARCHAR(100) NOT NULL,
  state CHAR(2),
  UNIQUE (agent_id, coverage_type, coverage_value)
);

CREATE INDEX idx_coverage_agent_id ON placement_agent_coverage(agent_id);
CREATE INDEX idx_coverage_type_value ON placement_agent_coverage(coverage_type, coverage_value);

-- ============================================================
-- REFERRAL AGENTS
-- ============================================================
CREATE TABLE referral_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  company_name VARCHAR(255),
  address_line1 VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL,
  zip VARCHAR(10) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_referral_agents_user_id ON referral_agents(user_id);

-- ============================================================
-- PATIENTS
-- ============================================================
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_agent_id UUID NOT NULL REFERENCES referral_agents(id),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  sex VARCHAR(20) CHECK (sex IN ('male','female','non_binary','prefer_not_to_say')),
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state CHAR(2),
  zip VARCHAR(10),
  phone VARCHAR(20),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_rel VARCHAR(100),
  preferred_city VARCHAR(100),
  preferred_zip VARCHAR(10),
  preferred_county VARCHAR(100),
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  room_type_preference VARCHAR(10) NOT NULL DEFAULT 'either' CHECK (room_type_preference IN ('private','shared','either')),
  queue_status VARCHAR(20) DEFAULT 'queued' CHECK (queue_status IN ('queued','locked','in_progress','matched','placed','cancelled','inactive')),
  queued_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_patients_referral_agent_id ON patients(referral_agent_id);
CREATE INDEX idx_patient_queue ON patients(queue_status, queued_at);
CREATE INDEX idx_patients_preferred_zip ON patients(preferred_zip);
CREATE INDEX idx_patients_preferred_city ON patients(preferred_city);

CREATE TABLE patient_services_needed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  service_code VARCHAR(50) NOT NULL,
  UNIQUE (patient_id, service_code)
);

CREATE INDEX idx_patient_services_patient_id ON patient_services_needed(patient_id);

-- ============================================================
-- QUEUE ASSIGNMENTS
-- ============================================================
CREATE TABLE queue_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  placement_agent_id UUID NOT NULL REFERENCES placement_agents(id),
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked','expired','completed','failed')),
  released_at TIMESTAMP,
  outcome_notes TEXT,
  warning_sent_24h BOOLEAN DEFAULT FALSE,
  warning_sent_2h BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (patient_id, placement_agent_id)
);

CREATE INDEX idx_queue_status ON queue_assignments(status, lock_expires_at);
CREATE INDEX idx_queue_agent_id ON queue_assignments(placement_agent_id);
CREATE INDEX idx_queue_patient_id ON queue_assignments(patient_id);

-- ============================================================
-- CARE HOME MATCHES
-- ============================================================
CREATE TABLE care_home_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  placement_agent_id UUID NOT NULL REFERENCES placement_agents(id),
  care_home_id UUID NOT NULL REFERENCES care_homes(id),
  match_score DECIMAL(5,2),
  match_reasons JSONB,
  status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed','visited','selected','rejected','sent_to_family')),
  visit_date DATE,
  agent_notes TEXT,
  selected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_matches_patient_id ON care_home_matches(patient_id);
CREATE INDEX idx_matches_agent_id ON care_home_matches(placement_agent_id);
CREATE INDEX idx_matches_care_home_id ON care_home_matches(care_home_id);
CREATE INDEX idx_matches_status ON care_home_matches(status);

-- ============================================================
-- PLACEMENTS
-- ============================================================
CREATE TABLE placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  placement_agent_id UUID NOT NULL REFERENCES placement_agents(id),
  referral_agent_id UUID NOT NULL REFERENCES referral_agents(id),
  care_home_id UUID NOT NULL REFERENCES care_homes(id),
  room_type VARCHAR(10) CHECK (room_type IN ('private','shared')),
  monthly_rate DECIMAL(10,2),
  agreement_signed_at TIMESTAMP,
  family_notified_at TIMESTAMP,
  move_in_date DATE,
  care_home_city VARCHAR(100),
  care_home_zip VARCHAR(10),
  care_home_county VARCHAR(100),
  status VARCHAR(30) DEFAULT 'pending_agreement' CHECK (status IN ('pending_agreement','agreement_signed','family_notified','confirmed','cancelled')),
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_placements_patient_id ON placements(patient_id);
CREATE INDEX idx_placements_agent_id ON placements(placement_agent_id);
CREATE INDEX idx_placements_referral_agent_id ON placements(referral_agent_id);
CREATE INDEX idx_placements_care_home_id ON placements(care_home_id);
CREATE INDEX idx_placements_status ON placements(status);
CREATE INDEX idx_placements_zip ON placements(care_home_zip);
CREATE INDEX idx_placements_city ON placements(care_home_city);

-- ============================================================
-- AGREEMENTS
-- ============================================================
CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES placements(id),
  document_type VARCHAR(30) CHECK (document_type IN ('placement_agreement','referral_agreement','service_agreement')),
  document_url VARCHAR(500),
  signer_name VARCHAR(255),
  signer_email VARCHAR(255),
  signer_ip VARCHAR(45),
  signature_token VARCHAR(255) UNIQUE,
  token_expires_at TIMESTAMP,
  signed_at TIMESTAMP,
  voided_at TIMESTAMP,
  void_reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','signed','voided','expired')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agreements_placement_id ON agreements(placement_id);
CREATE INDEX idx_agreements_token ON agreements(signature_token);
CREATE INDEX idx_agreements_status ON agreements(status);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_care_homes_updated_at
  BEFORE UPDATE ON care_homes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_placements_updated_at
  BEFORE UPDATE ON placements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
