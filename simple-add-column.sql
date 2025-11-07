-- Absolute Minimal Schema Fix
-- Only adds the missing snapshot_data column

-- Add the missing snapshot_data JSONB column
ALTER TABLE energy_rite_daily_snapshots 
ADD COLUMN IF NOT EXISTS snapshot_data JSONB DEFAULT '{}';

-- Test the addition worked
SELECT 'snapshot_data column added successfully!' as status;