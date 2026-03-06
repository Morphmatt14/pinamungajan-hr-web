-- Supabase SQL editor: add ON DELETE CASCADE for FKs that reference employees(id)

-- Inspect current FKs referencing employees(id)
select
  con.conname as constraint_name,
  rel_t.relname as table_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel_t on rel_t.oid = con.conrelid
join pg_class rel_r on rel_r.oid = con.confrelid
where con.contype = 'f'
  and rel_r.relname = 'employees'
order by rel_t.relname, con.conname;

-- employee_documents.employee_id -> employees.id should cascade
DO $$
DECLARE
  v_conname text;
BEGIN
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel_t on rel_t.oid = con.conrelid
  join pg_class rel_r on rel_r.oid = con.confrelid
  join pg_attribute a on a.attrelid = rel_t.oid and a.attnum = ANY (con.conkey)
  where con.contype = 'f'
    and rel_t.relname = 'employee_documents'
    and rel_r.relname = 'employees'
    and a.attname = 'employee_id'
  limit 1;

  if v_conname is not null then
    execute format('alter table employee_documents drop constraint %I', v_conname);
  end if;

  execute 'alter table employee_documents add constraint employee_documents_employee_id_fkey '
       || 'foreign key (employee_id) references employees(id) on delete cascade';
END $$;

-- If extractions.linked_employee_id exists and references employees(id), make it cascade too.
DO $$
DECLARE
  v_has_col boolean;
  v_conname text;
BEGIN
  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'extractions'
      and column_name = 'linked_employee_id'
  ) into v_has_col;

  if not v_has_col then
    return;
  end if;

  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel_t on rel_t.oid = con.conrelid
  join pg_class rel_r on rel_r.oid = con.confrelid
  join pg_attribute a on a.attrelid = rel_t.oid and a.attnum = ANY (con.conkey)
  where con.contype = 'f'
    and rel_t.relname = 'extractions'
    and rel_r.relname = 'employees'
    and a.attname = 'linked_employee_id'
  limit 1;

  if v_conname is not null then
    execute format('alter table extractions drop constraint %I', v_conname);
  end if;

  execute 'alter table extractions add constraint extractions_linked_employee_id_fkey '
       || 'foreign key (linked_employee_id) references employees(id) on delete cascade';
END $$;

-- RLS policies
-- NOTE: Postgres cascades still invoke RLS on the affected tables.
-- If RLS blocks DELETE on employee_documents, deleting from employees will fail even with ON DELETE CASCADE.

-- employees
alter table employees enable row level security;
drop policy if exists "employees_delete_authenticated" on employees;
create policy "employees_delete_authenticated"
on employees
for delete
to authenticated
using (
  -- Optional: enforce HR-only if you add a JWT claim `role=hr`.
  -- If no claim exists, allow any authenticated user.
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'authenticated')
);

-- employee_documents
alter table employee_documents enable row level security;
drop policy if exists "employee_documents_delete_authenticated" on employee_documents;
create policy "employee_documents_delete_authenticated"
on employee_documents
for delete
to authenticated
using (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'authenticated')
);

-- extractions (only if you have an RLS-protected table and want deletes to succeed)
alter table extractions enable row level security;
drop policy if exists "extractions_delete_authenticated" on extractions;
create policy "extractions_delete_authenticated"
on extractions
for delete
to authenticated
using (
  coalesce(nullif(auth.jwt() ->> 'role', ''), 'authenticated') in ('hr', 'authenticated')
);
