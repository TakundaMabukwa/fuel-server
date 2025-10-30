const { supabase } = require('../supabase-client');
const axios = require('axios');

/**
 * Take daily activity snapshots at specific time periods
 */
class ActivitySnapshotManager {
  constructor() {
    this.timeSlots = {
      morning: { start: 7, end: 12, name: 'Morning' },
      afternoon: { start: 12, end: 17, name: 'Afternoon' },
      evening: { start: 17, end: 24, name: 'Evening' }
    };
  }

  /**
   * Take snapshot of current activity levels
   */
  async takeSnapshot() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split('T')[0];
      
      // Determine time slot (allow any time for testing)
      let timeSlot = null;
      for (const [key, slot] of Object.entries(this.timeSlots)) {
        if (currentHour >= slot.start && currentHour < slot.end) {
          timeSlot = key;
          break;
        }
      }
      
      // If outside defined slots, assign based on hour for testing
      if (!timeSlot) {
        if (currentHour < 7) timeSlot = 'evening'; // Late night = evening
        else if (currentHour >= 7 && currentHour < 12) timeSlot = 'morning';
        else if (currentHour >= 12 && currentHour < 17) timeSlot = 'afternoon';
        else timeSlot = 'evening';
      }
      
      // Get current vehicle data from API
      const response = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
      const vehicles = response.data.data;
      
      // Get cost code lookup for vehicles
      const { data: vehicleLookup } = await supabase
        .from('energyrite_vehicle_lookup')
        .select('plate, cost_code');
        
      const costCodeMap = {};
      vehicleLookup?.forEach(v => {
        costCodeMap[v.plate] = v.cost_code;
      });
      
      // Calculate activity metrics
      const snapshot = {
        snapshot_date: currentDate,
        snapshot_time: now.toISOString(),
        time_slot: timeSlot,
        time_slot_name: this.timeSlots[timeSlot].name,
        total_vehicles: vehicles.length,
        active_vehicles: 0,
        total_fuel_level: 0,
        average_fuel_percentage: 0,
        vehicles_data: []
      };
      
      vehicles.forEach(vehicle => {
        const isActive = vehicle.drivername !== 'PTO OFF / ENGINE OFF';
        const fuelLevel = parseFloat(vehicle.fuel_probe_1_level) || 0;
        const fuelPercentage = parseFloat(vehicle.fuel_probe_1_level_percentage) || 0;
        const costCode = costCodeMap[vehicle.branch] || vehicle.cost_code || null;
        
        if (isActive) snapshot.active_vehicles++;
        snapshot.total_fuel_level += fuelLevel;
        
        snapshot.vehicles_data.push({
          branch: vehicle.branch,
          company: vehicle.company,
          cost_code: costCode,
          is_active: isActive,
          fuel_level: fuelLevel,
          fuel_percentage: fuelPercentage,
          engine_status: vehicle.engine_status,
          last_activity: vehicle.last_activity_time
        });
      });
      
      snapshot.average_fuel_percentage = vehicles.length > 0 
        ? snapshot.vehicles_data.reduce((sum, v) => sum + v.fuel_percentage, 0) / vehicles.length 
        : 0;
      
      // Store snapshot
      const { error } = await supabase
        .from('energy_rite_activity_snapshots')
        .insert(snapshot);
        
      if (error) throw error;
      
      console.log(`📸 Activity snapshot taken: ${timeSlot} - ${snapshot.active_vehicles}/${snapshot.total_vehicles} active`);
      
      // Analyze if this is end of day (evening snapshot)
      if (timeSlot === 'evening') {
        await this.analyzeDailyActivity(currentDate);
      }
      
