-- Table to persist pending fuel fill states (survives server restarts)
CREATE TABLE IF NOT EXISTS pending_fuel_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate VARCHAR(100) NOT NULL,
  watcher_type VARCHAR(50) NOT NULL, -- 'pre_fill', 'fuel_fill_watcher', 'pending_fill'
  
  -- Common fields
  start_time TIMESTAMPTZ,
  start_loc_time VARCHAR(50),
  
  -- Opening fuel (for pending_fill and fuel_fill_watcher)
  opening_fuel DECIMAL(10,2),
  opening_percentage DECIMAL(5,2),
  
  -- For pre_fill watcher - tracks lowest before fill
  lowest_fuel DECIMAL(10,2),
  lowest_percentage DECIMAL(5,2),
  lowest_loc_time VARCHAR(50),
  
  -- For fuel_fill_watcher - tracks highest after fill status disappears
  highest_fuel DECIMAL(10,2),
  highest_percentage DECIMAL(5,2),
  highest_loc_time VARCHAR(50),
  
  -- For pending_fill waiting state
  waiting_for_opening_fuel BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  last_update TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one active state per plate per type
  UNIQUE(plate, watcher_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pending_fuel_states_plate ON pending_fuel_states(plate);
CREATE INDEX IF NOT EXISTS idx_pending_fuel_states_type ON pending_fuel_states(watcher_type);
CREATE INDEX IF NOT EXISTS idx_pending_fuel_states_last_update ON pending_fuel_states(last_update);

-- Auto-cleanup old records (optional - run periodically)
-- DELETE FROM pending_fuel_states WHERE last_update < NOW() - INTERVAL '1 hour';
