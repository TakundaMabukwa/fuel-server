-- Create activity snapshots table
CREATE TABLE IF NOT EXISTS energy_rite_activity_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
  time_slot VARCHAR(20) NOT NULL, -- morning, afternoon, evening
  time_slot_name VARCHAR(50) NOT NULL,
  total_vehicles INTEGER NOT NULL DEFAULT 0,
  active_vehicles INTEGER NOT NULL DEFAULT 0,
  total_fuel_level DECIMAL(10,2) DEFAULT 0,
  average_fuel_percentage DECIMAL(5,2) DEFAULT 0,
  vehicles_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_activity_snapshots_date ON energy_rite_activity_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_activity_snapshots_time_slot ON energy_rite_activity_snapshots(time_slot);
CREATE INDEX IF NOT EXISTS idx_activity_snapshots_time ON energy_rite_activity_snapshots(snapshot_time);