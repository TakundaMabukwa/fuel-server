-- Add missing columns to energy_rite_generated_reports table
ALTER TABLE energy_rite_generated_reports 
ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS bucket_path TEXT,
ADD COLUMN IF NOT EXISTS period_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS total_sites INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_operating_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update existing generated_at to created_at if needed
UPDATE energy_rite_generated_reports 
SET created_at = generated_at 
WHERE created_at IS NULL;

-- Create index on bucket_path for faster lookups
CREATE INDEX IF NOT EXISTS idx_generated_reports_bucket_path ON energy_rite_generated_reports(bucket_path);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at ON energy_rite_generated_reports(created_at);

-- Update the unique constraint to be more flexible
ALTER TABLE energy_rite_generated_reports DROP CONSTRAINT IF EXISTS energy_rite_generated_reports_cost_code_report_type_report__key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_report_per_day 
ON energy_rite_generated_reports(cost_code, report_type, report_date, COALESCE(bucket_path, report_url));