-- Employee audit columns (who created / last updated a masterlist row)
-- Run in Supabase SQL Editor after base schema.

alter table public.employees
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.employees
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

create index if not exists employees_created_by_idx on public.employees (created_by);
create index if not exists employees_updated_by_idx on public.employees (updated_by);

comment on column public.employees.created_by is 'Auth user who first created this employee row (when set by app)';
comment on column public.employees.updated_by is 'Auth user who last updated this employee row';
