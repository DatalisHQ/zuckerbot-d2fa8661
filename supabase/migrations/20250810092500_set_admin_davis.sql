-- Promote specific user to admin (idempotent)
UPDATE public.profiles
SET role = 'admin', subscription_tier = COALESCE(subscription_tier, 'agency')
WHERE email = 'davisgrainger@gmail.com';


