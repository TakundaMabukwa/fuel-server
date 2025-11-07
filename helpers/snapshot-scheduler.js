const cron = require('node-cron');
const { supabase } = require('../supabase-client');

// Function to capture daily snapshots at specific times
async function captureScheduledSnapshot(snapshotType) {
  try {
    const currentTime = new Date();
    const currentDate = currentTime.toISOString().slice(0, 10);
    
    console.log(`📸 Starting ${snapshotType} snapshot capture at ${currentTime.toISOString()}`);
    
    // First, get site mapping with cost codes from operating sessions
    const { data: siteMappings, error: mappingError } = await supabase
      .from('energy_rite_operating_sessions')
      .select('branch, cost_code, company')
      .not('branch', 'is', null)
      .order('branch');
    
    if (mappingError) throw new Error(`Site mapping error: ${mappingError.message}`);
    
    // Create site mapping lookup
    const siteMapping = {};
    siteMappings.forEach(session => {
      if (session.branch && !siteMapping[session.branch]) {
        siteMapping[session.branch] = {
          cost_code: session.cost_code,
          company: session.company || 'KFC'
        };
      }
    });
    
    // Get all vehicles with current fuel data
    const { data: vehicles, error } = await supabase
      .from('energy_rite_fuel_data')
      .select('*')
      .not('plate', 'is', null)
      .order('plate');
    
    if (error) throw new Error(`Database error: ${error.message}`);
    
    let snapshotCount = 0;
    let activeCount = 0;
    let totalFuel = 0;
    
    // Group by plate to get latest data for each vehicle
    const latestByPlate = {};
    vehicles.forEach(vehicle => {
      if (!latestByPlate[vehicle.plate] || 
          new Date(vehicle.created_at) > new Date(latestByPlate[vehicle.plate].created_at)) {
        latestByPlate[vehicle.plate] = vehicle;
      }
    });
    
    for (const vehicle of Object.values(latestByPlate)) {
      try {
        const fuelLevel = parseFloat(vehicle.fuel_probe_1_level_percentage) || 0;
        const fuelVolume = parseFloat(vehicle.fuel_probe_1_volume_in_tank) || 0;
        const engineStatus = vehicle.status || 'UNKNOWN';
        
        // Get site information from mapping
        const siteInfo = siteMapping[vehicle.plate] || {
          cost_code: null,
          company: 'Unknown'
        };
        
        if (engineStatus === 'ON') activeCount++;
        totalFuel += fuelVolume;
        
        // Insert snapshot (simple insert without upsert to avoid constraint issues)
        const { error: insertError } = await supabase
          .from('energy_rite_daily_snapshots')
          .insert({
            snapshot_date: currentDate,
            snapshot_time: currentTime.toISOString(),
            snapshot_type: snapshotType,
            branch: vehicle.plate,
            company: siteInfo.company,
            snapshot_data: {
              fuel_level: fuelLevel,
              fuel_volume: fuelVolume,
              engine_status: engineStatus,
              cost_code: siteInfo.cost_code,
              fuel_percentage: fuelLevel,
              notes: `${snapshotType} snapshot - ${engineStatus} - Fuel: ${fuelLevel}% (${fuelVolume}L)`,
              captured_at: currentTime.toISOString()
            }
          });
        
        if (insertError) throw new Error(`Insert error: ${insertError.message}`);
        
        snapshotCount++;
      } catch (vehicleError) {
        console.error(`❌ Failed to capture snapshot for ${vehicle.plate}: ${vehicleError.message}`);
      }
    }
    
    console.log(`✅ ${snapshotType} snapshot completed:`);
    console.log(`   📊 Vehicles: ${snapshotCount} | Active: ${activeCount} | Total Fuel: ${totalFuel.toFixed(1)}L`);
    
    return {
      snapshotType,
      timestamp: currentTime,
      vehicleCount: snapshotCount,
      activeVehicles: activeCount,
      totalFuelVolume: totalFuel
    };
    
  } catch (error) {
    console.error(`❌ Failed to capture ${snapshotType} snapshot: ${error.message}`);
    throw error;
  }
}

// Function to get snapshot statistics
async function getSnapshotStatistics(date = null) {
  try {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    
    const { data: snapshots, error } = await supabase
      .from('energy_rite_daily_snapshots')
      .select('*')
      .eq('snapshot_date', targetDate)
      .order('snapshot_time');
    
    if (error) throw new Error(`Database error: ${error.message}`);
    
    // Group by snapshot type and calculate statistics
    const stats = {};
    snapshots.forEach(snapshot => {
      if (!stats[snapshot.snapshot_type]) {
        stats[snapshot.snapshot_type] = {
          snapshot_type: snapshot.snapshot_type,
          vehicle_count: 0,
          active_count: 0,
          total_fuel_volume: 0,
          avg_fuel_percentage: 0,
          snapshot_time: snapshot.snapshot_time
        };
      }
      
      const stat = stats[snapshot.snapshot_type];
      stat.vehicle_count += 1;
      if (snapshot.engine_status === 'ON') stat.active_count += 1;
      stat.total_fuel_volume += parseFloat(snapshot.fuel_level || 0);
    });
    
    // Calculate averages
    Object.values(stats).forEach(stat => {
      if (stat.vehicle_count > 0) {
        stat.avg_fuel_percentage = stat.total_fuel_volume / stat.vehicle_count;
      }
    });
    
    return Object.values(stats);
  } catch (error) {
    console.error(`❌ Failed to get snapshot statistics: ${error.message}`);
    throw error;
  }
}

// Schedule snapshots at 6:00 AM, 12:00 PM, and 6:00 PM
function startSnapshotScheduler() {
  console.log('🕕 Starting Energy Rite snapshot scheduler...');
  
  // 6:00 AM - Morning snapshot
  cron.schedule('0 6 * * *', async () => {
    await captureScheduledSnapshot('MORNING');
  }, {
    timezone: "Africa/Johannesburg"
  });
  
  // 12:00 PM - Midday snapshot  
  cron.schedule('0 12 * * *', async () => {
    await captureScheduledSnapshot('MIDDAY');
  }, {
    timezone: "Africa/Johannesburg"
  });
  
  // 6:00 PM - Evening snapshot
  cron.schedule('0 18 * * *', async () => {
    await captureScheduledSnapshot('EVENING');
  }, {
    timezone: "Africa/Johannesburg"
  });
  
  console.log('✅ Snapshot scheduler started - capturing at 06:00, 12:00, and 18:00 daily');
}

module.exports = {
  captureScheduledSnapshot,
  getSnapshotStatistics,
  startSnapshotScheduler
};