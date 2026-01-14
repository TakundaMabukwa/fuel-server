const WebSocket = require('ws');
const { supabase } = require('./supabase-client');
const { detectFuelTheft } = require('./helpers/fuel-theft-detector');
const { detectFuelFill } = require('./helpers/fuel-fill-detector');
const ImprovedOnOffDetection = require('./fix-onoff-detection');

class EnergyRiteWebSocketClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.onOffDetector = new ImprovedOnOffDetection();
    this.testMode = wsUrl === 'dummy';
    this.pendingFuelUpdates = new Map();
    this.pendingClosures = new Map();
    this.recentFuelData = new Map();
    this.pendingFuelFills = new Map();
    this.fuelFillWatchers = new Map(); // Track 5-minute watchers for highest fuel
    
    // Message queue sorter
    this.messageQueue = [];
    this.processingQueue = false;
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
        console.log('📨 RAW MESSAGE:', JSON.stringify(message, null, 2));
        
        if (message.Plate && message.LocTime) {
          this.addToQueue(message);
        }
      } catch (error) {
        console.error('❌ Error parsing message:', error);
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

  addToQueue(message) {
    // Pre-calculate timestamp for faster sorting
    message._sortTime = new Date(this.convertLocTime(message.LocTime)).getTime();
    this.messageQueue.push(message);
    
    if (!this.processingQueue) {
      setImmediate(() => this.processQueue());
    }
  }

  async processQueue() {
    if (this.processingQueue || this.messageQueue.length === 0) return;
    
    this.processingQueue = true;
    const batch = this.messageQueue.splice(0); // Faster than [...array]
    
    // Fast sort using pre-calculated timestamps
    if (batch.length > 1) {
      batch.sort((a, b) => a._sortTime - b._sortTime);
      console.log(`📦 Sorted ${batch.length} messages`);
    }
    
    // Process without awaiting each (parallel where safe)
    for (const message of batch) {
      console.log(`📋 [${message.Plate}] ${message.LocTime}`);
      await this.processVehicleUpdate(message);
    }
    
    this.processingQueue = false;
    
    if (this.messageQueue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  async processVehicleUpdate(vehicleData) {
    try {
      const actualBranch = vehicleData.Plate;
      console.log(`🔍 Processing ${actualBranch}:`, {
        DriverName: vehicleData.DriverName,
        fuel_probe_1_level: vehicleData.fuel_probe_1_level,
        fuel_probe_1_volume_in_tank: vehicleData.fuel_probe_1_volume_in_tank,
        Temperature: vehicleData.Temperature
      });
      
      // Parse fuel data from Temperature field if present
      const fuelData = this.parseFuelData(vehicleData);
      
      // Store fuel data if available
      if (fuelData.hasFuelData) {
        await this.storeFuelData({ ...vehicleData, actualBranch, ...fuelData });
        
        // Store in recent fuel data cache with LocTime
        if (!this.recentFuelData.has(actualBranch)) {
          this.recentFuelData.set(actualBranch, []);
        }
        const fuelHistory = this.recentFuelData.get(actualBranch);
        fuelHistory.push({
          locTime: vehicleData.LocTime,
          timestamp: new Date(this.convertLocTime(vehicleData.LocTime)).getTime(),
          ...fuelData
        });
        // Keep only last 20 entries
        if (fuelHistory.length > 20) fuelHistory.shift();
        
        // Update any pending sessions waiting for opening fuel data
        await this.updatePendingSessionFuel(actualBranch, vehicleData);
        
        // Update any pending closures waiting for closing fuel data
        await this.updatePendingClosure(actualBranch, vehicleData);
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
        await this.handleFuelFillStart(actualBranch, vehicleData);
      } else {
        // Status disappeared - start 5-minute watcher if we have pending fill
        if (this.pendingFuelFills.has(actualBranch) && fuelData.hasFuelData) {
          const pending = this.pendingFuelFills.get(actualBranch);
          if (pending.openingFuel) {
            // Start watcher to track highest fuel for 5 minutes
            this.fuelFillWatchers.set(actualBranch, {
              startTime: pending.startTime,
              startLocTime: pending.startLocTime,
              openingFuel: pending.openingFuel,
              openingPercentage: pending.openingPercentage,
              highestFuel: fuelData.fuel_probe_1_volume_in_tank,
              highestPercentage: fuelData.fuel_probe_1_level_percentage,
              highestLocTime: vehicleData.LocTime
            });
            this.pendingFuelFills.delete(actualBranch);
            console.log(`🔍 Status ended for ${actualBranch} - Watching for highest fuel (10 min)`);
            setTimeout(() => this.completeFuelFillWatcher(actualBranch), 10 * 60 * 1000);
          } else if (pending.waitingForOpeningFuel) {
            // Got opening fuel when status disappeared, start watcher immediately
            this.fuelFillWatchers.set(actualBranch, {
              startTime: pending.startTime,
              startLocTime: pending.startLocTime,
              openingFuel: fuelData.fuel_probe_1_volume_in_tank,
              openingPercentage: fuelData.fuel_probe_1_level_percentage,
              highestFuel: fuelData.fuel_probe_1_volume_in_tank,
              highestPercentage: fuelData.fuel_probe_1_level_percentage,
              highestLocTime: vehicleData.LocTime
            });
            this.pendingFuelFills.delete(actualBranch);
            console.log(`🔍 Status ended for ${actualBranch} - Got opening fuel, watching for highest (10 min)`);
            setTimeout(() => this.completeFuelFillWatcher(actualBranch), 10 * 60 * 1000);
          }
        }
        
        if (fuelData.hasFuelData) {
          await this.checkPendingFuelFill(actualBranch, fuelData, vehicleData.LocTime);
        }
      }

    } catch (error) {
      console.error('❌ Error processing vehicle update:', error);
    }
  }



  parseFuelData(vehicleData) {
    // Check if fuel data already parsed in message
    if (vehicleData.fuel_probe_1_level) {
      return {
        hasFuelData: true,
        fuel_probe_1_level: parseFloat(vehicleData.fuel_probe_1_level),
        fuel_probe_1_level_percentage: parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0,
        fuel_probe_1_volume_in_tank: parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0,
        fuel_probe_1_temperature: parseFloat(vehicleData.fuel_probe_1_temperature) || 0
      };
    }
    
    // Parse from Temperature field if present
    if (vehicleData.Temperature && vehicleData.Temperature.trim() !== '') {
      // Temperature format: "25,405,1004,2020,0560,2021,0D2D,2022,14,2023,37"
      // This contains fuel data encoded
      return {
        hasFuelData: true,
        fuel_probe_1_level: parseFloat(vehicleData.fuel_probe_1_level) || 0,
        fuel_probe_1_level_percentage: parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0,
        fuel_probe_1_volume_in_tank: parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0,
        fuel_probe_1_temperature: parseFloat(vehicleData.fuel_probe_1_temperature) || 0
      };
    }
    
    return { hasFuelData: false };
  }

  async handleFuelFillStart(plate, vehicleData) {
    try {
      const currentTime = this.convertLocTime(vehicleData.LocTime);
      const hasFuelData = vehicleData.fuel_probe_1_volume_in_tank && parseFloat(vehicleData.fuel_probe_1_volume_in_tank) > 0;
      
      if (hasFuelData) {
        const openingFuel = parseFloat(vehicleData.fuel_probe_1_volume_in_tank);
        const openingPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        
        this.pendingFuelFills.set(plate, {
          startTime: currentTime,
          startLocTime: vehicleData.LocTime,
          openingFuel: openingFuel,
          openingPercentage: openingPercentage
        });
        
        console.log(`⛽ FUEL FILL START: ${plate} - Opening: ${openingFuel}L`);
      } else {
        this.pendingFuelFills.set(plate, {
          startTime: currentTime,
          startLocTime: vehicleData.LocTime,
          waitingForOpeningFuel: true
        });
        console.log(`⏳ FUEL FILL START: ${plate} - Waiting for opening fuel data`);
      }
    } catch (error) {
      console.error(`❌ Error starting fuel fill for ${plate}:`, error.message);
    }
  }

  async checkPendingFuelFill(plate, fuelData, locTime) {
    try {
      // Check if we have a watcher tracking highest fuel
      if (this.fuelFillWatchers.has(plate)) {
        const watcher = this.fuelFillWatchers.get(plate);
        const currentFuel = fuelData.fuel_probe_1_volume_in_tank;
        
        if (currentFuel > watcher.highestFuel) {
          watcher.highestFuel = currentFuel;
          watcher.highestPercentage = fuelData.fuel_probe_1_level_percentage;
          watcher.highestLocTime = locTime;
          console.log(`📈 New highest fuel for ${plate}: ${currentFuel}L`);
        }
        return;
      }
      
      if (!this.pendingFuelFills.has(plate)) return;
      
      const pending = this.pendingFuelFills.get(plate);
      const currentTime = new Date(this.convertLocTime(locTime)).getTime();
      const startTime = new Date(pending.startTime).getTime();
      
      if (pending.waitingForOpeningFuel && currentTime > startTime) {
        pending.openingFuel = fuelData.fuel_probe_1_volume_in_tank;
        pending.openingPercentage = fuelData.fuel_probe_1_level_percentage;
        pending.waitingForOpeningFuel = false;
        console.log(`✅ Got opening fuel for fill: ${plate} - ${pending.openingFuel}L`);
      }
    } catch (error) {
      console.error(`❌ Error checking fuel fill for ${plate}:`, error.message);
    }
  }

  async completeFuelFillWatcher(plate) {
    try {
      if (!this.fuelFillWatchers.has(plate)) return;
      
      const watcher = this.fuelFillWatchers.get(plate);
      const fillAmount = Math.max(0, watcher.highestFuel - watcher.openingFuel);
      const endTime = watcher.highestLocTime ? this.convertLocTime(watcher.highestLocTime) : new Date().toISOString();
      const startTime = new Date(watcher.startTime).getTime();
      const endTimeMs = new Date(endTime).getTime();
      const duration = (endTimeMs - startTime) / 1000;
      
      await supabase.from('energy_rite_operating_sessions').insert({
        branch: plate,
        company: 'KFC',
        session_date: watcher.startTime.split('T')[0],
        session_start_time: watcher.startTime,
        session_end_time: endTime,
        operating_hours: duration / 3600,
        opening_fuel: watcher.openingFuel,
        opening_percentage: watcher.openingPercentage,
        closing_fuel: watcher.highestFuel,
        closing_percentage: watcher.highestPercentage,
        total_fill: fillAmount,
        session_status: 'FUEL_FILL_COMPLETED',
        notes: `Fuel fill completed. Duration: ${duration.toFixed(1)}s, Opening: ${watcher.openingFuel}L, Highest: ${watcher.highestFuel}L, Filled: ${fillAmount.toFixed(1)}L`
      });
      
      console.log(`⛽ FUEL FILL COMPLETE: ${plate} - ${watcher.openingFuel}L → ${watcher.highestFuel}L = +${fillAmount.toFixed(1)}L`);
      
      // Update engine session if active
      const { data: engineSessions } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('branch', plate)
        .eq('session_status', 'ONGOING')
        .order('session_start_time', { ascending: false })
        .limit(1);
        
      if (engineSessions && engineSessions.length > 0) {
        const session = engineSessions[0];
        await supabase
          .from('energy_rite_operating_sessions')
          .update({
            fill_events: (session.fill_events || 0) + 1,
            fill_amount_during_session: (session.fill_amount_during_session || 0) + fillAmount,
            total_fill: (session.total_fill || 0) + fillAmount
          })
          .eq('id', session.id);
      }
      
      this.fuelFillWatchers.delete(plate);
    } catch (error) {
      console.error(`❌ Error completing fuel fill watcher for ${plate}:`, error.message);
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
      
      const timestamp = this.convertLocTime(vehicleData.LocTime);
      
      await supabase.from('energy_rite_fuel_data').insert({
        plate: vehicleData.actualBranch || vehicleData.Plate,
        fuel_probe_1_level: fuelLevel,
        fuel_probe_1_level_percentage: fuelPercentage,
        fuel_probe_1_volume_in_tank: parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0,
        created_at: timestamp
      });
      
      console.log(`⛽ Stored fuel data for ${vehicleData.actualBranch || vehicleData.Plate}: ${fuelLevel}L (${fuelPercentage}%)`);
      
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
        const currentTime = new Date(this.convertLocTime(vehicleData.LocTime));
        const startTime = new Date(session.session_start_time);
        const durationMs = currentTime.getTime() - startTime.getTime();
        const duration = durationMs / 1000;
        const startingFuel = session.opening_fuel || 0;
        
        // Get current fuel data from WebSocket only
        let currentFuel = 0;
        let currentPercentage = 0;
        
        if (vehicleData?.fuel_probe_1_volume_in_tank) {
          currentFuel = parseFloat(vehicleData.fuel_probe_1_volume_in_tank);
          currentPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
        } else {
          console.log(`⏳ No fuel data in WebSocket for ${plate}, waiting for next message`);
          return; // Don't complete session without fuel data
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

  findClosestFuelData(plate, targetLocTime) {
    const fuelHistory = this.recentFuelData.get(plate);
    if (!fuelHistory || fuelHistory.length === 0) return null;
    
    const targetTime = new Date(this.convertLocTime(targetLocTime)).getTime();
    
    // Find NEXT fuel data AFTER the status change (not closest)
    let nextFuel = null;
    let minDiff = Infinity;
    
    for (const fuelData of fuelHistory) {
      const diff = fuelData.timestamp - targetTime;
      // Only consider fuel data AFTER status change (diff > 0)
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        nextFuel = fuelData;
      }
    }
    
    // Only use if within 5 minutes after status
    if (nextFuel && minDiff <= 5 * 60 * 1000) {
      console.log(`🎯 Found next fuel data for ${plate}: ${(minDiff / 1000).toFixed(0)}s after status`);
      return nextFuel;
    }
    
    return null;
  }

  async handleSessionChange(plate, engineStatus, wsMessage = null) {
    try {
      const currentTime = this.convertLocTime(wsMessage?.LocTime);
      
      if (engineStatus === 'ON') {
        // Check if session already exists
        const { data: existing } = await supabase
          .from('energy_rite_operating_sessions')
          .select('id')
          .eq('branch', plate)
          .eq('session_status', 'ONGOING')
          .limit(1);
          
        if (!existing || existing.length === 0) {
          const hasFuelData = wsMessage?.fuel_probe_1_level && parseFloat(wsMessage.fuel_probe_1_level) > 0;
          
          if (hasFuelData) {
            // Create session with fuel data immediately
            const fuelData = {
              fuel_probe_1_level: parseFloat(wsMessage.fuel_probe_1_level),
              fuel_probe_1_level_percentage: parseFloat(wsMessage.fuel_probe_1_level_percentage) || 0,
              fuel_probe_1_volume_in_tank: parseFloat(wsMessage.fuel_probe_1_volume_in_tank) || 0,
              fuel_probe_1_temperature: parseFloat(wsMessage.fuel_probe_1_temperature) || 0
            };
            
            await supabase.from('energy_rite_operating_sessions').insert({
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
            
            console.log(`✅ Engine session created for ${plate} - Opening: ${fuelData.fuel_probe_1_level}L`);
          } else {
            // Create session without fuel data, mark as pending
            const { data: newSession } = await supabase.from('energy_rite_operating_sessions').insert({
              branch: plate,
              company: 'KFC',
              session_date: currentTime.split('T')[0],
              session_start_time: currentTime,
              opening_fuel: 0,
              opening_percentage: 0,
              opening_volume: 0,
              opening_temperature: 0,
              session_status: 'ONGOING',
              notes: 'Engine started. Waiting for fuel data...'
            }).select().single();
            
            if (newSession) {
              this.pendingFuelUpdates.set(plate, { 
                sessionId: newSession.id, 
                statusLocTime: wsMessage.LocTime,
                timestamp: Date.now() 
              });
              console.log(`⏳ Engine session created for ${plate} - Waiting for fuel data`);
            }
          }
        } else {
          console.log(`ℹ️ Engine session already exists for ${plate}`);
        }
      } else if (engineStatus === 'OFF') {
        // Mark session for closure, wait for fuel data
        const { data: sessions } = await supabase
          .from('energy_rite_operating_sessions')
          .select('*')
          .eq('branch', plate)
          .eq('session_status', 'ONGOING')
          .order('session_start_time', { ascending: false })
          .limit(1);
          
        if (sessions && Array.isArray(sessions) && sessions.length > 0) {
          const session = sessions[0];
          const hasFuelData = wsMessage?.fuel_probe_1_level && parseFloat(wsMessage.fuel_probe_1_level) > 0;
          
          if (hasFuelData) {
            // Complete session immediately with fuel data
            await this.completeSession(session, currentTime, wsMessage);
          } else {
            // Mark session for closure, wait for fuel data
            this.pendingClosures.set(plate, { 
              sessionId: session.id, 
              endTime: currentTime,
              statusLocTime: wsMessage.LocTime,
              timestamp: Date.now() 
            });
            console.log(`⏳ Engine OFF for ${plate} - Waiting for fuel data to complete session`);
          }
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

  async completeSession(session, endTime, vehicleData) {
    try {
      const closingFuel = parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0;
      const closingPercentage = parseFloat(vehicleData.fuel_probe_1_level_percentage) || 0;
      const closingVolume = parseFloat(vehicleData.fuel_probe_1_volume_in_tank) || 0;
      const closingTemperature = parseFloat(vehicleData.fuel_probe_1_temperature) || 0;
      
      const startTime = new Date(session.session_start_time);
      const endTimeDate = new Date(endTime);
      const durationMs = endTimeDate.getTime() - startTime.getTime();
      const operatingHours = Math.max(0, durationMs / (1000 * 60 * 60));
      const startingFuel = session.opening_fuel || 0;
      const fuelConsumed = Math.max(0, startingFuel - closingFuel);
      const fuelCost = fuelConsumed * 20;
      const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
      
      await supabase.from('energy_rite_operating_sessions')
        .update({
          session_end_time: endTime,
          operating_hours: operatingHours,
          closing_fuel: closingFuel,
          closing_percentage: closingPercentage,
          closing_volume: closingVolume,
          closing_temperature: closingTemperature,
          total_usage: fuelConsumed,
          liter_usage_per_hour: literUsagePerHour,
          cost_for_usage: fuelCost,
          session_status: 'COMPLETED',
          notes: `Engine stopped. Duration: ${operatingHours.toFixed(2)}h, Opening: ${startingFuel}L, Closing: ${closingFuel}L, Used: ${fuelConsumed.toFixed(1)}L`
        })
        .eq('id', session.id);
        
      console.log(`🔴 Engine OFF: ${session.branch} - Used: ${fuelConsumed.toFixed(1)}L in ${operatingHours.toFixed(2)}h`);
    } catch (error) {
      console.error(`❌ Error completing session:`, error.message);
    }
  }

  async updatePendingClosure(plate, vehicleData) {
    try {
      if (!this.pendingClosures.has(plate)) return;
      
      const pending = this.pendingClosures.get(plate);
      
      // Find closest fuel data to ENGINE OFF LocTime
      const closestFuel = this.findClosestFuelData(plate, pending.statusLocTime);
      if (!closestFuel) {
        console.log(`⏳ Waiting for fuel data closer to ENGINE OFF time for ${plate}`);
        return;
      }
      
      // Get the session
      const { data: session } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('id', pending.sessionId)
        .single();
        
      if (session) {
        await this.completeSession(session, pending.endTime, closestFuel);
        this.pendingClosures.delete(plate);
        this.pendingFuelUpdates.delete(plate);
      }
      
    } catch (error) {
      console.error(`❌ Error updating pending closure for ${plate}:`, error.message);
    }
  }

  async updatePendingSessionFuel(plate, vehicleData) {
    try {
      if (!this.pendingFuelUpdates.has(plate)) return;
      
      const pending = this.pendingFuelUpdates.get(plate);
      
      // Find closest fuel data to ENGINE ON LocTime
      const closestFuel = this.findClosestFuelData(plate, pending.statusLocTime);
      if (!closestFuel) {
        console.log(`⏳ Waiting for fuel data closer to ENGINE ON time for ${plate}`);
        return;
      }
      
      // Update session with closest fuel data
      await supabase.from('energy_rite_operating_sessions')
        .update({
          opening_fuel: closestFuel.fuel_probe_1_volume_in_tank,
          opening_percentage: closestFuel.fuel_probe_1_level_percentage,
          opening_volume: closestFuel.fuel_probe_1_volume_in_tank,
          opening_temperature: closestFuel.fuel_probe_1_temperature,
          notes: `Engine started. Opening: ${closestFuel.fuel_probe_1_level}L (${closestFuel.fuel_probe_1_level_percentage}%)`
        })
        .eq('id', pending.sessionId);
        
      console.log(`✅ Updated pending session for ${plate} with fuel data: ${closestFuel.fuel_probe_1_level}L`);
      this.pendingFuelUpdates.delete(plate);
      
    } catch (error) {
      console.error(`❌ Error updating pending session fuel for ${plate}:`, error.message);
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = EnergyRiteWebSocketClient;