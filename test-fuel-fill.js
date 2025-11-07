require('dotenv').config();
const EnergyRiteWebSocketClient = require('./websocket-client');
const { detectFuelFill } = require('./helpers/fuel-fill-detector');
const { supabase } = require('./supabase-client');

async function testFuelFill() {
  try {
    console.log('⛽ Testing fuel fill detection...\n');
    
    const wsClient = new EnergyRiteWebSocketClient('dummy-url');
    
    // Test 1: Status-based detection
    console.log('🔍 Test 1: Status-based detection');
    const testData1 = {
      Plate: 'TEST-VEHICLE-1',
      DriverName: 'Possible Fuel Fill',
      fuel_probe_1_level: 150.5,
      fuel_probe_1_volume_in_tank: 500,
      fuel_probe_1_temperature: 25,
      fuel_probe_1_level_percentage: 75,
      Pocsagstr: 'TEST123'
    };
    
    const status1 = wsClient.parseEngineStatus(testData1.DriverName);
    console.log(`   Parsed status: ${status1}`);
    
    if (status1 === 'FUEL_FILL') {
      console.log('   ✅ Status-based fuel fill detected correctly!');
    } else {
      console.log('   ❌ Status-based fuel fill not detected');
    }
    
    // Test 2: Level-based detection
    console.log('\n🔍 Test 2: Level-based detection');
    
    // Insert initial fuel level
    await supabase.from('energy_rite_fuel_data').insert({
      plate: 'TEST-VEHICLE-2',
      fuel_probe_1_level: 50.0,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    });
    
    // Insert higher fuel level (simulating fill)
    await supabase.from('energy_rite_fuel_data').insert({
      plate: 'TEST-VEHICLE-2',
      fuel_probe_1_level: 180.0, // +130L increase
      created_at: new Date().toISOString()
    });
    
    const fillResult = await detectFuelFill('TEST-VEHICLE-2', 180.0, 'Normal Operation');
    
    if (fillResult.isFill) {
      console.log('   ✅ Level-based fuel fill detected!');
      console.log(`   Fill Amount: ${fillResult.fillDetails.fillAmount.toFixed(1)}L`);
      console.log(`   Detection Method: ${fillResult.fillDetails.detectionMethod}`);
    } else {
      console.log('   ❌ Level-based fuel fill not detected');
      console.log(`   Reason: ${fillResult.reason}`);
    }
    
    // Test 3: WebSocket processing
    console.log('\n🔍 Test 3: WebSocket processing');
    
    const testData3 = {
      Plate: 'TEST-VEHICLE-3',
      DriverName: 'Possible Fuel Fill',
      fuel_probe_1_level: 200.0
    };
    
    await wsClient.processVehicleUpdate(testData3);
    console.log('   ✅ WebSocket processing completed');
    
    // Check results
    console.log('\n📋 Checking fuel fill logs...');
    
    const { data: fills, error } = await supabase
      .from('energy_rite_fuel_fills')
      .select('*')
      .in('plate', ['TEST-VEHICLE-1', 'TEST-VEHICLE-2', 'TEST-VEHICLE-3'])
      .order('fill_date', { ascending: false });
    
    if (error) {
      console.log('   ⚠️  Fuel fills table might not exist. Run: create-fuel-fills-table.sql');
    } else {
      console.log(`   Found ${fills.length} fuel fill records:`);
      fills.forEach((fill, index) => {
        console.log(`   ${index + 1}. ${fill.plate}: +${fill.fill_amount}L (${fill.detection_method})`);
      });
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await supabase.from('energy_rite_fuel_data').delete().in('plate', ['TEST-VEHICLE-1', 'TEST-VEHICLE-2', 'TEST-VEHICLE-3']);
    await supabase.from('energy_rite_fuel_fills').delete().in('plate', ['TEST-VEHICLE-1', 'TEST-VEHICLE-2', 'TEST-VEHICLE-3']);
    await supabase.from('energy_rite_activity_log').delete().in('branch', ['TEST-VEHICLE-1', 'TEST-VEHICLE-2', 'TEST-VEHICLE-3']);
    
    console.log('\n🎉 Fuel fill detection test completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testFuelFill();