require('dotenv').config();
const EnergyRiteWebSocketClient = require('./websocket-client');

async function testFuelFill() {
  try {
    console.log('⛽ Testing fuel fill detection...\n');
    
    const wsClient = new EnergyRiteWebSocketClient('dummy-url');
    
    // Test fuel fill detection
    const testData = {
      Plate: 'TEST-VEHICLE',
      DriverName: 'Possible Fuel Fill',
      fuel_probe_1_level: 150.5,
      fuel_probe_1_volume_in_tank: 500,
      fuel_probe_1_temperature: 25,
      fuel_probe_1_level_percentage: 75,
      Pocsagstr: 'TEST123'
    };
    
    console.log('📊 Test data:', JSON.stringify(testData, null, 2));
    
    // Test the parsing
    const status = wsClient.parseEngineStatus(testData.DriverName);
    console.log(`🔍 Parsed status: ${status}`);
    
    if (status === 'FUEL_FILL') {
      console.log('✅ Fuel fill detected correctly!');
      
      // Test the fuel fill handler
      await wsClient.handleFuelFill(testData.Plate, testData);
      
      console.log('✅ Fuel fill handler executed');
    } else {
      console.log('❌ Fuel fill not detected');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testFuelFill();