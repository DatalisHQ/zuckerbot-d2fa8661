-- Fix auth security settings
-- Set OTP expiry to recommended threshold (10 minutes)
UPDATE auth.config SET value = '600' WHERE parameter = 'max_otp_validity_duration';

-- Enable leaked password protection
UPDATE auth.config SET value = 'true' WHERE parameter = 'security_password_leaked_protection';