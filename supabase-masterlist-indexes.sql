-- Masterlist performance: stable case-insensitive sort + partial name search

-- Optional, but recommended for fast ILIKE %term% searches.
create extension if not exists pg_trgm;

-- Case-insensitive sort support (helps ORDER BY lower(last_name), lower(first_name)).
create index if not exists employees_last_name_lower_idx on public.employees (lower(last_name));
create index if not exists employees_first_name_lower_idx on public.employees (lower(first_name));
create index if not exists employees_middle_name_lower_idx on public.employees (lower(middle_name));

-- Trigram indexes for fast partial matches.
create index if not exists employees_last_name_trgm_idx on public.employees using gin (last_name gin_trgm_ops);
create index if not exists employees_first_name_trgm_idx on public.employees using gin (first_name gin_trgm_ops);
create index if not exists employees_middle_name_trgm_idx on public.employees using gin (middle_name gin_trgm_ops);

-- RPC used by /api/masterlist/employees for stable case-insensitive ordering + pagination + total count.
-- NOTE: uses window count(*) over() to return total_count without a second query.
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
  position_title text,
  office_department text,
  sg int,
  monthly_salary numeric,
  annual_salary numeric,
  age int,
  age_group text,
  gender text,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select e.*
    from public.employees e
    where
      q is null
      or e.last_name ilike ('%' || q || '%')
      or e.first_name ilike ('%' || q || '%')
      or e.middle_name ilike ('%' || q || '%')
  )
  select
    f.id,
    f.last_name,
    f.first_name,
    f.middle_name,
    f.name_extension,
    f.date_of_birth,
    f.position_title,
    f.office_department,
    f.sg,
    f.monthly_salary,
    f.annual_salary,
    f.age,
    f.age_group,
    f.gender,
    count(*) over() as total_count
  from filtered f
  order by
    lower(coalesce(f.last_name, '')) asc,
    lower(coalesce(f.first_name, '')) asc,
    lower(coalesce(f.middle_name, '')) asc,
    f.id asc
  limit limit_count
  offset offset_count;
$$;

-- Lock down RPC exposure to authenticated users.
revoke all on function public.masterlist_search_employees(text, int, int) from public;
grant execute on function public.masterlist_search_employees(text, int, int) to authenticated;
