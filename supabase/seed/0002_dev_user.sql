-- seed/0002_dev_user.sql
-- DEV. One test staff member so step 3's read-and-sign has a real person to
-- attach sign_offs to (sign_offs.user_id -> profiles.id -> auth.users.id).
--
-- This is Zeke's own account, kept at educator level so he can see the staff
-- view. Step 3 has no login screen: the app is hardcoded to this user. A
-- password is NOT set here (setting one from plaintext does not belong in a
-- committed file). When step 4 adds login, set the password in the Supabase
-- dashboard: Authentication -> Users -> zeke@readyset.au -> reset password.
--
-- Fixed UUID matches DEV_USER_ID in src/lib/constants.ts.
-- To remove: delete from auth.users where id = 'c0000000-0000-4000-8000-000000000001';

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'zeke@readyset.au',
  '',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into public.profiles (
  id, organisation_id, site_id, full_name, email, role, start_date, is_active
)
values (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',  -- Timboon
  'Zeke Pottage',
  'zeke@readyset.au',
  'educator',
  '2026-01-01',
  true
)
on conflict (id) do nothing;
