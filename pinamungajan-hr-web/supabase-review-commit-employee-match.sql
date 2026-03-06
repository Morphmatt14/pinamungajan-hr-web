-- Review commit pipeline: helper indexes for safe matching (no uniqueness enforced)
-- Keep this conservative: do NOT enforce uniqueness on names+DOB because real-world duplicates exist.

create index if not exists employees_last_first_middle_dob_idx
  on public.employees (last_name, first_name, middle_name, date_of_birth);

-- Case-insensitive sort/match support
create index if not exists employees_last_name_lower_idx on public.employees (lower(last_name));
create index if not exists employees_first_name_lower_idx on public.employees (lower(first_name));
create index if not exists employees_middle_name_lower_idx on public.employees (lower(middle_name));

-- Optional: if you expect large volume and rely heavily on ILIKE %term% name search
create extension if not exists pg_trgm;
create index if not exists employees_last_name_trgm_idx on public.employees using gin (last_name gin_trgm_ops);
create index if not exists employees_first_name_trgm_idx on public.employees using gin (first_name gin_trgm_ops);
create index if not exists employees_middle_name_trgm_idx on public.employees using gin (middle_name gin_trgm_ops);
