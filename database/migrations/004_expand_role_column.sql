-- Expand users.role column from VARCHAR(20) to VARCHAR(50)
-- 'medical_social_worker' is 21 chars and exceeds the original limit
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50);
