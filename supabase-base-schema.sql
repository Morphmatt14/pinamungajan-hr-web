-- =============================================================================
-- Pinamungajan HR — base schema for a NEW Supabase project
-- Run in: Supabase Dashboard → SQL Editor (single paste, or split by sections)
--
-- Before running: create Storage buckets (Dashboard → Storage):
--   - hr-documents (private)
--   - ocr_results (private)
--   - employee_photos (private, optional; app can fall back to hr-documents)
--
-- After running: add policies on those buckets so authenticated users can
-- upload/read as needed (or use signed URLs only).
-- =============================================================================

-- Extensions used by migrations / search
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- 1) employees
-- -----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  last_name text not null default '',
  first_name text not null default '',
  middle_name text,
  name_extension text,
  date_of_birth date,
  date_hired date,
  appointment_date date,
  position_title text,
  office_department text,
  sg integer,
  step integer,
  monthly_salary numeric(12, 2),
  annual_salary numeric(12, 2),
  age integer,
  age_group text,
  gender text,
  tenure_years integer not null default 0,
  tenure_months integer not null default 0,
  photo_url text,
  photo_bucket text,
  photo_source text,
  photo_updated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_sg_check check (sg is null or (sg >= 1 and sg <= 33)),
  constraint employees_step_check check (step is null or (step >= 1 and step <= 8))
);

create index if not exists idx_employees_step on public.employees (step);
create index if not exists idx_employees_sg on public.employees (sg);
create index if not exists idx_employees_position on public.employees (position_title);
create index if not exists idx_employees_office on public.employees (office_department);
create index if not exists employees_position_title_idx on public.employees (position_title);
create index if not exists employees_office_department_idx on public.employees (office_department);
create index if not exists employees_sg_idx on public.employees (sg);
create index if not exists employees_appointment_date_idx on public.employees (appointment_date);
create index if not exists employees_date_hired_idx on public.employees (date_hired);
create index if not exists employees_tenure_idx on public.employees (tenure_years, tenure_months);
create index if not exists employees_photo_source_idx on public.employees (photo_source);
create index if not exists employees_created_by_idx on public.employees (created_by);
create index if not exists employees_updated_by_idx on public.employees (updated_by);
create index if not exists employees_tenure_query_idx
  on public.employees (date_hired, appointment_date)
  where date_hired is not null or appointment_date is not null;
create index if not exists employees_last_first_middle_dob_idx
  on public.employees (last_name, first_name, middle_name, date_of_birth);
create index if not exists employees_last_name_lower_idx on public.employees (lower(last_name));
create index if not exists employees_first_name_lower_idx on public.employees (lower(first_name));
create index if not exists employees_middle_name_lower_idx on public.employees (lower(middle_name));
create index if not exists employees_last_name_trgm_idx on public.employees using gin (last_name gin_trgm_ops);
create index if not exists employees_first_name_trgm_idx on public.employees using gin (first_name gin_trgm_ops);
create index if not exists employees_middle_name_trgm_idx on public.employees using gin (middle_name gin_trgm_ops);
create index if not exists employees_name_search_idx
  on public.employees
  using gin (to_tsvector('english', coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(middle_name, '')));

-- -----------------------------------------------------------------------------
-- 2) document_sets (multi-page PDS / uploads)
-- -----------------------------------------------------------------------------
create table if not exists public.document_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'uploaded',
  owner_employee_id uuid references public.employees (id) on delete set null,
  template_version text,
  notes text,
  document_type text
);

create index if not exists document_sets_owner_employee_id_idx on public.document_sets (owner_employee_id);

-- -----------------------------------------------------------------------------
-- 3) employee_documents
-- -----------------------------------------------------------------------------
create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_id uuid references public.employees (id) on delete cascade,
  batch_id uuid,
  document_set_id uuid references public.document_sets (id) on delete set null,
  page_index integer,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  original_filename text not null,
  file_size_bytes bigint,
  created_by uuid references auth.users (id) on delete set null,
  doc_type text not null default 'unknown',
  doc_type_user_selected text,
  doc_type_final text not null default 'unknown',
  doc_type_detected text,
  doc_type_mismatch_warning boolean not null default false,
  detection_confidence numeric not null default 0,
  detection_evidence jsonb,
  document_category text
);

create index if not exists employee_documents_document_set_id_idx on public.employee_documents (document_set_id);
create index if not exists employee_documents_document_set_page_idx on public.employee_documents (document_set_id, page_index);
create index if not exists employee_documents_batch_id_idx on public.employee_documents (batch_id);
create index if not exists employee_documents_batch_page_idx on public.employee_documents (batch_id, page_index);
create index if not exists idx_employee_documents_doc_type on public.employee_documents (doc_type);
create index if not exists idx_employee_documents_confidence on public.employee_documents (detection_confidence);
create index if not exists idx_employee_documents_evidence on public.employee_documents using gin (detection_evidence);
create index if not exists idx_employee_documents_employee_doc_type on public.employee_documents (employee_id, doc_type);
create index if not exists idx_employee_documents_user_selected on public.employee_documents (doc_type_user_selected);
create index if not exists idx_employee_documents_final on public.employee_documents (doc_type_final);

