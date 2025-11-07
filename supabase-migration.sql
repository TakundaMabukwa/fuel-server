-- EnergyRite Supabase Migration Script
-- Run this in Supabase SQL Editor

-- Enable Row Level Security
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Create energy_rite_fuel_data table (main real-time data table)
CREATE TABLE IF NOT EXISTS energy_rite_fuel_data (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(50),
    pocsagstr TEXT,
    message_date TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(100),
    fuel_probe_1_level NUMERIC(10,2),
    fuel_probe_1_volume_in_tank NUMERIC(10,2),
    fuel_probe_1_temperature NUMERIC(10,2),
    fuel_probe_1_level_percentage NUMERIC(5,2),
    speed NUMERIC(10,2),
    latitude NUMERIC(12,8),
    longitude NUMERIC(12,8),
    mileage NUMERIC(15,2),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_reports table
CREATE TABLE IF NOT EXISTS energy_rite_reports (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    report_date DATE,
    total_usage NUMERIC(15,2),
    total_cost NUMERIC(15,2),
    report_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_executive_dashboard table
CREATE TABLE IF NOT EXISTS energy_rite_executive_dashboard (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    dashboard_date DATE,
    total_vehicles INTEGER,
    active_vehicles INTEGER,
    total_fuel_usage NUMERIC(15,2),
    dashboard_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_daily_reports table
CREATE TABLE IF NOT EXISTS energy_rite_daily_reports (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    report_date DATE,
    vehicle_count INTEGER,
    total_fuel_usage NUMERIC(15,2),
    report_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_daily_snapshots table
CREATE TABLE IF NOT EXISTS energy_rite_daily_snapshots (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100) NOT NULL,
    company VARCHAR(100),
    snapshot_date DATE NOT NULL,
    snapshot_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch, snapshot_date)
);

-- Create energy_rite_activity_log table
CREATE TABLE IF NOT EXISTS energy_rite_activity_log (
    id BIGSERIAL PRIMARY KEY,
    activity_type VARCHAR(100),
    description TEXT,
    user_id VARCHAR(100),
    branch VARCHAR(100),
    activity_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_monthly_reports table
CREATE TABLE IF NOT EXISTS energy_rite_monthly_reports (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    report_month INTEGER,
    report_year INTEGER,
    total_fuel_usage NUMERIC(15,2),
    total_cost NUMERIC(15,2),
    report_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_fuel_anomalies table
CREATE TABLE IF NOT EXISTS energy_rite_fuel_anomalies (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(50),
    anomaly_type VARCHAR(100),
    anomaly_date TIMESTAMPTZ,
    fuel_before NUMERIC(10,2),
    fuel_after NUMERIC(10,2),
    difference NUMERIC(10,2),
    severity VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    anomaly_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_dashboard_summary table
CREATE TABLE IF NOT EXISTS energy_rite_dashboard_summary (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    summary_date DATE,
    summary_type VARCHAR(100),
    summary_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_site_performance table
CREATE TABLE IF NOT EXISTS energy_rite_site_performance (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100),
    company VARCHAR(100),
    performance_date DATE,
    efficiency_score NUMERIC(5,2),
    fuel_efficiency NUMERIC(10,2),
    performance_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_operating_sessions table
CREATE TABLE IF NOT EXISTS energy_rite_operating_sessions (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(50),
    session_start TIMESTAMPTZ,
    session_end TIMESTAMPTZ,
    duration_minutes INTEGER,
    fuel_consumed NUMERIC(10,2),
    distance_traveled NUMERIC(10,2),
    session_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_report_documents table
CREATE TABLE IF NOT EXISTS energy_rite_report_documents (
    id BIGSERIAL PRIMARY KEY,
    report_name VARCHAR(255),
    report_type VARCHAR(100),
    branch VARCHAR(100),
    company VARCHAR(100),
    file_path TEXT,
    file_size BIGINT,
    report_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energy_rite_report_docs table
CREATE TABLE IF NOT EXISTS energy_rite_report_docs (
    id BIGSERIAL PRIMARY KEY,
    document_name VARCHAR(255),
    document_type VARCHAR(100),
    branch VARCHAR(100),
    company VARCHAR(100),
    document_path TEXT,
    document_size BIGINT,
    document_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create energyrite_emails table
CREATE TABLE IF NOT EXISTS energyrite_emails (
    id BIGSERIAL PRIMARY KEY,
    recipient_email VARCHAR(255),
    subject VARCHAR(500),
    body TEXT,
    email_type VARCHAR(100),
    branch VARCHAR(100),
    company VARCHAR(100),
    sent_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fuel_data_plate ON energy_rite_fuel_data(plate);
CREATE INDEX IF NOT EXISTS idx_fuel_data_date ON energy_rite_fuel_data(message_date);
CREATE INDEX IF NOT EXISTS idx_fuel_data_branch ON energy_rite_fuel_data(plate, message_date);

CREATE INDEX IF NOT EXISTS idx_reports_branch ON energy_rite_reports(branch);
CREATE INDEX IF NOT EXISTS idx_reports_date ON energy_rite_reports(report_date);

CREATE INDEX IF NOT EXISTS idx_anomalies_plate ON energy_rite_fuel_anomalies(plate);
CREATE INDEX IF NOT EXISTS idx_anomalies_date ON energy_rite_fuel_anomalies(anomaly_date);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON energy_rite_fuel_anomalies(status);

CREATE INDEX IF NOT EXISTS idx_daily_reports_branch ON energy_rite_daily_reports(branch);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON energy_rite_daily_reports(report_date);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_branch ON energy_rite_monthly_reports(branch);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON energy_rite_monthly_reports(report_year, report_month);

-- Create indexes for daily snapshots table
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_company ON energy_rite_daily_snapshots(company);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch_date ON energy_rite_daily_snapshots(branch, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_cost_code ON energy_rite_daily_snapshots USING GIN ((snapshot_data->>'cost_code'));

CREATE INDEX IF NOT EXISTS idx_emails_status ON energyrite_emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_branch ON energyrite_emails(branch);

-- Create indexes for generated reports table
CREATE INDEX IF NOT EXISTS idx_generated_reports_cost_code ON energy_rite_generated_reports(cost_code);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type_date ON energy_rite_generated_reports(report_type, report_date);

-- Enable Row Level Security on all tables
ALTER TABLE energy_rite_fuel_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_executive_dashboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_fuel_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_dashboard_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_site_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_operating_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_report_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_report_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energyrite_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_generated_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all operations for now - customize based on your auth requirements)
CREATE POLICY "Allow all operations" ON energy_rite_fuel_data FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_reports FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_executive_dashboard FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_daily_reports FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_daily_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_activity_log FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_monthly_reports FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_fuel_anomalies FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_dashboard_summary FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_site_performance FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_operating_sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_report_documents FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_report_docs FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energyrite_emails FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON energy_rite_generated_reports FOR ALL USING (true);

-- Create RPC function for branch statistics (example of complex aggregation)
CREATE OR REPLACE FUNCTION get_branch_statistics()
RETURNS TABLE (
    branch VARCHAR(100),
    count BIGINT,
    avg_usage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.branch,
        COUNT(*) as count,
        AVG(r.total_usage) as avg_usage
    FROM energy_rite_reports r
    GROUP BY r.branch;
END;
$$ LANGUAGE plpgsql;