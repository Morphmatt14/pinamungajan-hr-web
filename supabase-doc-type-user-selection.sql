-- Add document type user selection and final type columns
-- Run this in Supabase SQL Editor

-- Add user-selected document type
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS doc_type_user_selected TEXT DEFAULT NULL;

-- Add final document type (user selected or auto-detected)
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS doc_type_final TEXT DEFAULT 'unknown';

-- Add type mismatch warning flag
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS doc_type_mismatch_warning BOOLEAN DEFAULT FALSE;

-- Add extraction type routing info
ALTER TABLE extractions 
ADD COLUMN IF NOT EXISTS doc_type_user_selected TEXT DEFAULT NULL;

ALTER TABLE extractions 
ADD COLUMN IF NOT EXISTS doc_type_final TEXT DEFAULT NULL;

ALTER TABLE extractions 
ADD COLUMN IF NOT EXISTS doc_type_detected TEXT DEFAULT NULL;

ALTER TABLE extractions 
ADD COLUMN IF NOT EXISTS doc_type_mismatch_warning BOOLEAN DEFAULT FALSE;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_employee_documents_user_selected 
ON employee_documents(doc_type_user_selected);

CREATE INDEX IF NOT EXISTS idx_employee_documents_final 
ON employee_documents(doc_type_final);

CREATE INDEX IF NOT EXISTS idx_extractions_user_selected 
ON extractions(doc_type_user_selected);

CREATE INDEX IF NOT EXISTS idx_extractions_final 
ON extractions(doc_type_final);
