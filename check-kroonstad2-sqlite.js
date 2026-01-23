const pendingFuelDb = require('./pending-fuel-db');

console.log('🔍 Checking SQLite for KROONSTAD2 fuel data...\n');

// Initialize database
pendingFuelDb.initDatabase();

// Get last 10 fuel entries for KROONSTAD2
const db = pendingFuelDb.db;
const rows = db.prepare(`
  SELECT plate, fuel_volume, fuel_percentage, loc_time, timestamp 
  FROM fuel_history 
  WHERE plate = 'KROONSTAD2' 
  ORDER BY timestamp DESC 
  LIMIT 10
`).all();

if (rows.length === 0) {
  console.log('❌ No fuel data found for KROONSTAD2 in SQLite');
} else {
  console.log(`✅ Found ${rows.length} fuel entries for KROONSTAD2:\n`);
  rows.forEach((row, idx) => {
    const date = new Date(row.timestamp);
    console.log(`${idx + 1}. ${row.loc_time} - ${row.fuel_volume}L (${row.fuel_percentage}%) - ${date.toISOString()}`);
  });
}

// Close database
pendingFuelDb.closeDatabase();
