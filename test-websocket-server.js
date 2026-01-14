const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8090 });

console.log('🧪 Test WebSocket Server running on ws://localhost:8090');
console.log('⏱️  Server will auto-stop in 5 minutes\n');

// Auto-stop after 5 minutes
setTimeout(() => {
  console.log('\n⏰ 5 minutes elapsed - shutting down test server');
  wss.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
}, 300000);

const vehicles = [
  { Plate: 'TEST-001', Latitude: -26.13608, Longitude: 28.34938, Mileage: 100, fuelLevel: 150, fuelVolume: 450 },
  { Plate: 'TEST-002', Latitude: -26.07517, Longitude: 28.06441, Mileage: 200, fuelLevel: 200, fuelVolume: 600 }
];

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

  // Simulate ENGINE ON scenario (status without fuel, then fuel data)
  setTimeout(() => {
    console.log('\n🚗 Simulating ENGINE ON for TEST-001...');
    
    // Message 1: ENGINE ON status (no fuel data)
    const engineOnMsg = {
      Plate: 'TEST-001',
      Speed: 0,
      Latitude: -26.13608,
      Longitude: 28.34938,
      Quality: '53.15.1.99',
      Mileage: 100,
      Pocsagstr: '53.15.1.99',
      Head: '',
      Geozone: '',
      DriverName: 'ENGINE ON',
      NameEvent: '',
      Temperature: '',
      LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      message_type: 405
    };
    ws.send(JSON.stringify(engineOnMsg));
    console.log('📤 Sent ENGINE ON (no fuel)');

    // Message 2: Fuel data arrives 2 seconds later
    setTimeout(() => {
      const fuelMsg = {
        Plate: 'TEST-001',
        Speed: 0,
        Latitude: -26.13608,
        Longitude: 28.34938,
        Quality: '53.15.1.99',
        Mileage: 100,
        Pocsagstr: '53.15.1.99',
        Head: '',
        Geozone: '',
        DriverName: '',
        NameEvent: '',
        Temperature: '25,405,1007,2020,0960,2021,1C20,2022,18,2023,5A',
        LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        message_type: 405,
        fuel_probe_1_level: '150.0',
        fuel_probe_1_volume_in_tank: '450.0',
        fuel_probe_1_temperature: '24',
        fuel_probe_1_level_percentage: '75'
      };
      ws.send(JSON.stringify(fuelMsg));
      console.log('📤 Sent fuel data (150L)');
    }, 2000);
  }, 3000);

  // Simulate FUEL FILL scenario
  setTimeout(() => {
    console.log('\n⛽ Simulating FUEL FILL for TEST-002...');
    
    // Message 1: FUEL FILL status (no fuel data)
    const fuelFillMsg = {
      Plate: 'TEST-002',
      Speed: 0,
      Latitude: -26.07517,
      Longitude: 28.06441,
      Quality: '60.115.1.14',
      Mileage: 200,
      Pocsagstr: '60.115.1.14',
      Head: '',
      Geozone: '',
      DriverName: 'FUEL FILL',
      NameEvent: '',
      Temperature: '',
      LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      message_type: 405
    };
    ws.send(JSON.stringify(fuelFillMsg));
    console.log('📤 Sent FUEL FILL (no fuel)');

    // Simulate fuel rising over 5 minutes
    let currentFuel = 200;
    const interval = setInterval(() => {
      currentFuel += 20; // Fuel rising
      const fuelMsg = {
        Plate: 'TEST-002',
        Speed: 0,
        Latitude: -26.07517,
        Longitude: 28.06441,
        Quality: '60.115.1.14',
        Mileage: 200,
        Pocsagstr: '60.115.1.14',
        Head: '',
        Geozone: '',
        DriverName: '',
        NameEvent: '',
        Temperature: `25,405,1007,2020,${currentFuel.toString(16).toUpperCase().padStart(4, '0')},2021,1C20,2022,18,2023,5A`,
        LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        message_type: 405,
        fuel_probe_1_level: currentFuel.toString(),
        fuel_probe_1_volume_in_tank: (currentFuel * 3).toString(),
        fuel_probe_1_temperature: '24',
        fuel_probe_1_level_percentage: Math.min(99, Math.floor(currentFuel / 3)).toString()
      };
      ws.send(JSON.stringify(fuelMsg));
      console.log(`📤 Sent fuel data (${currentFuel}L)`);

      if (currentFuel >= 300) {
        clearInterval(interval);
        console.log('✅ Fuel fill complete - highest: 300L');
      }
    }, 30000); // Every 30 seconds
  }, 10000);

  // Simulate ENGINE OFF scenario
  setTimeout(() => {
    console.log('\n🛑 Simulating ENGINE OFF for TEST-001...');
    
    // Message 1: ENGINE OFF status (no fuel data)
    const engineOffMsg = {
      Plate: 'TEST-001',
      Speed: 0,
      Latitude: -26.13608,
      Longitude: 28.34938,
      Quality: '53.15.1.99',
      Mileage: 150,
      Pocsagstr: '53.15.1.99',
      Head: '',
      Geozone: '',
      DriverName: 'ENGINE OFF',
      NameEvent: '',
      Temperature: '',
      LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      message_type: 405
    };
    ws.send(JSON.stringify(engineOffMsg));
    console.log('📤 Sent ENGINE OFF (no fuel)');

    // Message 2: Fuel data arrives 2 seconds later
    setTimeout(() => {
      const fuelMsg = {
        Plate: 'TEST-001',
        Speed: 0,
        Latitude: -26.13608,
        Longitude: 28.34938,
        Quality: '53.15.1.99',
        Mileage: 150,
        Pocsagstr: '53.15.1.99',
        Head: '',
        Geozone: '',
        DriverName: '',
        NameEvent: '',
        Temperature: '25,405,1007,2020,0870,2021,1900,2022,18,2023,5A',
        LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        message_type: 405,
        fuel_probe_1_level: '135.0',
        fuel_probe_1_volume_in_tank: '400.0',
        fuel_probe_1_temperature: '24',
        fuel_probe_1_level_percentage: '67'
      };
      ws.send(JSON.stringify(fuelMsg));
      console.log('📤 Sent fuel data (135L) - consumed 15L');
    }, 2000);
  }, 180000); // 3 minutes after ENGINE ON

  ws.on('close', () => {
    console.log('❌ Client disconnected');
  });
});
