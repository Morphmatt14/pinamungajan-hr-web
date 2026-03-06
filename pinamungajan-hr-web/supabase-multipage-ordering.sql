-- Multi-page batch support: page ordering metadata

alter table public.employee_documents
  add column if not exists page_index int;

alter table public.extractions
  add column if not exists page_index int;

create index if not exists employee_documents_batch_page_idx
  on public.employee_documents (batch_id, page_index);

create index if not exists extractions_batch_page_idx
  on public.extractions (batch_id, page_index);
