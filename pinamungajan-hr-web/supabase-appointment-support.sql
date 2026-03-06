-- Appointment / CSC Form No. 33-A support migration
-- Run this in Supabase SQL Editor

-- 1) Add employee columns for appointment data
alter table if exists public.employees
  add column if not exists position_title text null,
  add column if not exists office_department text null,
  add column if not exists sg integer null,
  add column if not exists monthly_salary numeric(12,2) null,
  add column if not exists annual_salary numeric(12,2) null,
  add column if not exists appointment_date date null,
  add column if not exists date_hired date null;

-- 2) Add constraints/validation
alter table public.employees drop constraint if exists employees_sg_check;
alter table public.employees add constraint employees_sg_check 
  check (sg is null or (sg >= 1 and sg <= 33));

-- 3) Indexes for performance
create index if not exists employees_position_title_idx on public.employees (position_title);
create index if not exists employees_office_department_idx on public.employees (office_department);
create index if not exists employees_sg_idx on public.employees (sg);
create index if not exists employees_appointment_date_idx on public.employees (appointment_date);
create index if not exists employees_date_hired_idx on public.employees (date_hired);

-- 4) Add document_type to extractions for classification
alter table public.extractions 
  add column if not exists document_type text null;

-- 5) Add appointment-specific metadata storage
alter table public.extractions
  add column if not exists appointment_data jsonb null;

-- 6) Create view for tenure calculation (timezone-safe Asia/Manila)
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
      extract(month from age(current_date at time zone 'Asia/Manila', date_hired))::int % 12 || 'm'
    when appointment_date is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', appointment_date))::int || 'y ' ||
      extract(month from age(current_date at time zone 'Asia/Manila', appointment_date))::int % 12 || 'm'
    else null
  end as tenure_label,
  case
    when date_hired is not null then 
      extract(year from age(current_date at time zone 'Asia/Manila', date_hired))::int
    when appointment_date is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', appointment_date))::int
    else null
  end as tenure_years,
  case
    when date_hired is not null then 
      extract(month from age(current_date at time zone 'Asia/Manila', date_hired))::int % 12
    when appointment_date is not null then
      extract(month from age(current_date at time zone 'Asia/Manila', appointment_date))::int % 12
    else null
  end as tenure_months
from public.employees;

-- 7) Add indexes for tenure queries
create index if not exists employees_tenure_query_idx 
  on public.employees (date_hired, appointment_date) 
  where date_hired is not null or appointment_date is not null;

-- 8) Document linking for appointment forms
alter table public.employee_documents
  add column if not exists document_category text null;

comment on column public.employee_documents.document_category is 
  'Category: pds, appointment, certification, etc.';

-- 9) Enable RLS updates for appointment data
alter table public.employees enable row level security;

drop policy if exists employees_update_appointment_authenticated on public.employees;
create policy employees_update_appointment_authenticated
on public.employees
for update
using (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'admin', 'authenticated')
)
with check (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'admin', 'authenticated')
);

-- 10) Add trigger to auto-compute annual from monthly if not set
create or replace function compute_annual_salary()
returns trigger as $$
begin
  if new.monthly_salary is not null and new.annual_salary is null then
    new.annual_salary := new.monthly_salary * 12;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists employees_compute_annual on public.employees;
create trigger employees_compute_annual
before insert or update on public.employees
for each row
execute function compute_annual_salary();

-- 11) Add fuzzy matching helper (for name similarity)
create extension if not exists pg_trgm;

create or replace function normalize_name_for_match(input text)
returns text as $$
begin
  return upper(regexp_replace(coalesce(input, ''), '[^A-Z\s]', ' ', 'gi'));
end;
$$ language plpgsql immutable;

-- 12) GIN index for text search on employee names
create index if not exists employees_name_search_idx 
  on public.employees 
  using gin (to_tsvector('english', coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(middle_name, '')));

-- 13) Add extraction_debug column for appointment-specific debug info
alter table public.extractions
  add column if not exists extraction_debug jsonb null;

comment on column public.extractions.extraction_debug is 
  'Debug information for appointment/PDS extraction including foundLabels, chosenRois, parsedValues, validationReasons';

-- 14) Add approval status tracking for appointment documents
alter table public.extractions
  add column if not exists approval_status text null default 'pending';

comment on column public.extractions.approval_status is 
  'pending, confirmed, rejected - for manual verification of appointment data';

-- 15) Document set type classification
alter table public.document_sets
  add column if not exists document_type text null;

comment on column public.document_sets.document_type is 
  'Type of document set: pds, appointment, certification, etc.';
