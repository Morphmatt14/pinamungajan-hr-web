-- Document sets: group multi-page uploads (PDS CS Form 212)
--
-- This is a new concept to represent one logical PDS "set" (typically 4 pages).
-- Each uploaded page is an employee_documents row referencing document_sets(id).
--
-- Apply in Supabase SQL editor.

create table if not exists public.document_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'uploaded',
  owner_employee_id uuid null,
  template_version text null,
  notes text null
);

-- employee_documents: each page belongs to a set
alter table public.employee_documents
  add column if not exists document_set_id uuid;

create index if not exists employee_documents_document_set_id_idx
  on public.employee_documents (document_set_id);

create index if not exists employee_documents_document_set_page_idx
  on public.employee_documents (document_set_id, page_index);

-- extractions: keep compatibility (anchor extraction represents the set)
alter table public.extractions
  add column if not exists document_set_id uuid;

create index if not exists extractions_document_set_id_idx
  on public.extractions (document_set_id);

-- employees: optional hire date for tenure
alter table public.employees
  add column if not exists date_hired date;

create index if not exists employees_date_hired_idx
  on public.employees (date_hired);

-- Optional FK constraints (enable once you confirm existing data is consistent)
-- alter table public.employee_documents
--   add constraint employee_documents_document_set_id_fkey
--   foreign key (document_set_id) references public.document_sets(id) on delete cascade;
--
-- alter table public.extractions
--   add constraint extractions_document_set_id_fkey
--   foreign key (document_set_id) references public.document_sets(id) on delete set null;
