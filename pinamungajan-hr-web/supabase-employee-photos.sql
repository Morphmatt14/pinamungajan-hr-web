-- Supabase SQL editor: add employee photo columns + storage bucket notes
--
-- 1) Add columns (safe, idempotent)
alter table if exists public.employees
  add column if not exists photo_url text null,
  add column if not exists photo_bucket text null,
  add column if not exists photo_source text null,
  add column if not exists photo_updated_at timestamptz null;

-- Optional index if you plan to query by photo_source
create index if not exists employees_photo_source_idx on public.employees (photo_source);

-- 2) Storage bucket
-- Create a private bucket named: employee_photos
-- (Dashboard -> Storage -> New bucket)
--
-- Recommended: keep it private and only serve via signed URLs.
--
-- 3) RLS note
-- If you use RLS on employees, ensure authenticated HR/admin can update the photo_* columns.

alter table public.employees enable row level security;
drop policy if exists employees_update_photo_authenticated on public.employees;
create policy employees_update_photo_authenticated
on public.employees
for update
to authenticated
using (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'authenticated')
)
with check (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'authenticated')
);

-- NOTE: Storage bucket policies must be configured in Supabase Dashboard
-- Dashboard -> Storage -> employee_photos bucket -> Policies
-- Add these policies manually:
-- 1) SELECT policy: bucket_id = 'employee_photos' for authenticated users
-- 2) INSERT policy: bucket_id = 'employee_photos' for authenticated users  
-- 3) UPDATE policy: bucket_id = 'employee_photos' for authenticated users
