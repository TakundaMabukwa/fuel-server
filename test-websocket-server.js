const WebSocket = require('ws');

class TestWebSocketServer {
  constructor(port = 8006) {
    this.port = port;
    this.server = null;
    this.clients = new Set();
    this.vehicles = [
      { plate: 'KEYWEST', fuel: 121.6, percentage: 50 },
      { plate: 'ALEX', fuel: 185.7, percentage: 84 },
      { plate: 'BLOEM2', fuel: 315, percentage: 100 },
      { plate: 'DURBANVILL', fuel: 200, percentage: 75 },
      { plate: 'BERGBRON', fuel: 150, percentage: 60 }
    ];
  }

  start() {
    try {
      this.server = new WebSocket.Server({ port: this.port });
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${this.port} already in use, skipping server start`);
        return;
      }
      throw error;
    }
    
    this.server.on('connection', (ws) => {
      console.log(`✅ Client connected to test server on port ${this.port}`);
      this.clients.add(ws);
      
      ws.on('close', () => {
        console.log('❌ Client disconnected from test server');
        this.clients.delete(ws);
      });
    });

    console.log(`🚀 Test WebSocket server started on port ${this.port}`);
    this.startDataSimulation();
  }

  startDataSimulation() {
    let step = 0;
    
    setInterval(() => {
      step++;
      
      this.vehicles.forEach((vehicle, index) => {
        let driverName = '';
        let fuelChange = 0;
        
        // Simulate fuel fill for KEYWEST every 30 steps
        if (vehicle.plate === 'KEYWEST') {
          if (step % 30 === 5) {
            driverName = 'Possible Fuel Fill Detected';
          } else if (step % 30 >= 6 && step % 30 <= 15) {
            driverName = 'Fuel Fill In Progress';
            fuelChange = Math.random() * 3 + 1; // 1-4L increase
          } else if (step % 30 === 16) {
            driverName = 'Normal Operation';
          }
        }
        
        // Simulate fuel consumption for all vehicles
        if (!driverName.includes('Fill')) {
          fuelChange = -(Math.random() * 0.5); // Small consumption
        }
        
        vehicle.fuel += fuelChange;
        vehicle.fuel = Math.max(10, Math.min(350, vehicle.fuel));
        vehicle.percentage = Math.round((vehicle.fuel / 350) * 100);
        
        const message = {
          Plate: vehicle.plate,
          Speed: Math.floor(Math.random() * 60),
          Latitude: -26.088094 + (Math.random() - 0.5) * 0.1,
          Longitude: 27.782602 + (Math.random() - 0.5) * 0.1,
          LocTime: Date.now().toString(),
          Quality: "61.13.2.21",
          Mileage: null,
          Pocsagstr: "",
          Head: "",
          Geozone: "Test Location, Johannesburg, South Africa",
          DriverName: driverName,
          NameEvent: "",
          Temperature: "25,405,1004,2020,0741,2021,05A5,2022,14,2023,54",
          fuel_probe_1_level: parseFloat(vehicle.fuel.toFixed(1)),
          fuel_probe_1_volume_in_tank: vehicle.fuel * 2,
          fuel_probe_1_temperature: 20 + Math.random() * 10,
          fuel_probe_1_level_percentage: vehicle.percentage,
          message_type: 405
        };
        
        this.broadcast(JSON.stringify(message));
      });
      
    }, 3000); // Every 3 seconds
  }

  broadcast(message) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

const testServer = new TestWebSocketServer(8006);
testServer.start();