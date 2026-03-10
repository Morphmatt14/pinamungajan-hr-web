-- Fix: Add tenure_years and tenure_months columns to employees table
-- Run this in Supabase SQL Editor

-- Add the missing columns
alter table if exists public.employees
  add column if not exists tenure_years integer null,
  add column if not exists tenure_months integer null;

-- Add index for performance
create index if not exists employees_tenure_idx on public.employees (tenure_years, tenure_months);

-- Update existing employees with calculated tenure
update public.employees
set 
  tenure_years = case
    when date_hired is not null then 
      extract(year from age(current_date at time zone 'Asia/Manila', date_hired))::int
    when appointment_date is not null then
      extract(year from age(current_date at time zone 'Asia/Manila', appointment_date))::int
    else null
  end,
  tenure_months = case
    when date_hired is not null then 
      extract(month from age(current_date at time zone 'Asia/Manila', date_hired))::int % 12
    when appointment_date is not null then
      extract(month from age(current_date at time zone 'Asia/Manila', appointment_date))::int % 12
    else null
  end
where date_hired is not null or appointment_date is not null;
