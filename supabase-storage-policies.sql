-- =============================================================================
-- Supabase Storage policies for Pinamungajan HR
-- Run in: SQL Editor after buckets exist:
--   hr-documents, ocr_results, employee_photos
--
-- Who this affects:
-- - Logged-in users (role "authenticated") uploading / downloading via the app.
-- - The service_role key bypasses RLS and does not need these policies.
--
-- Re-run safe: drops only the policies created here, then recreates them.
-- =============================================================================

-- Clean up previous run (policy names must match below)
drop policy if exists "hr_authenticated_all_hr_documents" on storage.objects;
drop policy if exists "hr_authenticated_all_ocr_results" on storage.objects;
drop policy if exists "hr_authenticated_all_employee_photos" on storage.objects;

-- Private buckets: allow any signed-in user full object access within each bucket.
-- Tighten later (e.g. folder prefix per org) if you need stricter isolation.

create policy "hr_authenticated_all_hr_documents"
on storage.objects
for all
to authenticated
using (bucket_id = 'hr-documents')
with check (bucket_id = 'hr-documents');

create policy "hr_authenticated_all_ocr_results"
on storage.objects
for all
to authenticated
using (bucket_id = 'ocr_results')
with check (bucket_id = 'ocr_results');

create policy "hr_authenticated_all_employee_photos"
on storage.objects
for all
to authenticated
using (bucket_id = 'employee_photos')
with check (bucket_id = 'employee_photos');