-- -----------------------------------------------------------------------------
-- 4) extractions
-- -----------------------------------------------------------------------------
create table if not exists public.extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  document_id uuid not null references public.employee_documents (id) on delete cascade,
  batch_id uuid,
  document_set_id uuid references public.document_sets (id) on delete set null,
  page_index integer,
  status text not null default 'uploaded',
  quality_score double precision,
  warnings jsonb,
  errors jsonb,
  evidence jsonb,
  confidence double precision,
  raw_extracted_json jsonb,
  normalized_json jsonb,
  validated_json jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  linked_employee_id uuid references public.employees (id) on delete cascade,
  doc_type_user_selected text,
  doc_type_final text,
  doc_type_detected text,
  doc_type_mismatch_warning boolean not null default false,
  document_type text,
  appointment_data jsonb,
  extraction_debug jsonb,
  approval_status text default 'pending'
);

create index if not exists extractions_batch_id_idx on public.extractions (batch_id);
create index if not exists extractions_batch_page_idx on public.extractions (batch_id, page_index);
create index if not exists extractions_batch_id_created_at_idx on public.extractions (batch_id, created_at);
create index if not exists extractions_document_set_id_idx on public.extractions (document_set_id);

-- -----------------------------------------------------------------------------
-- 5) pds_template_maps (calibration / field boxes)
-- -----------------------------------------------------------------------------
create table if not exists public.pds_template_maps (
  id bigserial primary key,
  template_version text not null,
  page integer not null,
  map_json jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists pds_template_maps_lookup
  on public.pds_template_maps (template_version, page, updated_at desc);

-- -----------------------------------------------------------------------------
-- 6) settings (org config; UI expects org_slug = 'pinamungajan-hr')
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  id bigserial primary key,
  org_slug text not null unique,
  sg_min integer not null default 1,
  sg_max integer not null default 33,
  age_brackets jsonb not null default '[]'::jsonb,
  allow_66_plus boolean not null default true,
  salary_tolerance text not null default '5',
  appointment_grace_days integer not null default 30
);

insert into public.settings (org_slug, sg_min, sg_max, age_brackets, allow_66_plus, salary_tolerance, appointment_grace_days)
values ('pinamungajan-hr', 1, 33, '[]'::jsonb, true, '5', 30)
on conflict (org_slug) do nothing;

-- -----------------------------------------------------------------------------
-- 7) updated_at trigger (extractions + employees)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists extractions_set_updated_at on public.extractions;
create trigger extractions_set_updated_at
before update on public.extractions
for each row execute procedure public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8) Auto annual salary from monthly (from supabase-appointment-support.sql)
-- -----------------------------------------------------------------------------
create or replace function public.compute_annual_salary()
returns trigger
language plpgsql
as $$
begin
  if new.monthly_salary is not null and new.annual_salary is null then
    new.annual_salary := new.monthly_salary * 12;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_compute_annual on public.employees;
create trigger employees_compute_annual
before insert or update on public.employees
for each row execute procedure public.compute_annual_salary();

-- -----------------------------------------------------------------------------
-- 9) Tenure view (optional reporting)
-- -----------------------------------------------------------------------------
create or replace view public.employee_tenure as
select
  id,
  last_name,
  first_name,
  middle_name,
  date_hired,
  appointment_date,
  case
    when date_hired is not null then date_hired
    when appointment_date is not null then appointment_date
    else null
  end as tenure_start_date,
  case
    when date_hired is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', date_hired))::int || 'y ' ||
      (extract(month from age(current_date at time zone 'Asia/Manila', date_hired))::int % 12) || 'm'
    when appointment_date is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', appointment_date))::int || 'y ' ||
      (extract(month from age(current_date at time zone 'Asia/Manila', appointment_date))::int % 12) || 'm'
    else null
  end as tenure_label,
  case
    when date_hired is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', date_hired))::int
    when appointment_date is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', appointment_date))::int
    else null
  end as tenure_years_v,
  case
    when date_hired is not null then
      (extract(month from age(current_date at time zone 'Asia/Manila', date_hired))::int % 12)
    when appointment_date is not null then
      (extract(month from age(current_date at time zone 'Asia/Manila', appointment_date))::int % 12)
    else null
  end as tenure_months_v
from public.employees;

-- -----------------------------------------------------------------------------
-- 10) Masterlist RPC (see supabase-fix-rpc-tenure.sql)
-- -----------------------------------------------------------------------------
drop function if exists public.masterlist_search_employees(text, int, int);