      return snapshot;
      
    } catch (error) {
      console.error('❌ Error taking activity snapshot:', error.message);
      return null;
    }
  }
  
  /**
   * Analyze daily activity patterns and log insights
   */
  async analyzeDailyActivity(date) {
    try {
      // Get all snapshots for the day
      const { data: snapshots, error } = await supabase
        .from('energy_rite_activity_snapshots')
        .select('*')
        .eq('snapshot_date', date)
        .order('snapshot_time', { ascending: true });
        
      if (error) throw error;
      if (!snapshots || snapshots.length === 0) return;
      
      // Find peak activity period
      let peakSnapshot = snapshots[0];
      snapshots.forEach(snapshot => {
        if (snapshot.active_vehicles > peakSnapshot.active_vehicles) {
          peakSnapshot = snapshot;
        }
      });
      
      // Create activity analysis
      const analysis = {
        analysis_date: date,
        snapshots_taken: snapshots.length,
        peak_activity_time_slot: peakSnapshot.time_slot,
        peak_activity_time_slot_name: peakSnapshot.time_slot_name,
        peak_active_vehicles: peakSnapshot.active_vehicles,
        peak_activity_percentage: (peakSnapshot.active_vehicles / peakSnapshot.total_vehicles) * 100,
        daily_summary: {
          morning: snapshots.find(s => s.time_slot === 'morning'),
          afternoon: snapshots.find(s => s.time_slot === 'afternoon'),
          evening: snapshots.find(s => s.time_slot === 'evening')
        },
        insights: []
      };
      
      // Generate insights
      if (peakSnapshot.time_slot === 'evening') {
        analysis.insights.push('Evening showed highest activity - peak operational period');
      }
      
      if (peakSnapshot.active_vehicles > (peakSnapshot.total_vehicles * 0.7)) {
        analysis.insights.push('High utilization detected - over 70% of fleet active');
      }
      
      const morningSnapshot = analysis.daily_summary.morning;
      const eveningSnapshot = analysis.daily_summary.evening;
      
      if (morningSnapshot && eveningSnapshot) {
        const activityIncrease = eveningSnapshot.active_vehicles - morningSnapshot.active_vehicles;
        if (activityIncrease > 0) {
          analysis.insights.push(`Activity increased by ${activityIncrease} vehicles from morning to evening`);
        }
      }
      
      // Log activity analysis
      await supabase.from('energy_rite_activity_log').insert({
        activity_type: 'DAILY_ACTIVITY_ANALYSIS',
        description: `Daily activity analysis for ${date} - Peak: ${analysis.peak_activity_time_slot_name}`,
        branch: 'SYSTEM',
        activity_data: analysis
      });
      
      console.log(`📊 Daily activity analysis completed for ${date}: Peak in ${analysis.peak_activity_time_slot_name}`);
      
      return analysis;
      
    } catch (error) {
      console.error('❌ Error analyzing daily activity:', error.message);
      return null;
    }
  }
  
  /**
   * Get activity snapshots for a date range
   */
  async getSnapshots(startDate, endDate) {
    try {
      const { data: snapshots, error } = await supabase
        .from('energy_rite_activity_snapshots')
        .select('*')
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate)
        .order('snapshot_time', { ascending: true });
        
      if (error) throw error;
      return snapshots;
      
    } catch (error) {
      console.error('❌ Error getting snapshots:', error.message);
      return [];
    }
  }
  
  /**
   * Analyze activity patterns across time periods
   */
  async analyzeActivityPatterns(startDate, endDate) {
    try {
      const snapshots = await this.getSnapshots(startDate, endDate);
      
      const patterns = {
        by_time_slot: { morning: [], afternoon: [], evening: [] },
        by_cost_code: {},
        by_site: {},
        trends: {
          most_active_time_slot: null,
          peak_activity_days: [],
          cost_code_activity: {},
          site_utilization: {}
        }
      };
      
      snapshots.forEach(snapshot => {
        // Group by time slot
        patterns.by_time_slot[snapshot.time_slot].push({
          date: snapshot.snapshot_date,
          active_vehicles: snapshot.active_vehicles,
          total_vehicles: snapshot.total_vehicles,
          utilization_rate: (snapshot.active_vehicles / snapshot.total_vehicles) * 100
        });
        
        // Analyze by cost code and site
        snapshot.vehicles_data.forEach(vehicle => {
          const costCode = vehicle.cost_code || 'UNKNOWN';
          const site = vehicle.branch;
          
          // Cost code patterns
          if (!patterns.by_cost_code[costCode]) {
            patterns.by_cost_code[costCode] = {
              morning: 0, afternoon: 0, evening: 0,
              total_snapshots: 0, active_count: 0
            };
          }
          patterns.by_cost_code[costCode][snapshot.time_slot]++;
          patterns.by_cost_code[costCode].total_snapshots++;
          if (vehicle.is_active) patterns.by_cost_code[costCode].active_count++;
          
          // Site patterns
          if (!patterns.by_site[site]) {
            patterns.by_site[site] = {
              cost_code: costCode,
              morning: 0, afternoon: 0, evening: 0,
              total_snapshots: 0, active_count: 0
            };
          }
          patterns.by_site[site][snapshot.time_slot]++;
          patterns.by_site[site].total_snapshots++;
          if (vehicle.is_active) patterns.by_site[site].active_count++;
        });
      });
      
      // Calculate trends
      const timeSlotTotals = {
        morning: patterns.by_time_slot.morning.reduce((sum, s) => sum + s.active_vehicles, 0),
        afternoon: patterns.by_time_slot.afternoon.reduce((sum, s) => sum + s.active_vehicles, 0),
        evening: patterns.by_time_slot.evening.reduce((sum, s) => sum + s.active_vehicles, 0)
      };
      
      patterns.trends.most_active_time_slot = Object.entries(timeSlotTotals)
        .sort(([,a], [,b]) => b - a)[0][0];
      
      // Cost code activity rates
      Object.entries(patterns.by_cost_code).forEach(([costCode, data]) => {
        patterns.trends.cost_code_activity[costCode] = {
          activity_rate: (data.active_count / data.total_snapshots) * 100,
          peak_time_slot: data.evening > data.afternoon && data.evening > data.morning ? 'evening' :
                         data.afternoon > data.morning ? 'afternoon' : 'morning'
        };
      });
      
      // Site utilization
      Object.entries(patterns.by_site).forEach(([site, data]) => {
        patterns.trends.site_utilization[site] = {
          cost_code: data.cost_code,
          utilization_rate: (data.active_count / data.total_snapshots) * 100,
          peak_time_slot: data.evening > data.afternoon && data.evening > data.morning ? 'evening' :
                         data.afternoon > data.morning ? 'afternoon' : 'morning'
        };
      });
      
      return patterns;
      
    } catch (error) {
      console.error('❌ Error analyzing activity patterns:', error.message);
      return null;
    }
  }
}

module.exports = new ActivitySnapshotManager();