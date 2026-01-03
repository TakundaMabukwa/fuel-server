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

  // Convert LocTime and add 2 hours
  convertLocTime(locTime) {
    if (!locTime) return new Date().toISOString();
    
    // Parse the LocTime and add 2 hours
    const date = new Date(locTime.replace(' ', 'T') + 'Z');
    date.setHours(date.getHours() + 2);
    return date.toISOString();
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
      const actualBranch = vehicleData.Plate;
      
      // Store fuel data if available
      if (vehicleData.fuel_probe_1_level) {
        await this.storeFuelData({ ...vehicleData, actualBranch });
      }
      

      
      // Handle engine status FIRST (before fuel fill processing)
      const engineStatus = this.parseEngineStatus(vehicleData.DriverName);
      if (engineStatus) {
        console.log(`🔧 Processing engine ${engineStatus} for ${actualBranch}`);
        await this.handleSessionChange(actualBranch, engineStatus, vehicleData);
      }
      
      // Then handle fuel fill status
      const hasFuelFillStatus = this.parseFuelFillStatus(vehicleData.DriverName);
      
      if (hasFuelFillStatus) {
        // Start fuel fill session
        await this.handleFuelFillSessionChange(actualBranch, 'START', vehicleData);
      } else {
        // Complete any ongoing fuel fill session
        await this.completeFuelFillSession(actualBranch, vehicleData);
      }

    } catch (error) {
      console.error('❌ Error processing vehicle update:', error);
    }
  }

  async resolveVehicleBranch(plate, quality) {
    try {
      return plate || 'UNKNOWN';
    } catch (error) {
      console.error(`❌ Error resolving vehicle branch: ${error.message}`);
      return plate || 'UNKNOWN';
    }
  }

  async getFuelDataFallback(plate, quality) {
    try {
      console.log(`🔍 External API lookup for ${plate} with quality ${quality}`);
      const response = await axios.get('http://209.38.217.58:8000/api/energyrite-sites', {
        timeout: 10000
      });
      
      if (response.data && Array.isArray(response.data)) {
        // First try matching by quality (ensure string comparison)
        let vehicleInfo = response.data.find(v => String(v.Quality) === String(quality));
        console.log(`🔍 Quality match for '${quality}': ${vehicleInfo ? 'FOUND' : 'NOT FOUND'}`);
        
        // Fallback to plate matching
        if (!vehicleInfo) {
          vehicleInfo = response.data.find(v => String(v.Plate) === String(plate));
          console.log(`🔍 Plate match for '${plate}': ${vehicleInfo ? 'FOUND' : 'NOT FOUND'}`);
        }
        
        if (vehicleInfo) {
          console.log(`✅ External API fuel data for ${plate}: ${vehicleInfo.fuel_probe_1_level}L`);
          return {
            fuel_probe_1_level: vehicleInfo.fuel_probe_1_level,
            fuel_probe_1_level_percentage: vehicleInfo.fuel_probe_1_level_percentage,
            fuel_probe_1_volume_in_tank: vehicleInfo.fuel_probe_1_volume_in_tank,
            fuel_probe_1_temperature: vehicleInfo.fuel_probe_1_temperature
          };
        } else {
          console.log(`❌ No match found for ${plate} (quality: ${quality})`);
        }
      }
    } catch (error) {
      console.log(`⚠️ External API failed for ${plate}:`, error.message);
    }
    return { fuel_probe_1_level: null };
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
      
      const timestamp = this.convertLocTime(vehicleData.LocTime);
      
      await supabase.from('energy_rite_fuel_data').insert({
        plate: vehicleData.actualBranch || vehicleData.Plate,
        fuel_probe_1_level: fuelLevel,
        fuel_probe_1_level_percentage: fuelPercentage,
        fuel_probe_1_volume_in_tank: parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0,
        created_at: timestamp
      });
      
    } catch (error) {
      console.error(`❌ Error storing fuel data for ${vehicleData.actualBranch || vehicleData.Plate}:`, error.message);
    }
  }

  async completeFuelFillSession(plate, vehicleData) {
    try {
      // Complete any ongoing fuel fill session
      const { data: sessions, error: sessionError } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('branch', plate)
        .eq('session_status', 'FUEL_FILL_ONGOING')
        .order('session_start_time', { ascending: false })
        .limit(1);
        
      if (!sessionError && sessions && sessions.length > 0) {
        const session = sessions[0];
        const currentTime = vehicleData.LocTime ? new Date(vehicleData.LocTime) : new Date();
        const startTime = new Date(session.session_start_time);
        const durationMs = currentTime.getTime() - startTime.getTime();
        const duration = durationMs / 1000;
        const startingFuel = session.opening_fuel || 0;
        
        // Get current fuel data - use WebSocket or external API fallback
        let currentFuel = 0;
        let currentPercentage = 0;
        
        if (vehicleData?.fuel_probe_1_volume_in_tank) {
          // Use WebSocket data
          currentFuel = parseFloat(vehicleData.fuel_probe_1_volume_in_tank);
          currentPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        } else {
          // Fallback to external API
          console.log(`🔄 No fuel data in WebSocket for ${plate}, using external API`);
          const fallbackData = await this.getFuelDataFallback(plate, vehicleData.Quality);
          currentFuel = parseFloat(fallbackData.fuel_probe_1_volume_in_tank) || 0;
          currentPercentage = parseFloat(fallbackData.fuel_probe_1_level_percentage) || 0;
        }
        
        const fillAmount = Math.max(0, currentFuel - startingFuel);
        console.log(`⛽ FUEL FILL COMPLETE: ${plate} - ${startingFuel}L → ${currentFuel}L = +${fillAmount.toFixed(1)}L`);
        
        await supabase.from('energy_rite_operating_sessions')
          .update({
            session_end_time: this.convertLocTime(vehicleData.LocTime),
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
            
          if (engineSessions && Array.isArray(engineSessions) && engineSessions.length > 0) {
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
    if (!driverName || driverName.trim() === '') {
      return null;
    }
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    console.log(`🔍 Checking engine status: "${driverName}" -> "${normalized}"`);
    
    // Check for ENGINE and PTO status
    if (normalized.includes('ENGINE ON') || normalized.includes('PTO ON')) {
      console.log(`🟢 ENGINE ON DETECTED: ${driverName}`);
      return 'ON';
    }
    if (normalized.includes('ENGINE OFF') || normalized.includes('PTO OFF')) {
      console.log(`🔴 ENGINE OFF DETECTED: ${driverName}`);
      return 'OFF';
    }
    
    console.log(`ℹ️ No engine status detected in: "${driverName}"`);
    return null;
  }

  parseFuelFillStatus(driverName) {
    if (!driverName || driverName.trim() === '') {
      return null;
    }
    
    const normalized = driverName.replace(/\s+/g, ' ').trim().toUpperCase();
    console.log(`🔍 Checking fuel fill status: "${driverName}" -> "${normalized}"`);
    
    // Check for fuel fill patterns
    if (normalized.includes('POSSIBLE FUEL FILL') ||
        normalized.includes('FUEL FILL') ||
        normalized.includes('REFUEL') ||
        normalized.includes('FILLING')) {
      console.log(`⛽ FUEL FILL DETECTED: ${driverName}`);
      return 'START';
    }
    
    console.log(`ℹ️ No fuel fill status detected in: "${driverName}"`);
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
      const currentTime = this.convertLocTime(vehicleData.LocTime);
      
      if (fuelFillStatus === 'START') {
        // Check if fuel fill session already exists
        const { data: existing } = await supabase
          .from('energy_rite_operating_sessions')
          .select('id')
          .eq('branch', plate)
          .eq('session_status', 'FUEL_FILL_ONGOING')
          .limit(1);
          
        if (!existing || existing.length === 0) {
          const openingFuel = parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0;
          const openingPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
          
          await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: 'KFC',
            session_date: currentTime.split('T')[0],
            session_start_time: currentTime,
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
      const currentTime = this.convertLocTime(wsMessage?.LocTime);
      
      // Get fuel data - WebSocket or external API fallback
      const getFuelData = async () => {
        if (wsMessage?.fuel_probe_1_level) {
          return {
            fuel_probe_1_level: parseFloat(wsMessage.fuel_probe_1_level),
            fuel_probe_1_level_percentage: parseFloat(wsMessage.fuel_probe_1_level_percentage) || 0,
            fuel_probe_1_volume_in_tank: parseFloat(wsMessage.fuel_probe_1_volume_in_tank) || 0,
            fuel_probe_1_temperature: parseFloat(wsMessage.fuel_probe_1_temperature) || 0
          };
        }
        
        // Use external API fallback
        const fallbackData = await this.getFuelDataFallback(plate, wsMessage?.Quality);
        return {
          fuel_probe_1_level: parseFloat(fallbackData.fuel_probe_1_level) || 0,
          fuel_probe_1_level_percentage: parseFloat(fallbackData.fuel_probe_1_level_percentage) || 0,
          fuel_probe_1_volume_in_tank: parseFloat(fallbackData.fuel_probe_1_volume_in_tank) || 0,
          fuel_probe_1_temperature: parseFloat(fallbackData.fuel_probe_1_temperature) || 0
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
          
        if (!existing || existing.length === 0) {
          const fuelData = await getFuelData();
          
          console.log(`🔧 Creating engine session for ${plate} with fuel data:`, fuelData);
          
          const { data, error } = await supabase.from('energy_rite_operating_sessions').insert({
            branch: plate,
            company: 'KFC',
            session_date: currentTime.split('T')[0],
            session_start_time: currentTime,
            opening_fuel: fuelData.fuel_probe_1_volume_in_tank,
            opening_percentage: fuelData.fuel_probe_1_level_percentage,
            opening_volume: fuelData.fuel_probe_1_volume_in_tank,
            opening_temperature: fuelData.fuel_probe_1_temperature,
            session_status: 'ONGOING',
            notes: `Engine started. Opening: ${fuelData.fuel_probe_1_level}L (${fuelData.fuel_probe_1_level_percentage}%)`
          });
          
          if (error) {
            console.error(`❌ Error creating engine session for ${plate}:`, error);
          } else {
            console.log(`✅ Engine session created for ${plate} - Opening: ${fuelData.fuel_probe_1_level}L`);
          }
        } else {
          console.log(`ℹ️ Engine session already exists for ${plate}`);
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
          
        if (sessions && Array.isArray(sessions) && sessions.length > 0) {
          const session = sessions[0];
          const fuelData = await getFuelData();
          const startTime = new Date(session.session_start_time);
          const endTime = new Date(currentTime);
          const durationMs = endTime.getTime() - startTime.getTime();
          const operatingHours = Math.max(0, durationMs / (1000 * 60 * 60));
          const startingFuel = session.opening_fuel || 0;
          const currentFuel = fuelData.fuel_probe_1_volume_in_tank;
          const fuelConsumed = Math.max(0, startingFuel - currentFuel);
          const fuelCost = fuelConsumed * 20;
          const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
          
          await supabase.from('energy_rite_operating_sessions')
            .update({
              session_end_time: currentTime,
              operating_hours: operatingHours,
              closing_fuel: currentFuel,
              closing_percentage: fuelData.fuel_probe_1_level_percentage,
              closing_volume: fuelData.fuel_probe_1_volume_in_tank,
              closing_temperature: fuelData.fuel_probe_1_temperature,
              total_usage: fuelConsumed,
              liter_usage_per_hour: literUsagePerHour,
              cost_for_usage: fuelCost,
              session_status: 'COMPLETED',
              notes: `Engine stopped. Duration: ${operatingHours.toFixed(2)}h, Opening: ${startingFuel}L, Closing: ${currentFuel}L, Used: ${fuelConsumed.toFixed(1)}L`
            })
            .eq('id', session.id);
            
          console.log(`🔴 Engine OFF: ${plate} - Used: ${fuelConsumed.toFixed(1)}L in ${operatingHours.toFixed(2)}h`);
        }
      }
      
      // Log activity
      await supabase.from('energy_rite_activity_log').insert({
        branch: plate,
        activity_type: engineStatus === 'ON' ? 'ENGINE_ON' : 'ENGINE_OFF',
        activity_time: currentTime,
        notes: `Engine ${engineStatus} detected`
      });
      
    } catch (error) {
      console.error(`❌ Error handling session change for ${plate}:`, error.message);
    }
  }



  async handleFuelFillEvent(plate, vehicleData) {
    try {
      const currentTime = vehicleData.LocTime ? new Date(vehicleData.LocTime) : new Date();
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
      const currentTime = vehicleData.LocTime ? new Date(vehicleData.LocTime) : new Date();
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
          
        if (ongoingSessions && Array.isArray(ongoingSessions) && ongoingSessions.length > 0) {
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