create or replace function public.masterlist_search_employees(
  q text,
  limit_count int,
  offset_count int
)
returns table (
  id uuid,
  last_name text,
  first_name text,
  middle_name text,
  name_extension text,
  date_of_birth date,
  date_hired date,
  appointment_date date,
  position_title text,
  office_department text,
  sg int,
  step int,
  monthly_salary numeric,
  annual_salary numeric,
  age int,
  age_group text,
  gender text,
  tenure_years int,
  tenure_months int,
  total_count bigint
)
language plpgsql
stable
as $$
begin
  return query
  select
    e.id,
    e.last_name,
    e.first_name,
    e.middle_name,
    e.name_extension,
    e.date_of_birth,
    e.date_hired,
    e.appointment_date,
    e.position_title,
    e.office_department,
    e.sg,
    e.step,
    e.monthly_salary,
    e.annual_salary,
    e.age,
    e.age_group,
    e.gender,
    e.tenure_years,
    e.tenure_months,
    count(*) over () as total_count
  from public.employees e
  where
    q is null
    or q = ''
    or e.last_name ilike '%' || q || '%'
    or e.first_name ilike '%' || q || '%'
    or e.middle_name ilike '%' || q || '%'
  order by e.last_name, e.first_name, e.id
  limit limit_count
  offset offset_count;
end;
$$;

-- Allow PostgREST to call the RPC as authenticated user
grant execute on function public.masterlist_search_employees(text, int, int) to authenticated;
grant execute on function public.masterlist_search_employees(text, int, int) to service_role;

-- -----------------------------------------------------------------------------
-- 11) Row Level Security (permissive for authenticated — tighten for production)
-- -----------------------------------------------------------------------------
alter table public.employees enable row level security;
alter table public.employee_documents enable row level security;
alter table public.extractions enable row level security;
alter table public.document_sets enable row level security;
alter table public.pds_template_maps enable row level security;
alter table public.settings enable row level security;

-- Drop existing policies on these tables if re-running this script
do $$
declare
  r record;
begin
  for r in
    select p.polname, c.relname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'employees',
        'employee_documents',
        'extractions',
        'document_sets',
        'pds_template_maps',
        'settings'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.polname, r.relname);
  end loop;
end $$;

-- One policy per command type so the app (browser + server user JWT) works.
-- service_role bypasses RLS for API routes using SUPABASE_SERVICE_ROLE_KEY.

create policy "app_employees_select" on public.employees for select to authenticated using (true);
create policy "app_employees_insert" on public.employees for insert to authenticated with check (true);
create policy "app_employees_update" on public.employees for update to authenticated using (true) with check (true);
create policy "app_employees_delete" on public.employees for delete to authenticated using (true);

create policy "app_employee_documents_select" on public.employee_documents for select to authenticated using (true);
create policy "app_employee_documents_insert" on public.employee_documents for insert to authenticated with check (true);
create policy "app_employee_documents_update" on public.employee_documents for update to authenticated using (true) with check (true);
create policy "app_employee_documents_delete" on public.employee_documents for delete to authenticated using (true);

create policy "app_extractions_select" on public.extractions for select to authenticated using (true);
create policy "app_extractions_insert" on public.extractions for insert to authenticated with check (true);
create policy "app_extractions_update" on public.extractions for update to authenticated using (true) with check (true);
create policy "app_extractions_delete" on public.extractions for delete to authenticated using (true);

create policy "app_document_sets_select" on public.document_sets for select to authenticated using (true);
create policy "app_document_sets_insert" on public.document_sets for insert to authenticated with check (true);
create policy "app_document_sets_update" on public.document_sets for update to authenticated using (true) with check (true);
create policy "app_document_sets_delete" on public.document_sets for delete to authenticated using (true);

create policy "app_pds_template_maps_select" on public.pds_template_maps for select to authenticated using (true);
create policy "app_pds_template_maps_insert" on public.pds_template_maps for insert to authenticated with check (true);
create policy "app_pds_template_maps_update" on public.pds_template_maps for update to authenticated using (true) with check (true);
create policy "app_pds_template_maps_delete" on public.pds_template_maps for delete to authenticated using (true);

create policy "app_settings_select" on public.settings for select to authenticated using (true);
create policy "app_settings_update" on public.settings for update to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 12) Optional: expose relationship for PostgREST embeds (extractions → document)
-- -----------------------------------------------------------------------------
-- FK extractions.document_id → employee_documents.id already allows:
--   .select('..., employee_documents(storage_bucket, storage_path)')

comment on table public.employees is 'HR masterlist / person records';
comment on table public.employee_documents is 'Uploaded files metadata; binary in Storage';
comment on table public.extractions is 'OCR pipeline state per upload anchor';
comment on table public.document_sets is 'Logical multi-page document (e.g. PDS set)';
comment on table public.pds_template_maps is 'PDS field calibration maps per template version + page';
comment on table public.settings is 'Org-level HR rules; Settings page uses org_slug pinamungajan-hr';

-- -----------------------------------------------------------------------------
-- 13) API access (PostgREST / Supabase client)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.employee_documents to authenticated;
grant select, insert, update, delete on public.extractions to authenticated;
grant select, insert, update, delete on public.document_sets to authenticated;
grant select, insert, update, delete on public.pds_template_maps to authenticated;
grant select, update on public.settings to authenticated;

grant usage, select on sequence public.pds_template_maps_id_seq to authenticated;
grant usage, select on sequence public.settings_id_seq to authenticated;
