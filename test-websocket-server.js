const WebSocket = require('ws');

class TestWebSocketServer {
  constructor(port = 8006) {
    this.port = port;
    this.wss = null;
    this.clients = new Set();
    this.testData = {
      plate: 'TESTSITE',
      baseData: {
        Speed: 0,
        Latitude: -26.004057,
        Longitude: 28.17784,
        LocTime: "4057",
        Quality: "60.115.1.10",
        Mileage: null,
        Pocsagstr: "",
        Head: "",
        Geozone: "Test Location, South Africa",
        DriverName: "",
        NameEvent: "",
        Temperature: "25,405,1004,2020,093F,2021,1404,2022,1B,2023,5E",
        fuel_probe_1_level: 150.0,
        fuel_probe_1_volume_in_tank: 300.0,
        fuel_probe_1_temperature: 25,
        fuel_probe_1_level_percentage: 75,
        message_type: 405
      }
    };
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });
    
    this.wss.on('connection', (ws) => {
      console.log(`🔌 Test client connected to port ${this.port}`);
      this.clients.add(ws);
      
      ws.on('close', () => {
        console.log('🔌 Test client disconnected');
        this.clients.delete(ws);
      });
    });

    console.log(`🧪 Test WebSocket server running on port ${this.port}`);
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Simulate engine start
  startEngineSession() {
    console.log('🟢 Starting engine session test...');
    
    // Send engine ON message (speed > 0)
    const engineOnData = {
      ...this.testData.baseData,
      Plate: this.testData.plate,
      Speed: 25,
      DriverName: "ENGINE ON"
    };
    
    this.broadcast(engineOnData);
    console.log('📤 Sent ENGINE ON message');
  }

  // Simulate engine stop after delay
  stopEngineSession(delayMs = 300000) { // 5 minutes default
    console.log(`🔴 Will stop engine session in ${delayMs/1000} seconds...`);
    
    setTimeout(() => {
      const engineOffData = {
        ...this.testData.baseData,
        Plate: this.testData.plate,
        Speed: 0,
        DriverName: "ENGINE OFF",
        fuel_probe_1_level: 145.0, // 5L consumed
        fuel_probe_1_level_percentage: 73
      };
      
      this.broadcast(engineOffData);
      console.log('📤 Sent ENGINE OFF message');
    }, delayMs);
  }

  // Simulate fuel fill
  simulateFuelFill() {
    console.log('⛽ Starting fuel fill simulation...');
    
    // Start fuel fill
    const fuelFillStart = {
      ...this.testData.baseData,
      Plate: this.testData.plate,
      Speed: 0,
      DriverName: "POSSIBLE FUEL FILL",
      fuel_probe_1_level: 100.0,
      fuel_probe_1_level_percentage: 50
    };
    
    this.broadcast(fuelFillStart);
    console.log('📤 Sent FUEL FILL START message');
    
    // End fuel fill after 30 seconds
    setTimeout(() => {
      const fuelFillEnd = {
        ...this.testData.baseData,
        Plate: this.testData.plate,
        Speed: 0,
        DriverName: "",
        fuel_probe_1_level: 180.0, // 80L filled
        fuel_probe_1_level_percentage: 90
      };
      
      this.broadcast(fuelFillEnd);
      console.log('📤 Sent FUEL FILL END message');
    }, 30000);
  }

  // Run complete test scenario
  runTestScenario() {
    console.log('🧪 Starting complete test scenario...');
    
    // 1. Start engine session
    setTimeout(() => this.startEngineSession(), 2000);
    
    // 2. Simulate fuel fill during session (after 1 minute)
    setTimeout(() => this.simulateFuelFill(), 62000);
    
    // 3. Stop engine session (after 5 minutes)
    setTimeout(() => {
      const engineOffData = {
        ...this.testData.baseData,
        Plate: this.testData.plate,
        Speed: 0,
        DriverName: "ENGINE OFF",
        fuel_probe_1_level: 175.0, // Some fuel consumed after fill
        fuel_probe_1_level_percentage: 88
      };
      
      this.broadcast(engineOffData);
      console.log('📤 Sent ENGINE OFF message (end of test)');
    }, 302000);
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      console.log('🛑 Test WebSocket server stopped');
    }
  }
}

// CLI interface
if (require.main === module) {
  const server = new TestWebSocketServer();
  server.start();
  
  // Handle CLI commands
  process.stdin.setEncoding('utf8');
  console.log('\n📋 Available commands:');
  console.log('  start - Start engine session');
  console.log('  stop - Stop engine session');
  console.log('  fill - Simulate fuel fill');
  console.log('  test - Run complete test scenario');
  console.log('  quit - Exit\n');
  
  process.stdin.on('data', (input) => {
    const command = input.trim().toLowerCase();
    
    switch (command) {
      case 'start':
        server.startEngineSession();
        server.stopEngineSession(300000); // Auto-stop after 5 minutes
        break;
      case 'stop':
        server.stopEngineSession(1000); // Stop after 1 second
        break;
      case 'fill':
        server.simulateFuelFill();
        break;
      case 'test':
        server.runTestScenario();
        break;
      case 'quit':
      case 'exit':
        server.stop();
        process.exit(0);
        break;
      default:
        console.log('❌ Unknown command. Available: start, stop, fill, test, quit');
    }
  });
}

module.exports = TestWebSocketServer;