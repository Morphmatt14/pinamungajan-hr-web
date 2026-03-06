-- Fix: Update RPC function to include tenure columns
-- Run this in Supabase SQL Editor

-- First drop the existing function
drop function if exists public.masterlist_search_employees(text, int, int);

-- Then recreate with tenure columns
-- Update the RPC function to include tenure columns
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
    count(*) over() as total_count
  from public.employees e
  where 
    q is null or q = '' 
    or e.last_name ilike '%' || q || '%'
    or e.first_name ilike '%' || q || '%'
    or e.middle_name ilike '%' || q || '%'
  order by e.last_name, e.first_name, e.id
  limit limit_count
  offset offset_count;
end;
$$;
