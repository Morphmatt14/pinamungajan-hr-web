-- Make a user an administrator (can open /admin and see HR staff activity).
--
-- STEP 1: Create the user in Supabase Dashboard → Authentication → Users → Add user
--         (or invite them). Note their email.
--
-- STEP 2: Run this in SQL Editor (replace the email). Uses service role / postgres.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'your-admin-email@example.com';

-- Optional: HR staff (normal access, no /admin) — use role "hr"
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'hr')
-- where email = 'hr-staff@example.com';

-- Verify:
-- select id, email, raw_app_meta_data from auth.users where email = 'your-admin-email@example.com';
