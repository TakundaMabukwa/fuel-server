const WebSocket = require('ws');

// Create WebSocket server on port 8006 for testing
const wss = new WebSocket.Server({ port: 8006 });

console.log('🧪 Test WebSocket Server started on ws://localhost:8006');

const testData = [
  // 1. Engine starts
  {
    "Plate": "EBONY",
    "Speed": 0,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4055",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "ENGINE ON",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "45.0",
    "fuel_probe_1_level_percentage": "67"
  },
  // 2. Normal operation
  {
    "Plate": "EBONY",
    "Speed": 15,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4056",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "RUNNING",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "43.8",
    "fuel_probe_1_level_percentage": "65"
  },
  // 3. Fuel fill starts
  {
    "Plate": "EBONY",
    "Speed": 0,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4057",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "POSSIBLE FUEL FILL",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "42.5",
    "fuel_probe_1_level_percentage": "63"
  },
  // 4. Fuel fill ends (DriverName becomes empty)
  {
    "Plate": "EBONY",
    "Speed": 0,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4058",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "68.2",
    "fuel_probe_1_level_percentage": "95"
  },
  // 5. Continue operation
  {
    "Plate": "EBONY",
    "Speed": 20,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4059",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "RUNNING",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "67.5",
    "fuel_probe_1_level_percentage": "94"
  },
  // 6. Engine stops
  {
    "Plate": "EBONY",
    "Speed": 0,
    "Latitude": -26.004057,
    "Longitude": 28.17784,
    "LocTime": "4060",
    "Quality": "60.115.1.10",
    "Mileage": null,
    "Pocsagstr": "",
    "Head": "",
    "Geozone": "1031 29 September Dr, Ebony Park, Midrand, 1690, South Africa",
    "DriverName": "ENGINE OFF",
    "NameEvent": "",
    "Temperature": "",
    "fuel_probe_1_level": "66.8",
    "fuel_probe_1_level_percentage": "93"
  }
];

wss.on('connection', (ws) => {
  console.log('✅ Client connected to test server');
  
  let messageIndex = 0;
  
  // Send test messages every 3 seconds
  const interval = setInterval(() => {
    if (messageIndex < testData.length) {
      const message = testData[messageIndex];
      console.log(`📤 Sending message ${messageIndex + 1}/${testData.length}: ${message.DriverName || 'No status'}`);
      ws.send(JSON.stringify(message));
      messageIndex++;
    } else {
      console.log('✅ All test messages sent');
      clearInterval(interval);
    }
  }, 3000);
  
  ws.on('close', () => {
    console.log('❌ Client disconnected');
    clearInterval(interval);
  });
});

console.log('📋 Test sequence:');
console.log('1. ENGINE ON (45.0L)');
console.log('2. RUNNING (43.8L)');
console.log('3. POSSIBLE FUEL FILL (42.5L)');
console.log('4. Fill ends - empty status (68.2L) = +25.7L');
console.log('5. RUNNING (67.5L)');
console.log('6. ENGINE OFF (66.8L)');
console.log('\n🔌 Connect your client to: ws://localhost:8006');