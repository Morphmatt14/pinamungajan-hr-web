-- Batch upload support: group multiple documents/extractions under one batch_id (UUID)

alter table public.employee_documents
  add column if not exists batch_id uuid;

alter table public.extractions
  add column if not exists batch_id uuid;

create index if not exists employee_documents_batch_id_idx on public.employee_documents (batch_id);
create index if not exists extractions_batch_id_idx on public.extractions (batch_id);

-- Optional: if you often query batch -> docs
create index if not exists extractions_batch_id_created_at_idx on public.extractions (batch_id, created_at);
