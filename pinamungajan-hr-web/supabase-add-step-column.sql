-- Migration: Add step column to employees table for salary grade step tracking
-- This supports the new salary grade lookup feature that auto-determines SG and Step from salary

-- Add step column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS step INTEGER CHECK (step >= 1 AND step <= 8);

-- Add comment explaining the column
COMMENT ON COLUMN employees.step IS 'Salary Grade Step (1-8) - auto-determined from monthly salary using salary grade table';

-- Create index for faster queries on step
CREATE INDEX IF NOT EXISTS idx_employees_step ON employees(step);

-- Update employees table RLS policies if needed
-- (No changes needed - existing policies cover new column)
