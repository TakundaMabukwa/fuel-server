-- Add missing columns to energy_rite_operating_sessions table
ALTER TABLE energy_rite_operating_sessions 
ADD COLUMN IF NOT EXISTS opening_fuel NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS closing_fuel NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS opening_percentage NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS closing_percentage NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS session_status VARCHAR(20) DEFAULT 'ONGOING',
ADD COLUMN IF NOT EXISTS operating_hours NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_usage NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_fill NUMERIC(10,2);