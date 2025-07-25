-- Create trigger to automatically create profile for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create profile for existing user who doesn't have one
INSERT INTO public.profiles (user_id, email, full_name, onboarding_completed)
VALUES (
  'ddf4cc12-dbfc-4356-8f92-368f32a724cd',
  'davisgrainger@gmail.com',
  'Davis Grainger',
  false
)
ON CONFLICT (user_id) DO NOTHING;