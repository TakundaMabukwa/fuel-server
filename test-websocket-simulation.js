require('dotenv').config();
const EnergyRiteWebSocketClient = require('./websocket-client');

async function testWebSocketSimulation() {
  console.log('🧪 Testing WebSocket Data Processing Simulation...\n');
  
  // Create a test WebSocket client (dummy mode)
  const wsClient = new EnergyRiteWebSocketClient('dummy');
  
  // Test vehicle data
  const testVehicle = 'KROONSTAD2';
  
  try {
    console.log('🚗 Testing vehicle:', testVehicle);
    
    // 1. Test ENGINE ON detection
    console.log('\n🟢 Simulating ENGINE ON message...');
    const engineOnMessage = {
      Plate: testVehicle,
      DriverName: 'ENGINE ON',
      fuel_probe_1_level: '180.5',
      fuel_probe_1_level_percentage: '85.2',
      fuel_probe_1_volume_in_tank: '200',
      fuel_probe_1_temperature: '24.5',
      Quality: '12345'
    };
    
    await wsClient.processVehicleUpdate(engineOnMessage);
    console.log('✅ ENGINE ON processed');
    
    // 2. Wait and simulate some operation
    console.log('\n⏳ Simulating 3 seconds of operation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Test FUEL FILL detection
    console.log('\n⛽ Simulating FUEL FILL message...');
    const fuelFillMessage = {
      Plate: testVehicle,
      DriverName: 'POSSIBLE FUEL FILL',
      fuel_probe_1_level: '180.5',
      fuel_probe_1_level_percentage: '85.2',
      fuel_probe_1_volume_in_tank: '200',
      fuel_probe_1_temperature: '24.5',
      Quality: '12345'
    };
    
    await wsClient.processVehicleUpdate(fuelFillMessage);
    console.log('✅ FUEL FILL START processed');
    
    // 4. Simulate fuel fill completion
    console.log('\n⛽ Simulating fuel fill completion...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const fuelFillEndMessage = {
      Plate: testVehicle,
      DriverName: 'Normal Operation',
      fuel_probe_1_level: '230.8',
      fuel_probe_1_level_percentage: '95.4',
      fuel_probe_1_volume_in_tank: '240',
      fuel_probe_1_temperature: '24.8',
      Quality: '12345'
    };
    
    await wsClient.processVehicleUpdate(fuelFillEndMessage);
    console.log('✅ FUEL FILL END processed');
    
    // 5. Continue operation
    console.log('\n⏳ Simulating 2 more seconds of operation...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 6. Test ENGINE OFF detection
    console.log('\n🔴 Simulating ENGINE OFF message...');
    const engineOffMessage = {
      Plate: testVehicle,
      DriverName: 'ENGINE OFF',
      fuel_probe_1_level: '225.2',
      fuel_probe_1_level_percentage: '93.1',
      fuel_probe_1_volume_in_tank: '235',
      fuel_probe_1_temperature: '25.1',
      Quality: '12345'
    };
    
    await wsClient.processVehicleUpdate(engineOffMessage);
    console.log('✅ ENGINE OFF processed');
    
    // 7. Check results
    console.log('\n📊 Checking database results...');
    
    const { supabase } = require('./supabase-client');
    
    // Get recent sessions for this vehicle
    const { data: sessions, error: sessionsError } = await supabase
      .from('energy_rite_operating_sessions')
      .select('*')
      .eq('branch', testVehicle)
      .gte('session_start_time', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .order('session_start_time', { ascending: false });
    
    if (sessionsError) {
      console.error('❌ Error fetching sessions:', sessionsError);
      return;
    }
    
    console.log(`\n🔧 Recent Sessions (${sessions.length}):`);
    sessions.forEach((session, index) => {
      console.log(`\n  Session ${index + 1}:`);
      console.log(`    Status: ${session.session_status}`);
      console.log(`    Duration: ${session.operating_hours?.toFixed(3) || 'N/A'}h`);
      console.log(`    Opening Fuel: ${session.opening_fuel}L`);
      console.log(`    Closing Fuel: ${session.closing_fuel || 'N/A'}L`);
      console.log(`    Usage: ${session.total_usage?.toFixed(1) || 'N/A'}L`);
      console.log(`    Fill: ${session.total_fill || 0}L`);
      console.log(`    Fill Events: ${session.fill_events || 0}`);
      console.log(`    Notes: ${session.notes || 'N/A'}`);
    });
    
    // Get recent activity logs
    const { data: activities, error: activitiesError } = await supabase
      .from('energy_rite_activity_log')
      .select('*')
      .eq('branch', testVehicle)
      .gte('activity_time', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .order('activity_time', { ascending: false });
    
    if (activitiesError) {
      console.error('❌ Error fetching activities:', activitiesError);
      return;
    }
    
    console.log(`\n📝 Recent Activity Log (${activities.length} entries):`);
    activities.forEach((activity, index) => {
      const time = new Date(activity.activity_time).toLocaleTimeString();
      console.log(`  ${index + 1}. ${activity.activity_type} at ${time} - ${activity.notes}`);
    });
    
    // Get recent fuel data
    const { data: fuelData, error: fuelError } = await supabase
      .from('energy_rite_fuel_data')
      .select('*')
      .eq('plate', testVehicle)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (fuelError) {
      console.error('❌ Error fetching fuel data:', fuelError);
      return;
    }
    
    console.log(`\n⛽ Recent Fuel Data (${fuelData.length} entries):`);
    fuelData.forEach((fuel, index) => {
      const time = new Date(fuel.created_at).toLocaleTimeString();
      console.log(`  ${index + 1}. ${fuel.fuel_probe_1_level}L (${fuel.fuel_probe_1_level_percentage}%) at ${time}`);
    });
    
    console.log('\n✅ WebSocket simulation completed successfully!');
    
    // Summary
    const engineSessions = sessions.filter(s => s.session_status === 'COMPLETED');
    const fuelFillSessions = sessions.filter(s => s.session_status === 'FUEL_FILL_COMPLETED');
    const ongoingSessions = sessions.filter(s => s.session_status === 'ONGOING');
    
    console.log('\n📈 Summary:');
    console.log(`  - Engine Sessions Completed: ${engineSessions.length}`);
    console.log(`  - Fuel Fill Sessions Completed: ${fuelFillSessions.length}`);
    console.log(`  - Ongoing Sessions: ${ongoingSessions.length}`);
    console.log(`  - Activity Log Entries: ${activities.length}`);
    console.log(`  - Fuel Data Points: ${fuelData.length}`);
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
  }
}

// Test parsing functions
function testParsingFunctions() {
  console.log('\n🧪 Testing Parsing Functions...\n');
  
  const wsClient = new EnergyRiteWebSocketClient('dummy');
  
  // Test engine status parsing
  const engineTestCases = [
    'ENGINE ON',
    'ENGINE OFF',
    'PTO ON',
    'PTO OFF',
    'Normal Operation',
    'POSSIBLE FUEL FILL',
    '',
    null
  ];
  
  console.log('🔧 Engine Status Parsing:');
  engineTestCases.forEach(testCase => {
    const result = wsClient.parseEngineStatus(testCase);
    console.log(`  "${testCase}" → ${result || 'null'}`);
  });
  
  // Test fuel fill status parsing
  const fuelTestCases = [
    'POSSIBLE FUEL FILL',
    'FUEL FILL',
    'REFUEL',
    'FILLING',
    'ENGINE ON',
    'ENGINE OFF',
    'Normal Operation',
    '',
    null
  ];
  
  console.log('\n⛽ Fuel Fill Status Parsing:');
  fuelTestCases.forEach(testCase => {
    const result = wsClient.parseFuelFillStatus(testCase);
    console.log(`  "${testCase}" → ${result || 'null'}`);
  });
}

// Run tests
if (require.main === module) {
  console.log('🚀 Starting WebSocket Functionality Tests...\n');
  
  testParsingFunctions();
  
  testWebSocketSimulation().then(() => {
    console.log('\n🎉 All tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Tests failed:', error);
    process.exit(1);
  });
}

module.exports = { testWebSocketSimulation, testParsingFunctions };