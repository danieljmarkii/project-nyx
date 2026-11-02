-- Two accounts, A (deleted mid-probe) and B (stays live), each with the
-- profile row the on_auth_user_created trigger mints in production.
INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b');
INSERT INTO public.user_profiles (id) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b');
-- A label each already owns (what the replace path overwrites).
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('nyx-medication-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/m2/front.jpg', 'bbbbbbbb-0000-0000-0000-00000000000b');
