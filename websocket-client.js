const WebSocket = require('ws');
const { supabase } = require('./supabase-client');
const { detectFuelTheft } = require('./helpers/fuel-theft-detector');
const { detectFuelFill } = require('./helpers/fuel-fill-detector');
const ImprovedOnOffDetection = require('./fix-onoff-detection');
const axios = require('axios');

class EnergyRiteWebSocketClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.onOffDetector = new ImprovedOnOffDetection();
    this.testMode = wsUrl === 'dummy';
  }

  connect() {
    if (this.testMode) {
      console.log('🧪 Test mode - skipping WebSocket connection');
      return;
    }
    
    console.log(`🔌 Connecting to WebSocket: ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        // Log full message for every message
        console.log('📋 Full message:', JSON.stringify(message, null, 2));
        
        // Process energyrite parsed data
        if (message.Plate) {
          await this.processVehicleUpdate(message);
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
        console.log('Raw data that caused error:', data.toString());
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
      // console.log(`📊 Processing vehicle data for ${vehicleData.Plate}`);
      
      // Store fuel data for detection (ensure we have data to compare)
      if (vehicleData.fuel_probe_1_level && vehicleData.fuel_probe_1_level !== null) {
        await this.storeFuelData(vehicleData);
      }
      
      // NEW: Independent fuel fill session tracking
      await this.handleFuelFillSession(vehicleData.Plate, vehicleData.DriverName, vehicleData);
      
      // Check for fuel fills using existing detector (keep existing functionality)
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
      
      // Process engine status changes (separate from fuel fills)
      const engineStatus = this.parseEngineStatus(vehicleData.DriverName);
      if (engineStatus) {
        await this.handleSessionChange(vehicleData.Plate, engineStatus, vehicleData);
      }

      // console.log(`✅ Processed update for vehicle: ${vehicleData.Plate}`);
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

  isFuelFillStatus(driverName) {
    if (!driverName || driverName.trim() === '') return false;
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    
    return normalized.includes('POSSIBLE FUEL FILL') ||
           normalized.includes('FUEL FILL') ||
           normalized.includes('REFUEL') ||
           normalized.includes('FILLING');
  }

  async storeFuelData(vehicleData) {
    try {
      const fuelLevel = parseFloat(vehicleData.fuel_probe_1_level);
      const fuelPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage);
      
      if (isNaN(fuelLevel) || fuelLevel <= 0) return;
      
      await supabase.from('energy_rite_fuel_data').insert({
        plate: vehicleData.Plate,
        fuel_probe_1_level: fuelLevel,
        fuel_probe_1_level_percentage: fuelPercentage,
        created_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`❌ Error storing fuel data for ${vehicleData.Plate}:`, error.message);
    }
  }

  async handleFuelFillSession(plate, driverName, vehicleData) {
    try {
      if (!this.fuelFillSessions) this.fuelFillSessions = new Map();
      
      const isFillStatus = this.isFuelFillStatus(driverName);
      const hasOngoingFill = this.fuelFillSessions.has(plate);
      
      if (isFillStatus && !hasOngoingFill) {
        // Start new fuel fill session
        const initialFuel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
        const initialPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        
        this.fuelFillSessions.set(plate, {
          startTime: new Date(),
          initialFuel,
          initialPercentage,
          status: 'ONGOING'
        });
        
        console.log(`⛽ Fuel fill session started for ${plate} - Initial: ${initialFuel}L (${initialPercentage}%)`);
        
        await supabase.from('energy_rite_activity_log').insert({
          branch: plate,
          activity_type: 'FUEL_FILL_SESSION_START',
          activity_time: new Date().toISOString(),
          notes: `Fuel fill session started - Initial: ${initialFuel}L (${initialPercentage}%)`
        });
        
      } else if (!isFillStatus && hasOngoingFill) {
        // End fuel fill session
        const session = this.fuelFillSessions.get(plate);
        const finalFuel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
        const finalPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        const fillAmount = Math.max(0, finalFuel - session.initialFuel);
        const duration = (new Date() - session.startTime) / 1000;
        
        console.log(`⛽ Fuel fill session ended for ${plate}:`);
        console.log(`  Initial: ${session.initialFuel}L (${session.initialPercentage}%)`);
        console.log(`  Final: ${finalFuel}L (${finalPercentage}%)`);
        console.log(`  Amount filled: ${fillAmount.toFixed(1)}L`);
        console.log(`  Duration: ${duration.toFixed(0)}s`);
        
        await supabase.from('energy_rite_activity_log').insert({
          branch: plate,
          activity_type: 'FUEL_FILL_SESSION_COMPLETE',
          activity_time: new Date().toISOString(),
          notes: `Fuel fill: +${fillAmount.toFixed(1)}L (${session.initialFuel}L → ${finalFuel}L) in ${duration.toFixed(0)}s`
        });
        
        // Update ongoing engine session if exists
        if (fillAmount > 0) {
          const { data: ongoingSessions } = await supabase
            .from('energy_rite_operating_sessions')
            .select('*')
            .eq('branch', plate)
            .eq('session_status', 'ONGOING')
            .order('session_start_time', { ascending: false })
            .limit(1);
            
          if (ongoingSessions && ongoingSessions.length > 0) {
            const engineSession = ongoingSessions[0];
            const currentFillEvents = engineSession.fill_events || 0;
            const currentFillAmount = engineSession.fill_amount_during_session || 0;
            
            await supabase
              .from('energy_rite_operating_sessions')
              .update({
                fill_events: currentFillEvents + 1,
                fill_amount_during_session: currentFillAmount + fillAmount,
                total_fill: (engineSession.total_fill || 0) + fillAmount,
                notes: `${engineSession.notes || ''} | Fill: +${fillAmount.toFixed(1)}L at ${new Date().toLocaleTimeString()}`
              })
              .eq('id', engineSession.id);
              
            console.log(`🔋 Updated engine session ${engineSession.id} with fill: +${fillAmount.toFixed(1)}L`);
          }
        }
        
        this.fuelFillSessions.delete(plate);
      }
      
    } catch (error) {
      console.error(`❌ Error handling fuel fill session for ${plate}:`, error.message);
    }
  }

  parseEngineStatus(driverName) {
    if (!driverName || driverName.trim() === '') return null;
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    
    // Only log if there's a driver name
    if (driverName && driverName.trim() !== '') {
      console.log('🔍 DriverName received:', driverName, '-> normalized:', normalized);
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

  async handleSessionChange(plate, engineStatus, wsMessage = null) {
    try {
      const currentTime = new Date();
      
      // Get fuel data from API endpoint when needed
      const getFuelData = async () => {
        try {
          const response = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
          const vehicles = response.data.data;
          
          console.log(`🔍 Looking for vehicle: ${plate}`);
          if (wsMessage?.Quality) {
            console.log(`🔍 WebSocket Quality: ${wsMessage.Quality}`);
          }
          
          // First try to match by both plate and quality (IP)
          let vehicle = null;
          if (wsMessage?.Quality) {
            vehicle = vehicles.find(v => v.branch === plate && v.quality === wsMessage.Quality);
            if (vehicle) {
              console.log(`✅ Found exact match by plate + quality: ${plate} (${wsMessage.Quality})`);
            }
          }
          
          // Fallback to plate-only match if no quality match
          if (!vehicle) {
            vehicle = vehicles.find(v => v.branch === plate);
            if (vehicle) {
              console.log(`⚠️ Found plate-only match: ${plate} (quality: ${vehicle.quality})`);
            }
          }
          
          if (!vehicle) {
            console.log(`❌ No vehicle found for ${plate}`);
            console.log(`📋 Available vehicles:`, vehicles.map(v => ({branch: v.branch, quality: v.quality})));
            return null;
          }
          
          console.log(`✅ Using vehicle data:`, {
            branch: vehicle.branch,
            quality: vehicle.quality,
            fuel_level: vehicle.fuel_probe_1_level,
            company: vehicle.company
          });
          
          return vehicle;
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
      
      // Log activity - THIS WAS MISSING!
      await supabase.from('energy_rite_activity_log').insert({
        branch: plate,
        activity_type: engineStatus === 'ON' ? 'ENGINE_ON' : 'ENGINE_OFF',
        activity_time: currentTime.toISOString(),
        notes: `Engine ${engineStatus} detected`
      });
      
    } catch (error) {
      console.error(`❌ Error handling session change for ${plate}:`, error.message);
    }
  }



  async handleFuelFillEvent(plate, vehicleData) {
    try {
      const currentTime = new Date();
      const preFillLevel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
      const preFillPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
      
      console.log(`⛽ Fuel fill detected for ${plate} - Pre-fill: ${preFillLevel}L (${preFillPercentage}%)`);
      
      if (!this.fuelFillTracking) this.fuelFillTracking = new Map();
      
      this.fuelFillTracking.set(plate, {
        preFillLevel,
        preFillPercentage,
        fillStartTime: currentTime,
        isTracking: true
      });
      
    } catch (error) {
      console.error(`❌ Error handling fuel fill start for ${plate}:`, error.message);
    }
  }

  async handleFuelFillEnd(plate, vehicleData) {
    try {
      if (!this.fuelFillTracking?.has(plate)) return;
      
      const tracking = this.fuelFillTracking.get(plate);
      if (!tracking.isTracking) return;
      
      const currentFuelLevel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
      const currentFuelPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
      const fillAmount = Math.max(0, currentFuelLevel - tracking.preFillLevel);
      const currentTime = new Date();
      const fillDuration = (currentTime - tracking.fillStartTime) / 1000;
      
      console.log(`⛽ Fuel fill ended for ${plate}: +${fillAmount.toFixed(1)}L`);
      
      if (fillAmount > 5) { // Only record significant fills
        // Get vehicle info
        const { data: vehicleInfo } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('cost_code, company')
          .eq('plate', plate)
          .single();
        
        // Create fuel fill session in operating_sessions
        await supabase.from('energy_rite_operating_sessions').insert({
          branch: plate,
          company: vehicleInfo?.company || 'KFC',
          cost_code: vehicleInfo?.cost_code,
          session_date: currentTime.toISOString().split('T')[0],
          session_start_time: tracking.fillStartTime.toISOString(),
          session_end_time: currentTime.toISOString(),
          operating_hours: fillDuration / 3600,
          opening_fuel: tracking.preFillLevel,
          opening_percentage: tracking.preFillPercentage,
          closing_fuel: currentFuelLevel,
          closing_percentage: currentFuelPercentage,
          total_fill: fillAmount,
          session_status: 'FUEL_FILL',
          notes: `Fuel Fill: +${fillAmount.toFixed(1)}L (${tracking.preFillLevel}L → ${currentFuelLevel}L) Duration: ${fillDuration.toFixed(0)}s`
        });
        
        console.log(`⛽ Fuel fill session created: ${plate} +${fillAmount.toFixed(1)}L`);
        
        // Also update any ongoing engine session
        const { data: ongoingSessions } = await supabase
          .from('energy_rite_operating_sessions')
          .select('*')
          .eq('branch', plate)
          .eq('session_status', 'ONGOING')
          .order('session_start_time', { ascending: false })
          .limit(1);
          
        if (ongoingSessions && ongoingSessions.length > 0) {
          const session = ongoingSessions[0];
          await supabase
            .from('energy_rite_operating_sessions')
            .update({
              fill_events: (session.fill_events || 0) + 1,
              fill_amount_during_session: (session.fill_amount_during_session || 0) + fillAmount,
              total_fill: (session.total_fill || 0) + fillAmount,
              notes: `${session.notes || ''} | Fill: +${fillAmount.toFixed(1)}L at ${currentTime.toLocaleTimeString()}`
            })
            .eq('id', session.id);
        }
      }
      
      this.fuelFillTracking.delete(plate);
      
    } catch (error) {
      console.error(`❌ Error handling fuel fill end for ${plate}:`, error.message);
    }
  }

  async checkFuelFillCompletion(plate, vehicleData) {
    // This method is now mainly for backup/timeout scenarios
    // Primary detection is through status change
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = EnergyRiteWebSocketClient;