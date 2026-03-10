-- Comprehensive SQL Migration for Appointment Data Support
-- Run this in Supabase SQL Editor

-- 1. Add step column to employees table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'step'
  ) THEN
    ALTER TABLE employees ADD COLUMN step INTEGER CHECK (step >= 1 AND step <= 8);
    COMMENT ON COLUMN employees.step IS 'Salary Grade Step (1-8) - auto-determined from monthly salary';
  END IF;
END $$;

-- 2. Verify all required appointment columns exist
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  -- Check position_title
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'position_title'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding position_title column';
    ALTER TABLE employees ADD COLUMN position_title TEXT;
  END IF;
  
  -- Check office_department
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'office_department'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding office_department column';
    ALTER TABLE employees ADD COLUMN office_department TEXT;
  END IF;
  
  -- Check sg
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'sg'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding sg column';
    ALTER TABLE employees ADD COLUMN sg INTEGER;
  END IF;
  
  -- Check monthly_salary
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'monthly_salary'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding monthly_salary column';
    ALTER TABLE employees ADD COLUMN monthly_salary NUMERIC;
  END IF;
  
  -- Check annual_salary
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'annual_salary'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding annual_salary column';
    ALTER TABLE employees ADD COLUMN annual_salary NUMERIC;
  END IF;
  
  -- Check date_hired
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'date_hired'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding date_hired column';
    ALTER TABLE employees ADD COLUMN date_hired DATE;
  END IF;
  
  -- Check tenure_years
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'tenure_years'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding tenure_years column';
    ALTER TABLE employees ADD COLUMN tenure_years INTEGER DEFAULT 0;
  END IF;
  
  -- Check tenure_months
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'tenure_months'
  ) INTO col_exists;
  
  IF NOT col_exists THEN
    RAISE NOTICE 'Adding tenure_months column';
    ALTER TABLE employees ADD COLUMN tenure_months INTEGER DEFAULT 0;
  END IF;
END $$;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_step ON employees(step);
CREATE INDEX IF NOT EXISTS idx_employees_sg ON employees(sg);
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position_title);
CREATE INDEX IF NOT EXISTS idx_employees_office ON employees(office_department);

-- 4. Verify current schema
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
AND column_name IN ('step', 'sg', 'position_title', 'office_department', 'monthly_salary', 'annual_salary', 'date_hired', 'tenure_years', 'tenure_months')
ORDER BY ordinal_position;
