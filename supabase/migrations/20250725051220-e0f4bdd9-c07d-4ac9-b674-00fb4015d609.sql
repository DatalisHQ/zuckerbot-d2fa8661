-- Create profile for existing user who doesn't have one
INSERT INTO public.profiles (user_id, email, full_name, onboarding_completed)
VALUES (
  'ddf4cc12-dbfc-4356-8f92-368f32a724cd',
  'davisgrainger@gmail.com',
  'Davis Grainger',
  false
)
ON CONFLICT (user_id) DO NOTHING;