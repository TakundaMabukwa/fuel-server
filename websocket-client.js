const WebSocket = require('ws');
const { supabase } = require('./supabase-client');
const { detectFuelTheft } = require('./helpers/fuel-theft-detector');
const axios = require('axios');

class EnergyRiteWebSocketClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect() {
    console.log(`🔌 Connecting to WebSocket: ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        // Log raw message format (first 5 messages only)
        if (!this.loggedSamples) this.loggedSamples = 0;
        if (this.loggedSamples < 5) {
          console.log('📨 WebSocket message format:', JSON.stringify(message, null, 2));
          this.loggedSamples++;
        }
        
        // Process energyrite parsed data
        if (message.Plate) {
          await this.processVehicleUpdate(message);
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket disconnected');
      this.reconnect();
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  async processVehicleUpdate(vehicleData) {
    try {
      console.log(`📊 Processing vehicle data for ${vehicleData.Plate}:`, {
        driverName: vehicleData.DriverName
      });
      
      // Only process engine status changes
      const engineStatus = this.parseEngineStatus(vehicleData.DriverName);
      if (engineStatus) {
        await this.handleSessionChange(vehicleData.Plate, engineStatus);
      }

      console.log(`✅ Processed update for vehicle: ${vehicleData.Plate}`);
    } catch (error) {
      console.error('❌ Error processing vehicle update:', error);
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  parseEngineStatus(driverName) {
    if (!driverName || driverName.trim() === '') return null;
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    
    // Check for ON patterns
    if (normalized.includes('PTO ON') || normalized.includes('ENGINE ON')) return 'ON';
    
    // Check for OFF patterns  
    if (normalized.includes('PTO OFF') || normalized.includes('ENGINE OFF')) return 'OFF';
    
    return null;
  }

  async handleSessionChange(plate, engineStatus) {
    try {
      const currentTime = new Date();
      
      // Get fuel data from API endpoint when needed
      const getFuelData = async () => {
        try {
          const response = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
          const vehicles = response.data.data;
          return vehicles.find(v => v.branch === plate);
        } catch (error) {
          console.error(`❌ Error getting fuel data for ${plate}:`, error.message);
          return null;
        }
      };
      
      if (engineStatus === 'ON') {
        // Check if session already exists
        const { data: existing } = await supabase
          .from('energy_rite_operating_sessions')
          .select('id')
          .eq('branch', plate)
          .eq('session_status', 'ONGOING')
          .limit(1);
          
        if (existing.length === 0) {
          const vehicle = await getFuelData();
          
          await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: vehicle?.company || 'KFC',
            cost_code: vehicle?.cost_code,
            session_date: currentTime.toISOString().split('T')[0],
            session_start_time: currentTime.toISOString(),
            opening_fuel: parseFloat(vehicle?.fuel_probe_1_level) || 0,
            opening_percentage: parseFloat(vehicle?.fuel_probe_1_level_percentage) || null,
            opening_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank) || null,
            opening_temperature: parseFloat(vehicle?.fuel_probe_1_temperature) || null,
            session_status: 'ONGOING',
            notes: `Engine started at ${currentTime.toISOString()}`
          });
          
          console.log(`🟢 Engine ON: ${plate} session started`);
        }
      } else if (engineStatus === 'OFF') {
        // Complete existing session
        const { data: sessions } = await supabase
          .from('energy_rite_operating_sessions')
          .select('*')
          .eq('branch', plate)
          .eq('session_status', 'ONGOING')
          .order('session_start_time', { ascending: false })
          .limit(1);
          
        if (sessions.length > 0) {
          const session = sessions[0];
          const vehicle = await getFuelData();
          const startTime = new Date(session.session_start_time);
          const operatingHours = Math.max(0, (currentTime - startTime) / 3600000);
          const startingFuel = session.opening_fuel || 0;
          const currentFuel = parseFloat(vehicle?.fuel_probe_1_level) || 0;
          const fuelConsumed = Math.max(0, startingFuel - currentFuel);
          const fuelCost = fuelConsumed * 20;
          const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
          
          await supabase.from('energy_rite_operating_sessions')
            .update({
              session_end_time: currentTime.toISOString(),
              operating_hours: operatingHours,
              closing_fuel: currentFuel,
              closing_percentage: parseFloat(vehicle?.fuel_probe_1_level_percentage) || null,
              closing_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank) || null,
              closing_temperature: parseFloat(vehicle?.fuel_probe_1_temperature) || null,
              total_usage: fuelConsumed,
              liter_usage_per_hour: literUsagePerHour,
              cost_for_usage: fuelCost,
              session_status: 'COMPLETED',
              notes: `Engine stopped. Duration: ${operatingHours.toFixed(2)}h, Fuel used: ${fuelConsumed.toFixed(1)}L`
            })
            .eq('id', session.id);
            
          console.log(`🔴 Engine OFF: ${plate} session completed - ${fuelConsumed.toFixed(1)}L used`);
        }
      }
      
      // Log activity
      await supabase.from('energy_rite_activity_log').insert({
        activity_type: engineStatus === 'ON' ? 'ENGINE_ON' : 'ENGINE_OFF',
        description: `Engine ${engineStatus} detected for ${plate}`,
        branch: plate,
        activity_data: { 
          engine_status: engineStatus,
          timestamp: currentTime.toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error handling session change for ${plate}:`, error.message);
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = EnergyRiteWebSocketClient;