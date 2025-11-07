const WebSocket = require('ws');
const { supabase } = require('./supabase-client');
const { detectFuelTheft } = require('./helpers/fuel-theft-detector');
const { detectFuelFill } = require('./helpers/fuel-fill-detector');
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
        driverName: vehicleData.DriverName,
        fuelLevel: vehicleData.fuel_probe_1_level
      });
      
      // Check for fuel fills first
      if (vehicleData.fuel_probe_1_level) {
        const fillResult = await detectFuelFill(
          vehicleData.Plate, 
          parseFloat(vehicleData.fuel_probe_1_level),
          vehicleData.DriverName
        );
        
        if (fillResult.isFill) {
          await this.handleFuelFill(vehicleData.Plate, fillResult);
        }
      }
      
      // Process engine status changes
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
    
    // Log all driver names for debugging
    if (Math.random() < 0.1) { // Log 10% of messages
      console.log('🔍 DriverName received:', driverName, '-> normalized:', normalized);
    }
    
    // Check for fuel fill status first
    if (normalized.includes('POSSIBLE FUEL FILL') || 
        normalized.includes('FUEL FILL')) {
      return 'FUEL_FILL';
    }
    
    // Check for ON patterns (more comprehensive)
    if (normalized.includes('PTO ON') || 
        normalized.includes('ENGINE ON') ||
        normalized.includes('GENERATOR ON') ||
        normalized.includes('START') ||
        normalized.includes('RUNNING')) return 'ON';
    
    // Check for OFF patterns (more comprehensive)
    if (normalized.includes('PTO OFF') || 
        normalized.includes('ENGINE OFF') ||
        normalized.includes('GENERATOR OFF') ||
        normalized.includes('STOP') ||
        normalized.includes('IDLE')) return 'OFF';
    
    return null;
  }

  async handleFuelFill(plate, fillResult) {
    try {
      console.log(`⛽ Handling fuel fill for ${plate}:`, fillResult.fillDetails);
      
      // Update any ongoing session with fill information
      const { data: ongoingSessions } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('branch', plate)
        .eq('session_status', 'ONGOING')
        .order('session_start_time', { ascending: false })
        .limit(1);
        
      if (ongoingSessions && ongoingSessions.length > 0) {
        const session = ongoingSessions[0];
        const currentFillEvents = session.fill_events || 0;
        const currentFillAmount = session.fill_amount_during_session || 0;
        
        await supabase
          .from('energy_rite_operating_sessions')
          .update({
            fill_events: currentFillEvents + 1,
            fill_amount_during_session: currentFillAmount + fillResult.fillDetails.fillAmount,
            total_fill: (session.total_fill || 0) + fillResult.fillDetails.fillAmount,
            notes: `${session.notes || ''} | Fill: +${fillResult.fillDetails.fillAmount.toFixed(1)}L at ${new Date().toLocaleTimeString()}`
          })
          .eq('id', session.id);
          
        console.log(`🔋 Updated session ${session.id} with fill: +${fillResult.fillDetails.fillAmount.toFixed(1)}L`);
      }
      
    } catch (error) {
      console.error(`❌ Error handling fuel fill for ${plate}:`, error.message);
    }
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
          
          const openingFuel = parseFloat(vehicle?.fuel_probe_1_level) || parseFloat(vehicle?.fuel_level) || 0;
          const openingPercentage = parseFloat(vehicle?.fuel_probe_1_level_percentage) || parseFloat(vehicle?.fuel_percentage) || 0;
          
          await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: vehicle?.company || 'KFC',
            cost_code: vehicle?.cost_code,
            session_date: currentTime.toISOString().split('T')[0],
            session_start_time: currentTime.toISOString(),
            opening_fuel: openingFuel,
            opening_percentage: openingPercentage,
            opening_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank) || 0,
            opening_temperature: parseFloat(vehicle?.fuel_probe_1_temperature) || 0,
            session_status: 'ONGOING',
            notes: `Engine started. Opening: ${openingFuel}L (${openingPercentage}%)`
          });
          
          console.log(`🟢 Engine ON: ${plate} - Opening: ${openingFuel}L (${openingPercentage}%)`);
          
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
          const currentFuel = parseFloat(vehicle?.fuel_probe_1_level) || parseFloat(vehicle?.fuel_level) || 0;
          const fuelConsumed = Math.max(0, startingFuel - currentFuel);
          const fuelCost = fuelConsumed * 20;
          const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
          
          const closingPercentage = parseFloat(vehicle?.fuel_probe_1_level_percentage) || parseFloat(vehicle?.fuel_percentage) || 0;
          
          await supabase.from('energy_rite_operating_sessions')
            .update({
              session_end_time: currentTime.toISOString(),
              operating_hours: operatingHours,
              closing_fuel: currentFuel,
              closing_percentage: closingPercentage,
              closing_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank) || 0,
              closing_temperature: parseFloat(vehicle?.fuel_probe_1_temperature) || 0,
              total_usage: fuelConsumed,
              liter_usage_per_hour: literUsagePerHour,
              cost_for_usage: fuelCost,
              session_status: 'COMPLETED',
              notes: `Engine stopped. Duration: ${operatingHours.toFixed(2)}h, Opening: ${startingFuel}L, Closing: ${currentFuel}L, Used: ${fuelConsumed.toFixed(1)}L`
            })
            .eq('id', session.id);
            
          console.log(`🔴 Engine OFF: ${plate} - Duration: ${operatingHours.toFixed(2)}h, Opening: ${startingFuel}L, Closing: ${currentFuel}L, Used: ${fuelConsumed.toFixed(1)}L`);
            

        }
      }
      
      // Handle fuel fill status
      if (engineStatus === 'FUEL_FILL') {
        console.log(`⛽ Fuel fill status detected for ${plate}`);
        // The fuel fill detection is already handled in processVehicleUpdate
        return;
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