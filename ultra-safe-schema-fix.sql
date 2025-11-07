-- Ultra-Safe Schema Fix for Daily Snapshots
-- This version handles existing constraints and requirements

-- First, add the missing snapshot_data column
ALTER TABLE energy_rite_daily_snapshots 
ADD COLUMN IF NOT EXISTS snapshot_data JSONB DEFAULT '{}';

-- Check what snapshot_type values are allowed and set a safe default
-- First try to see if we can set a default
DO $$
BEGIN
    -- Try to alter the column to have a default
    BEGIN
        ALTER TABLE energy_rite_daily_snapshots 
        ALTER COLUMN snapshot_type SET DEFAULT 'MANUAL';
    EXCEPTION
        WHEN OTHERS THEN
            -- If that fails, we'll handle it in the application
            RAISE NOTICE 'Could not set default for snapshot_type: %', SQLERRM;
    END;
END $$;

-- Try to set default for snapshot_time
DO $$
BEGIN
    BEGIN
        ALTER TABLE energy_rite_daily_snapshots 
        ALTER COLUMN snapshot_time SET DEFAULT NOW();
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not set default for snapshot_time: %', SQLERRM;
    END;
END $$;

-- Add basic indexes (safest approach)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);

-- Test the fix by trying to insert a record with all required fields
-- We'll discover what the valid snapshot_type values are
DO $$
DECLARE
    test_types TEXT[] := ARRAY['MANUAL', 'AUTO', 'SCHEDULED', 'MORNING', 'MIDDAY', 'EVENING', 'TEST'];
    test_type TEXT;
    success BOOLEAN := FALSE;
BEGIN
    -- Try different snapshot_type values to find one that works
    FOREACH test_type IN ARRAY test_types
    LOOP
        BEGIN
            INSERT INTO energy_rite_daily_snapshots (
                branch, 
                company, 
                snapshot_date,
                snapshot_time,
                snapshot_type,
                snapshot_data
            ) VALUES (
                'ULTRA_SAFE_TEST',
                'TEST_COMPANY',
                CURRENT_DATE,
                NOW(),
                test_type,
                '{"cost_code": "TEST-SAFE-001", "fuel_level": 77.8, "engine_status": "TEST"}'::jsonb
            );
            
            RAISE NOTICE 'SUCCESS: snapshot_type "%" works!', test_type;
            success := TRUE;
            
            -- Clean up immediately
            DELETE FROM energy_rite_daily_snapshots WHERE branch = 'ULTRA_SAFE_TEST';
            
            EXIT; -- Exit the loop on first success
            
        EXCEPTION
            WHEN check_violation THEN
                RAISE NOTICE 'snapshot_type "%" not allowed', test_type;
            WHEN OTHERS THEN
                RAISE NOTICE 'Other error with snapshot_type "%": %', test_type, SQLERRM;
        END;
    END LOOP;
    
    IF success THEN
        RAISE NOTICE 'Schema fix completed successfully! snapshot_data column added and working.';
    ELSE
        RAISE NOTICE 'Schema partially fixed. snapshot_data column added but need to check snapshot_type constraints.';
    END IF;
END $$;