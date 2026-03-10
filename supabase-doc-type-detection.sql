-- Add document type detection columns to employee_documents table
-- Run this in Supabase SQL Editor

-- Add doc_type column
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'unknown';

-- Add detection_confidence column
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS detection_confidence NUMERIC DEFAULT 0;

-- Add detection_evidence JSONB column for storing detection metadata
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS detection_evidence JSONB DEFAULT NULL;

-- Add index for doc_type filtering
CREATE INDEX IF NOT EXISTS idx_employee_documents_doc_type 
ON employee_documents(doc_type);

-- Add index for detection confidence queries
CREATE INDEX IF NOT EXISTS idx_employee_documents_confidence 
ON employee_documents(detection_confidence);

-- Update RLS policy to allow doc_type updates
DROP POLICY IF EXISTS "Allow authenticated to update employee_documents" ON employee_documents;
CREATE POLICY "Allow authenticated to update employee_documents" 
ON employee_documents 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Add GIN index for detection_evidence JSONB queries
CREATE INDEX IF NOT EXISTS idx_employee_documents_evidence 
ON employee_documents USING GIN(detection_evidence);

-- Add composite index for employee_id + doc_type queries (common for Personal Info drawer)
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_doc_type 
ON employee_documents(employee_id, doc_type);

-- Update existing rows with default detection_evidence structure
UPDATE employee_documents 
SET detection_evidence = '{"stage": "text", "matched": [], "scores": {}}'::jsonb 
WHERE detection_evidence IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN employee_documents.doc_type IS 'Document type detected from OCR (pds, appointment, oath, etc.)';
COMMENT ON COLUMN employee_documents.detection_confidence IS 'Confidence score (0-1) of document type detection';
COMMENT ON COLUMN employee_documents.detection_evidence IS 'JSON containing detection evidence: matched phrases, scores, stage';
