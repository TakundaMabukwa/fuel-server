-- Create energy_rite_generated_reports table
CREATE TABLE IF NOT EXISTS energy_rite_generated_reports (
  id SERIAL PRIMARY KEY,
  cost_code VARCHAR(50) NOT NULL,
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  report_url TEXT NOT NULL,
  report_date DATE NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  file_size INTEGER,
  status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'expired', 'error')),
  
  -- Composite unique constraint to prevent duplicate reports
  UNIQUE(cost_code, report_type, report_date)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_generated_reports_cost_code ON energy_rite_generated_reports(cost_code);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type_date ON energy_rite_generated_reports(report_type, report_date);

-- Enable Row Level Security
ALTER TABLE energy_rite_generated_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations" ON energy_rite_generated_reports FOR ALL USING (true);