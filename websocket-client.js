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
      // Resolve actual branch name using fallback mechanism
      const actualBranch = await this.resolveVehicleBranch(vehicleData.Plate, vehicleData.Quality);
      
      // Store fuel data for detection (ensure we have data to compare)
      if (vehicleData.fuel_probe_1_level && vehicleData.fuel_probe_1_level !== null) {
        await this.storeFuelData({ ...vehicleData, actualBranch });
      }
      
      // Process fuel fill status (like engine sessions)
      const fuelFillStatus = this.parseFuelFillStatus(vehicleData.DriverName);
      if (fuelFillStatus) {
        await this.handleFuelFillSessionChange(actualBranch, fuelFillStatus, vehicleData);
      } else {
        // If no fuel fill status, complete any ongoing fuel fill session
        await this.completeFuelFillSession(actualBranch, vehicleData);
      }
      
      // Process engine status changes (separate from fuel fills)
      const engineStatus = this.parseEngineStatus(vehicleData.DriverName);
      if (engineStatus) {
        await this.handleSessionChange(actualBranch, engineStatus, vehicleData);
      }

    } catch (error) {
      console.error('❌ Error processing vehicle update:', error);
    }
  }

  async resolveVehicleBranch(plate, quality) {
    try {
      // Get vehicles from external API
      const response = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
      const vehicles = response.data.data;
      
      // First try exact plate match
      let vehicleInfo = vehicles.find(v => v.branch === plate);
      
      if (vehicleInfo) {
        return vehicleInfo.branch;
      }
      
      // If no plate match and we have quality (IP), try quality match
      if (quality) {
        vehicleInfo = vehicles.find(v => v.quality === quality);
        
        if (vehicleInfo) {
          console.log(`🔍 Fallback: ${plate} (${quality}) → ${vehicleInfo.branch}`);
          return vehicleInfo.branch;
        }
      }
      
      // If no match found, return original plate
      return plate;
    } catch (error) {
      console.error(`❌ Error resolving vehicle branch: ${error.message}`);
      // If lookup fails, return original plate
      return plate;
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



  async storeFuelData(vehicleData) {
    try {
      const fuelLevel = parseFloat(vehicleData.fuel_probe_1_level);
      const fuelPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage);
      
      if (isNaN(fuelLevel) || fuelLevel <= 0) return;
      
      await supabase.from('energy_rite_fuel_data').insert({
        plate: vehicleData.actualBranch || vehicleData.Plate,
        fuel_probe_1_level: fuelLevel,
        fuel_probe_1_level_percentage: fuelPercentage,
        created_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`❌ Error storing fuel data for ${vehicleData.actualBranch || vehicleData.Plate}:`, error.message);
    }
  }

  async completeFuelFillSession(plate, vehicleData) {
    try {
      // Complete any ongoing fuel fill session
      const { data: sessions } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('branch', plate)
        .eq('session_status', 'FUEL_FILL_ONGOING')
        .order('session_start_time', { ascending: false })
        .limit(1);
        
      if (sessions.length > 0) {
        const session = sessions[0];
        const currentTime = new Date();
        const startTime = new Date(session.session_start_time);
        const durationMs = currentTime.getTime() - startTime.getTime();
        const duration = durationMs / 1000;
        const startingFuel = session.opening_fuel || 0;
        const currentFuel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
        const fillAmount = Math.max(0, currentFuel - startingFuel);
        const currentPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        
        await supabase.from('energy_rite_operating_sessions')
          .update({
            session_end_time: currentTime.toISOString(),
            operating_hours: durationMs / (1000 * 60 * 60),
            closing_fuel: currentFuel,
            closing_percentage: currentPercentage,
            total_fill: fillAmount,
            session_status: 'FUEL_FILL_COMPLETED',
            notes: `Fuel fill completed. Duration: ${(durationMs / 1000).toFixed(3)}s (${durationMs}ms), Opening: ${startingFuel}L, Closing: ${currentFuel}L, Filled: ${fillAmount.toFixed(1)}L`
          })
          .eq('id', session.id);
          
        console.log(`⛽ FUEL FILL COMPLETE: ${plate} - Duration: ${duration.toFixed(0)}s, Filled: ${fillAmount.toFixed(1)}L`);
        
        // Update any ongoing engine session
        if (fillAmount > 0) {
          const { data: engineSessions } = await supabase
            .from('energy_rite_operating_sessions')
            .select('*')
            .eq('branch', plate)
            .eq('session_status', 'ONGOING')
            .order('session_start_time', { ascending: false })
            .limit(1);
            
          if (engineSessions && engineSessions.length > 0) {
            const engineSession = engineSessions[0];
            await supabase
              .from('energy_rite_operating_sessions')
              .update({
                fill_events: (engineSession.fill_events || 0) + 1,
                fill_amount_during_session: (engineSession.fill_amount_during_session || 0) + fillAmount,
                total_fill: (engineSession.total_fill || 0) + fillAmount,
                notes: `${engineSession.notes || ''} | Fill: +${fillAmount.toFixed(1)}L`
              })
              .eq('id', engineSession.id);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error completing fuel fill session for ${plate}:`, error.message);
    }
  }

  parseEngineStatus(driverName) {
    if (!driverName || driverName.trim() === '') return null;
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    
    // Only ENGINE ON/OFF for sessions
    if (normalized.includes('ENGINE ON')) {
      console.log(`🟢 ENGINE ON: ${driverName}`);
      return 'ON';
    }
    if (normalized.includes('ENGINE OFF')) {
      console.log(`🔴 ENGINE OFF: ${driverName}`);
      return 'OFF';
    }
    
    return null;
  }

  parseFuelFillStatus(driverName) {
    if (!driverName || driverName.trim() === '') {
      return null;
    }
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    
    // Check for fuel fill patterns
    if (normalized.includes('POSSIBLE FUEL FILL') ||
        normalized.includes('FUEL FILL') ||
        normalized.includes('REFUEL') ||
        normalized.includes('FILLING')) {
      console.log(`⛽ FUEL FILL DETECTED: ${driverName}`);
      return 'START';
    }
    
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

  async handleFuelFillSessionChange(plate, fuelFillStatus, vehicleData) {
    try {
      const currentTime = new Date();
      
      if (fuelFillStatus === 'START') {
        // Check if fuel fill session already exists
        const { data: existing } = await supabase
          .from('energy_rite_operating_sessions')
          .select('id')
          .eq('branch', plate)
          .eq('session_status', 'FUEL_FILL_ONGOING')
          .limit(1);
          
        if (existing.length === 0) {
          const openingFuel = parseFloat(vehicleData.fuel_probe_1_level) || 0;
          const openingPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
          
          await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: 'KFC',
            session_date: currentTime.toISOString().split('T')[0],
            session_start_time: currentTime.toISOString(),
            opening_fuel: openingFuel,
            opening_percentage: openingPercentage,
            session_status: 'FUEL_FILL_ONGOING',
            notes: `Fuel fill started. Opening: ${openingFuel}L (${openingPercentage}%)`
          });
          
          console.log(`⛽ FUEL FILL START: ${plate} - Opening: ${openingFuel}L (${openingPercentage}%)`);
        } else {
          console.log(`⛽ FUEL FILL ONGOING: ${plate} - Session already exists`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error handling fuel fill session for ${plate}:`, error.message);
    }
  }

  async handleSessionChange(plate, engineStatus, wsMessage = null) {
    try {
      const currentTime = new Date();
      
      // Get vehicle info and fuel data from external API (single call)
      const getVehicleData = async () => {
        try {
          console.log(`🔄 Getting vehicle data from external API for ${plate}`);
          const response = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles', {
            timeout: 5000 // 5 second timeout
          });
          const vehicles = response.data.data;
          const vehicleInfo = vehicles.find(v => v.branch === plate);
          
          if (vehicleInfo) {
            console.log(`🔄 Using external API data for ${plate}: ${vehicleInfo.fuel_probe_1_level || 0}L (${vehicleInfo.fuel_probe_1_level_percentage || 0}%)`);
            return {
              fuel_probe_1_level: vehicleInfo.fuel_probe_1_level || null,
              fuel_probe_1_level_percentage: vehicleInfo.fuel_probe_1_level_percentage || null,
              fuel_probe_1_volume_in_tank: vehicleInfo.fuel_probe_1_volume_in_tank || null,
              fuel_probe_1_temperature: vehicleInfo.fuel_probe_1_temperature || null,
              company: vehicleInfo.company || 'KFC',
              cost_code: vehicleInfo.cost_code
            };
          } else {
            // Fallback: Get most recent fuel data from database
            const { data: recentFuel } = await supabase
              .from('energy_rite_fuel_data')
              .select('*')
              .eq('plate', plate)
              .order('created_at', { ascending: false })
              .limit(1);
              
            if (recentFuel && recentFuel.length > 0) {
              const fuel = recentFuel[0];
              console.log(`🔄 Using database fuel data for ${plate}: ${fuel.fuel_probe_1_level}L (${fuel.fuel_probe_1_level_percentage}%)`);
              return {
                fuel_probe_1_level: fuel.fuel_probe_1_level,
                fuel_probe_1_level_percentage: fuel.fuel_probe_1_level_percentage,
                fuel_probe_1_volume_in_tank: null,
                fuel_probe_1_temperature: null,
                company: 'KFC',
                cost_code: null
              };
            }
          }
        } catch (error) {
          console.error(`❌ Error getting vehicle data for ${plate}:`, error.message);
        }
        
        // Return defaults if all fails
        return {
          fuel_probe_1_level: 0,
          fuel_probe_1_level_percentage: 0,
          fuel_probe_1_volume_in_tank: 0,
          fuel_probe_1_temperature: 0,
          company: 'KFC',
          cost_code: null
        };
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
          const vehicle = await getVehicleData();
          
          // Debug log the vehicle data
          console.log(`🔍 Vehicle data for ${plate}:`, vehicle);
          
          const openingFuel = parseFloat(vehicle?.fuel_probe_1_level || 0);
          const openingPercentage = parseFloat(vehicle?.fuel_probe_1_level_percentage || 0);
          await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: vehicle?.company || 'KFC',
            cost_code: vehicle?.cost_code,
            session_date: currentTime.toISOString().split('T')[0],
            session_start_time: currentTime.toISOString(),
            opening_fuel: openingFuel,
            opening_percentage: openingPercentage,
            opening_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank || 0),
            opening_temperature: parseFloat(vehicle?.fuel_probe_1_temperature || 0),
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
          const vehicle = await getVehicleData();
          const startTime = new Date(session.session_start_time);
          const durationMs = currentTime.getTime() - startTime.getTime();
          const operatingHours = Math.max(0, durationMs / (1000 * 60 * 60));
          const startingFuel = session.opening_fuel || 0;
          const currentFuel = parseFloat(vehicle?.fuel_probe_1_level || 0);
          const fuelConsumed = Math.max(0, startingFuel - currentFuel);
          const fuelCost = fuelConsumed * 20;
          const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
          
          // Debug log the vehicle data for engine off
          console.log(`🔍 Engine OFF - Vehicle data for ${plate}:`, vehicle);
          
          const closingPercentage = parseFloat(vehicle?.fuel_probe_1_level_percentage || 0);
          
          await supabase.from('energy_rite_operating_sessions')
            .update({
              session_end_time: currentTime.toISOString(),
              operating_hours: durationMs / (1000 * 60 * 60),
              closing_fuel: currentFuel,
              closing_percentage: closingPercentage,
              closing_volume: parseFloat(vehicle?.fuel_probe_1_volume_in_tank || 0),
              closing_temperature: parseFloat(vehicle?.fuel_probe_1_temperature || 0),
              total_usage: fuelConsumed,
              liter_usage_per_hour: literUsagePerHour,
              cost_for_usage: fuelCost,
              session_status: 'COMPLETED',
              notes: `Engine stopped. Duration: ${(durationMs / (1000 * 60 * 60)).toFixed(6)}h (${durationMs}ms), Opening: ${startingFuel}L, Closing: ${currentFuel}L, Used: ${fuelConsumed.toFixed(1)}L`
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