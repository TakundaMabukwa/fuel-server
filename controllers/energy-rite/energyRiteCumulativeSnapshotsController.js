const { supabase } = require('../../supabase-client');

/**
 * Get cumulative snapshots for a specific month
 */
const getCumulativeMonthlySnapshots = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { cost_code } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'Year and month parameters are required'
      });
    }

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

    // Get accessible cost codes if cost_code provided
    let accessibleCostCodes = [];
    if (cost_code) {
      try {
        const costCenterAccess = require('../../helpers/cost-center-access');
        accessibleCostCodes = await costCenterAccess.getAccessibleCostCenters(cost_code);
      } catch (error) {
        accessibleCostCodes = [cost_code];
      }
    }

    // Get all snapshots for the month
    let query = supabase
      .from('energy_rite_activity_snapshots')
      .select('*')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_time', { ascending: true });

    const { data: snapshots, error } = await query;

    if (error) throw error;

    if (!snapshots || snapshots.length === 0) {
      return res.json({
        success: true,
        data: {
          period: `${year}-${month}`,
          total_snapshots: 0,
          cumulative_metrics: {},
          daily_summaries: []
        }
      });
    }

    // Filter snapshots by cost code if provided
    let filteredSnapshots = snapshots;
    if (accessibleCostCodes.length > 0) {
      filteredSnapshots = snapshots.filter(snapshot => {
        if (!snapshot.vehicles_data) return false;
        return snapshot.vehicles_data.some(vehicle => 
          accessibleCostCodes.includes(vehicle.cost_code)
        );
      });
    }

    // Group by date and calculate cumulative metrics
    const dailySummaries = {};
    let cumulativeActiveHours = 0;
    let cumulativeFuelUsage = 0;
    let totalVehicleDays = 0;

    filteredSnapshots.forEach(snapshot => {
      const date = snapshot.snapshot_date;
      
      // Filter vehicles within snapshot by cost code
      let snapshotVehicles = snapshot.vehicles_data || [];
      if (accessibleCostCodes.length > 0) {
        snapshotVehicles = snapshotVehicles.filter(vehicle => 
          accessibleCostCodes.includes(vehicle.cost_code)
        );
      }
      
      const activeVehicles = snapshotVehicles.filter(v => v.is_active).length;
      const totalVehicles = snapshotVehicles.length;
      
      if (!dailySummaries[date]) {
        dailySummaries[date] = {
          date,
          snapshots: [],
          peak_active_vehicles: 0,
          total_fuel_level: 0,
          average_utilization: 0
        };
      }

      dailySummaries[date].snapshots.push({
        time_slot: snapshot.time_slot,
        active_vehicles: activeVehicles,
        total_vehicles: totalVehicles,
        utilization_rate: totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0
      });

      if (activeVehicles > dailySummaries[date].peak_active_vehicles) {
        dailySummaries[date].peak_active_vehicles = activeVehicles;
      }

      const fuelLevel = snapshotVehicles.reduce((sum, v) => sum + (v.fuel_level || 0), 0);
      dailySummaries[date].total_fuel_level += fuelLevel;
      totalVehicleDays += totalVehicles;
      cumulativeActiveHours += activeVehicles;
    });

    // Calculate daily averages
    Object.values(dailySummaries).forEach(day => {
      day.average_utilization = day.snapshots.reduce((sum, s) => sum + s.utilization_rate, 0) / day.snapshots.length;
    });

    // Calculate monthly fuel usage from operating sessions
    const startOfMonth = `${year}-${month.padStart(2, '0')}-01`;
    const endOfMonth = `${year}-${month.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
    
    let sessionsQuery = supabase
      .from('energy_rite_operating_sessions')
      .select('total_usage, session_date, session_start_time')
      .gte('session_date', startOfMonth)
      .lte('session_date', endOfMonth)
      .eq('session_status', 'COMPLETED');
    
    if (accessibleCostCodes.length > 0) {
      sessionsQuery = sessionsQuery.in('cost_code', accessibleCostCodes);
    }
    
    const { data: sessions } = await sessionsQuery;
    
    // Group fuel usage by time periods
    const monthlyFuelUsage = {
      morning: 0, // 7-12
      afternoon: 0, // 12-17 
      evening: 0 // 17-24
    };
    
    sessions?.forEach(session => {
      const hour = new Date(session.session_start_time).getHours();
      const usage = parseFloat(session.total_usage || 0);
      
      if (hour >= 7 && hour < 12) monthlyFuelUsage.morning += usage;
      else if (hour >= 12 && hour < 17) monthlyFuelUsage.afternoon += usage;
      else if (hour >= 17 && hour < 24) monthlyFuelUsage.evening += usage;
    });

    const totalDays = Object.keys(dailySummaries).length;
    const avgVehiclesPerDay = filteredSnapshots.length > 0 ? totalVehicleDays / filteredSnapshots.length : 0;

    const result = {
      success: true,
      data: {
        period: `${year}-${month}`,
        cost_code: cost_code || 'All',
        accessible_cost_codes: accessibleCostCodes.length > 0 ? accessibleCostCodes : null,
        total_snapshots: filteredSnapshots.length,
        total_days_with_data: totalDays,
        cumulative_metrics: {
          total_active_vehicle_hours: cumulativeActiveHours,
          average_vehicles_per_day: Math.round(avgVehiclesPerDay),
          average_utilization_rate: (cumulativeActiveHours / totalVehicleDays) * 100,
          peak_single_day_active: Math.max(...Object.values(dailySummaries).map(d => d.peak_active_vehicles))
        },
        monthly_fuel_usage: {
          morning_7_12: monthlyFuelUsage.morning.toFixed(2),
          afternoon_12_17: monthlyFuelUsage.afternoon.toFixed(2),
          evening_17_24: monthlyFuelUsage.evening.toFixed(2),
          total_monthly: (monthlyFuelUsage.morning + monthlyFuelUsage.afternoon + monthlyFuelUsage.evening).toFixed(2)
        },
        daily_summaries: Object.values(dailySummaries).sort((a, b) => a.date.localeCompare(b.date))
      }
    };

    res.json(result);

  } catch (error) {
    console.error('Error getting cumulative monthly snapshots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getCumulativeMonthlySnapshots
};