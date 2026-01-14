const { supabase } = require('../../supabase-client');
const axios = require('axios');

class EnhancedExecutiveDashboardController {

  /**
   * Get executive dashboard focused on cumulative operations and fuel tracking
   * - Total sites operating
   * - Litres used (cumulative)
   * - Litres filled (from fuel fill events)
   * - Total operational hours
   * - Sites running over 24 hours (continuous operations)
   */
  async getExecutiveDashboard(req, res) {
    try {
      const { 
        date, 
        start_date,
        end_date,
        costCode, 
        cost_code, 
        costCodes, 
        cost_codes,
        period = 30 
      } = req.query;
      
      // Support both camelCase and snake_case parameter names
      const finalCostCode = costCode || cost_code;
      const finalCostCodes = costCodes || cost_codes;
      const finalStartDate = start_date;
      const finalEndDate = end_date;
      
      // Use provided date or today for end date
      const targetDate = finalEndDate || date || new Date().toISOString().split('T')[0];
      
      // Calculate cumulative period start date
      const endDate = new Date(targetDate);
      const startDate = finalStartDate ? new Date(finalStartDate) : new Date(endDate.getTime() - parseInt(period) * 24 * 60 * 60 * 1000);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      console.log(`🎯 Executive Dashboard: ${startDateStr} to ${targetDate} (${period} days cumulative)`);
      console.log(`🔍 Cost code filter: ${finalCostCode || finalCostCodes || 'None'}`);
      
      // Get current fleet status
      const vehicleResponse = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
      let vehicles = vehicleResponse.data.data || [];
      
      // Apply cost code filtering if provided
      if (finalCostCode || finalCostCodes) {
        const costCenterAccess = require('../../helpers/cost-center-access');
        let accessibleCostCodes = [];
        
        if (finalCostCodes) {
          const codeArray = finalCostCodes.split(',').map(c => c.trim());
          for (const code of codeArray) {
            const accessible = await costCenterAccess.getAccessibleCostCenters(code);
            accessibleCostCodes.push(...accessible);
          }
        } else if (finalCostCode) {
          accessibleCostCodes = await costCenterAccess.getAccessibleCostCenters(finalCostCode);
        }
        
        console.log(`🔐 Accessible cost codes: ${accessibleCostCodes.join(', ')}`);
        
        const { data: vehicleLookup } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code')
          .in('cost_code', accessibleCostCodes);
          
        const costCodeMap = {};
        vehicleLookup?.forEach(v => {
          costCodeMap[v.plate] = v.cost_code;
        });
        
        vehicles = vehicles.filter(v => {
          const vCostCode = costCodeMap[v.branch] || v.cost_code;
          return accessibleCostCodes.includes(vCostCode);
        });
      }
      
      // Get operating sessions for the cumulative period - fetch all first
      let sessionsQuery = supabase
        .from('energy_rite_operating_sessions')
        .select(`
          *,
          session_date,
          session_start_time,
          session_end_time,
          operating_hours,
          total_usage,
          cost_for_usage,
          branch,
          cost_code
        `)
        .gte('session_date', startDateStr)
        .lte('session_date', targetDate)
        .eq('session_status', 'COMPLETED');
      
      const { data: allSessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;
      
      console.log(`📊 Found ${allSessions?.length || 0} total sessions`);
      
      // Apply cost code filtering in memory (filter by cost_code OR branch)
      let sessions = allSessions || [];
      if (finalCostCode || finalCostCodes) {
        const costCenterAccess = require('../../helpers/cost-center-access');
        let accessibleCostCodes = [];
        let vehiclePlatesForCostCode = [];
        
        if (finalCostCodes) {
          const codeArray = finalCostCodes.split(',').map(c => c.trim());
          for (const code of codeArray) {
            const accessible = await costCenterAccess.getAccessibleCostCenters(code);
            accessibleCostCodes.push(...accessible);
          }
        } else if (finalCostCode) {
          accessibleCostCodes = await costCenterAccess.getAccessibleCostCenters(finalCostCode);
        }
        
        // Get vehicle plates for these cost codes
        const { data: vehicleLookup } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code')
          .in('cost_code', accessibleCostCodes);
        
        vehiclePlatesForCostCode = vehicleLookup?.map(v => v.plate) || [];
        
        console.log(`🔐 Accessible cost codes: ${accessibleCostCodes.join(', ')}`);
        console.log(`🚗 Vehicle plates for filtering: ${vehiclePlatesForCostCode.length}`);
        
        // Filter sessions by EITHER cost_code OR branch/plate
        const beforeFilter = sessions.length;
        sessions = sessions.filter(session => {
          const matchesCostCode = accessibleCostCodes.includes(session.cost_code);
          const matchesPlate = vehiclePlatesForCostCode.includes(session.branch);
          return matchesCostCode || matchesPlate;
        });
        
        console.log(`🔍 Filtered sessions: ${beforeFilter} → ${sessions.length}`);
      }
      
      console.log(`📊 Final session count: ${sessions?.length || 0}`);
      
      // Get fuel fills for the cumulative period - fetch all first
      let fuelFillsQuery = supabase
        .from('energy_rite_fuel_fills')
        .select(`
          *,
          fill_date,
          plate,
          cost_code,
          fill_amount,
          fuel_before,
          fuel_after,
          detection_method
        `)
        .gte('fill_date', `${startDateStr}T00:00:00.000Z`)
        .lte('fill_date', `${targetDate}T23:59:59.999Z`)
        .eq('status', 'detected');
      
      const { data: allFuelFills, error: fillsError } = await fuelFillsQuery;
      if (fillsError) throw fillsError;
      
      // Apply cost code filtering in memory
      let fuelFills = allFuelFills || [];
      if (finalCostCode || finalCostCodes) {
        const costCenterAccess = require('../../helpers/cost-center-access');
        let accessibleCostCodes = [];
        let vehiclePlatesForCostCode = [];
        
        if (finalCostCodes) {
          const codeArray = finalCostCodes.split(',').map(c => c.trim());
          for (const code of codeArray) {
            const accessible = await costCenterAccess.getAccessibleCostCenters(code);
            accessibleCostCodes.push(...accessible);
          }
        } else if (finalCostCode) {
          accessibleCostCodes = await costCenterAccess.getAccessibleCostCenters(finalCostCode);
        }
        
        // Get vehicle plates for these cost codes
        const { data: vehicleLookup } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code')
          .in('cost_code', accessibleCostCodes);
        
        vehiclePlatesForCostCode = vehicleLookup?.map(v => v.plate) || [];
        
        // Filter fuel fills by EITHER cost_code OR plate
        const beforeFilter = fuelFills.length;
        fuelFills = fuelFills.filter(fill => {
          const matchesCostCode = accessibleCostCodes.includes(fill.cost_code);
          const matchesPlate = vehiclePlatesForCostCode.includes(fill.plate);
          return matchesCostCode || matchesPlate;
        });
        
        console.log(`⛽ Filtered fuel fills: ${beforeFilter} → ${fuelFills.length}`);
      }
      
      console.log(`⛽ Found ${fuelFills?.length || 0} fuel fills after filtering`);
      if (fillsError) throw fillsError;
      
      console.log(`⛽ Found ${fuelFills?.length || 0} fuel fills after filtering`);
      
      // Calculate cumulative operational metrics
      const totalLitresUsed = sessions.reduce((sum, s) => sum + (parseFloat(s.total_usage) || 0), 0);
      const totalLitresFilled = fuelFills.reduce((sum, f) => sum + (parseFloat(f.fill_amount) || 0), 0);
      const totalOperationalHours = sessions.reduce((sum, s) => sum + (parseFloat(s.operating_hours) || 0), 0);
      const totalOperationalCost = sessions.reduce((sum, s) => sum + (parseFloat(s.cost_for_usage) || 0), 0);
      
      // Get unique sites that operated during the period
      const sitesOperatedTotal = [...new Set(sessions.map(s => s.branch))];
      const totalSites = sitesOperatedTotal.length;
      
      // Get sites with fuel fills
      const sitesWithFills = [...new Set(fuelFills.map(f => f.plate))];
      
      // Detect continuous operations (sites running over 24 hours)
      const continuousOperationsSites = await detectContinuousOperations(targetDate, finalCostCode, finalCostCodes);
      
      // Site breakdown with cumulative metrics and fuel fills
      const siteMetrics = {};
      sessions.forEach(session => {
        const site = session.branch;
        if (!siteMetrics[site]) {
          siteMetrics[site] = {
            site_name: site,
            cost_code: session.cost_code,
            total_sessions: 0,
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            fuel_fills_count: 0,
            fuel_filled_liters: 0,
            is_continuous: continuousOperationsSites.some(cs => cs.site === site)
          };
        }
        
        siteMetrics[site].total_sessions++;
        siteMetrics[site].operating_hours += parseFloat(session.operating_hours || 0);
        siteMetrics[site].fuel_usage_liters += parseFloat(session.total_usage || 0);
        siteMetrics[site].operational_cost += parseFloat(session.cost_for_usage || 0);
      });
      
      // Add fuel fills data to site metrics
      fuelFills.forEach(fill => {
        const site = fill.plate;
        if (siteMetrics[site]) {
          siteMetrics[site].fuel_fills_count++;
          siteMetrics[site].fuel_filled_liters += parseFloat(fill.fill_amount || 0);
        } else {
          // Site had fuel fills but no operational sessions in this period
          siteMetrics[site] = {
            site_name: site,
            cost_code: fill.cost_code,
            total_sessions: 0,
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            fuel_fills_count: 1,
            fuel_filled_liters: parseFloat(fill.fill_amount || 0),
            is_continuous: false
          };
        }
      });
      
      // Convert to array and sort by operating hours
      const siteBreakdown = Object.values(siteMetrics)
        .map(site => ({
          ...site,
          efficiency_liters_per_hour: site.operating_hours > 0 ? 
            Math.round((site.fuel_usage_liters / site.operating_hours) * 100) / 100 : 0,
          cost_per_hour: site.operating_hours > 0 ? 
            Math.round((site.operational_cost / site.operating_hours) * 100) / 100 : 0,
          fuel_net_usage: site.fuel_usage_liters - site.fuel_filled_liters, // Net fuel consumption
          fuel_efficiency_with_fills: site.fuel_filled_liters > 0 ? 
            ((site.fuel_usage_liters / site.fuel_filled_liters) * 100).toFixed(2) + '%' : 'N/A'
        }))
        .sort((a, b) => b.operating_hours - a.operating_hours);
      
      // Cost center summary with fuel fills
      const costCenterMetrics = {};
      sessions.forEach(session => {
        const costCode = session.cost_code || 'UNKNOWN';
        if (!costCenterMetrics[costCode]) {
          costCenterMetrics[costCode] = {
            cost_code: costCode,
            sites: new Set(),
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            sessions: 0,
            fuel_fills_count: 0,
            fuel_filled_liters: 0
          };
        }
        
        costCenterMetrics[costCode].sites.add(session.branch);
        costCenterMetrics[costCode].operating_hours += parseFloat(session.operating_hours || 0);
        costCenterMetrics[costCode].fuel_usage_liters += parseFloat(session.total_usage || 0);
        costCenterMetrics[costCode].operational_cost += parseFloat(session.cost_for_usage || 0);
        costCenterMetrics[costCode].sessions++;
      });
      
      // Add fuel fills data to cost center metrics
      fuelFills.forEach(fill => {
        const costCode = fill.cost_code || 'UNKNOWN';
        if (!costCenterMetrics[costCode]) {
          costCenterMetrics[costCode] = {
            cost_code: costCode,
            sites: new Set(),
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            sessions: 0,
            fuel_fills_count: 0,
            fuel_filled_liters: 0
          };
        }
        
        costCenterMetrics[costCode].sites.add(fill.plate);
        costCenterMetrics[costCode].fuel_fills_count++;
        costCenterMetrics[costCode].fuel_filled_liters += parseFloat(fill.fill_amount || 0);
      });
      
      const costCenterSummary = Object.values(costCenterMetrics)
        .map(cc => ({
          cost_code: cc.cost_code,
          sites_count: cc.sites.size,
          sites: Array.from(cc.sites),
          operating_hours: Math.round(cc.operating_hours * 100) / 100,
          fuel_usage_liters: Math.round(cc.fuel_usage_liters * 100) / 100,
          fuel_filled_liters: Math.round(cc.fuel_filled_liters * 100) / 100,
          operational_cost: Math.round(cc.operational_cost * 100) / 100,
          sessions: cc.sessions,
          fuel_fills_count: cc.fuel_fills_count,
          avg_fuel_per_hour: cc.operating_hours > 0 ? 
            Math.round((cc.fuel_usage_liters / cc.operating_hours) * 100) / 100 : 0,
          fuel_net_usage: Math.round((cc.fuel_usage_liters - cc.fuel_filled_liters) * 100) / 100
        }))
        .sort((a, b) => b.operating_hours - a.operating_hours);
      
      // Current fleet status
      const currentlyActive = vehicles.filter(v => v.drivername !== 'PTO OFF / ENGINE OFF').length;
      const totalFleetSize = vehicles.length;
      const fleetUtilization = totalFleetSize > 0 ? (currentlyActive / totalFleetSize) * 100 : 0;
      
      // Build response
      const dashboard = {
        period: {
          start_date: startDateStr,
          end_date: targetDate, 
          days: parseInt(period),
          is_cumulative: true
        },
        filters: {
          cost_code: costCode || null,
          cost_codes: costCodes || null
        },
        
        // Key metrics you requested (now cumulative)
        key_metrics: {
          total_sites_operated: totalSites,
          total_litres_used: Math.round(totalLitresUsed * 100) / 100,
          total_litres_filled: Math.round(totalLitresFilled * 100) / 100,
          net_fuel_consumption: Math.round((totalLitresUsed - totalLitresFilled) * 100) / 100,
          total_operational_hours: Math.round(totalOperationalHours * 100) / 100,
          continuous_operations_count: continuousOperationsSites.length,
          total_operational_cost: Math.round(totalOperationalCost * 100) / 100,
          sites_with_fuel_fills: sitesWithFills.length,
          total_fuel_fill_events: fuelFills.length
        },
        
        // Current fleet status
        fleet_status: {
          total_fleet_size: totalFleetSize,
          currently_active: currentlyActive,
          fleet_utilization_percentage: Math.round(fleetUtilization * 100) / 100,
          inactive_vehicles: totalFleetSize - currentlyActive
        },
        
        // Continuous operations details
        continuous_operations: {
          sites_over_24_hours: continuousOperationsSites,
          count: continuousOperationsSites.length,
          total_hours: continuousOperationsSites.reduce((sum, co) => sum + co.total_hours, 0),
          total_fuel: continuousOperationsSites.reduce((sum, co) => sum + co.fuel_usage, 0)
        },
        
        // Fuel tracking analysis
        fuel_tracking: {
          fuel_fills_summary: {
            total_fill_events: fuelFills.length,
            total_litres_filled: Math.round(totalLitresFilled * 100) / 100,
            sites_with_fills: sitesWithFills.length,
            average_fill_amount: fuelFills.length > 0 ? 
              Math.round((totalLitresFilled / fuelFills.length) * 100) / 100 : 0
          },
          fuel_efficiency: {
            total_used: Math.round(totalLitresUsed * 100) / 100,
            total_filled: Math.round(totalLitresFilled * 100) / 100,
            net_consumption: Math.round((totalLitresUsed - totalLitresFilled) * 100) / 100,
            usage_to_fill_ratio: totalLitresFilled > 0 ? 
              Math.round((totalLitresUsed / totalLitresFilled) * 100) / 100 : 0,
            fill_frequency: totalSites > 0 ? 
              Math.round((fuelFills.length / totalSites) * 100) / 100 : 0
          }
        },
        
        // Site performance breakdown
        site_performance: siteBreakdown,
        
        // Top 10 sites by fuel usage
        top_performing_sites: siteBreakdown
          .filter(site => site.fuel_usage_liters > 0)
          .sort((a, b) => b.fuel_usage_liters - a.fuel_usage_liters)
          .slice(0, 10)
          .map(site => ({
            site: site.site_name,
            cost_code: site.cost_code,
            sessions: site.total_sessions,
            operating_hours: site.operating_hours,
            fuel_usage: site.fuel_usage_liters,
            fuel_filled: site.fuel_filled_liters,
            net_fuel_usage: site.fuel_net_usage,
            total_cost: site.operational_cost,
            efficiency: site.efficiency_liters_per_hour,
            cost_per_hour: site.cost_per_hour
          })),
        
        // Cost center analysis
        cost_center_analysis: costCenterSummary,
        
        // Efficiency metrics
        efficiency_metrics: {
          average_fuel_per_hour: totalOperationalHours > 0 ? 
            Math.round((totalLitresUsed / totalOperationalHours) * 100) / 100 : 0,
          average_cost_per_hour: totalOperationalHours > 0 ? 
            Math.round((totalOperationalCost / totalOperationalHours) * 100) / 100 : 0,
          average_hours_per_site: totalSites > 0 ? 
            Math.round((totalOperationalHours / totalSites) * 100) / 100 : 0,
          average_fuel_per_site: totalSites > 0 ? 
            Math.round((totalLitresUsed / totalSites) * 100) / 100 : 0
        },
        
        // Insights for executives
        executive_insights: [
          `${totalSites} sites operated over ${period} days with ${Math.round(totalOperationalHours)} total hours`,
          `${Math.round(totalLitresUsed)}L fuel consumed (cumulative over ${period} days)`,
          `${Math.round(totalLitresFilled)}L fuel filled across ${fuelFills.length} fill events`,
          `Net consumption: ${Math.round(totalLitresUsed - totalLitresFilled)}L (used minus filled)`,
          `${continuousOperationsSites.length} sites running continuous operations (24+ hours)`,
          `Fleet utilization: ${Math.round(fleetUtilization)}% (${currentlyActive}/${totalFleetSize} active)`,
          `Average efficiency: ${totalOperationalHours > 0 ? Math.round((totalLitresUsed / totalOperationalHours) * 10) / 10 : 0}L per hour`
        ]
      };
      
      res.status(200).json({
        success: true,
        data: dashboard,
        timestamp: new Date().toISOString(),
        note: `Metrics are cumulative over ${period} days (${startDateStr} to ${targetDate}). Includes fuel usage and fuel fill tracking.`
      });
      
    } catch (error) {
      console.error('Error generating enhanced executive dashboard:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Detect sites running continuous operations (over 24 hours)
 * This checks for operational patterns that suggest continuous running
 */
async function detectContinuousOperations(targetDate, costCode = null, costCodes = null) {
  try {
    // Look at the last 3 days to detect continuous patterns
    const threeDaysAgo = new Date(new Date(targetDate).getTime() - 3 * 24 * 60 * 60 * 1000);
    const startDate = threeDaysAgo.toISOString().split('T')[0];
    
    let sessionsQuery = supabase
      .from('energy_rite_operating_sessions')
      .select(`
        branch,
        cost_code,
        session_date,
        session_start_time,
        session_end_time,
        operating_hours,
        total_usage
      `)
      .gte('session_date', startDate)
      .lte('session_date', targetDate)
      .eq('session_status', 'COMPLETED')
      .order('branch, session_date, session_start_time');
      
    // Apply cost code filtering
    if (costCode || costCodes) {
      const costCenterAccess = require('../../helpers/cost-center-access');
      let accessibleCostCodes = [];
      
      if (costCodes) {
        const codeArray = costCodes.split(',').map(c => c.trim());
        for (const code of codeArray) {
          const accessible = await costCenterAccess.getAccessibleCostCenters(code);
          accessibleCostCodes.push(...accessible);
        }
      } else if (costCode) {
        accessibleCostCodes = await costCenterAccess.getAccessibleCostCenters(costCode);
      }
      
      sessionsQuery = sessionsQuery.in('cost_code', accessibleCostCodes);
    }
    
    const { data: sessions, error } = await sessionsQuery;
    if (error) throw error;
    
    // Group sessions by site
    const siteSessionGroups = {};
    sessions.forEach(session => {
      const site = session.branch;
      if (!siteSessionGroups[site]) {
        siteSessionGroups[site] = [];
      }
      siteSessionGroups[site].push(session);
    });
    
    const continuousOperationsSites = [];
    
    // Analyze each site for continuous operations
    Object.entries(siteSessionGroups).forEach(([site, siteSessions]) => {
      // Sort sessions by date and time
      siteSessions.sort((a, b) => {
        const dateCompare = new Date(a.session_date) - new Date(b.session_date);
        if (dateCompare === 0) {
          return a.session_start_time.localeCompare(b.session_start_time);
        }
        return dateCompare;
      });
      
      // Check for continuous operation patterns
      let continuousHours = 0;
      let continuousFuel = 0;
      let currentStreak = 0;
      let maxStreak = 0;
      let streakStart = null;
      
      // Look for sessions that indicate continuous operation
      for (let i = 0; i < siteSessions.length; i++) {
        const session = siteSessions[i];
        const sessionHours = parseFloat(session.operating_hours || 0);
        
        // If session is on target date, include in calculations
        if (session.session_date === targetDate) {
          continuousHours += sessionHours;
          continuousFuel += parseFloat(session.total_usage || 0);
        }
        
        // Check for streaks (sessions close together in time)
        if (i > 0) {
          const prevSession = siteSessions[i - 1];
          const timeDiff = calculateTimeDifference(prevSession, session);
          
          // If sessions are within 4 hours of each other, consider continuous
          if (timeDiff <= 4) {
            if (currentStreak === 0) {
              streakStart = prevSession;
              currentStreak = parseFloat(prevSession.operating_hours || 0);
            }
            currentStreak += sessionHours;
          } else {
            // Streak broken
            maxStreak = Math.max(maxStreak, currentStreak);
            currentStreak = 0;
          }
        } else {
          currentStreak = sessionHours;
        }
      }
      
      maxStreak = Math.max(maxStreak, currentStreak);
      
      // Site qualifies as continuous if:
      // 1. Has operations on target date AND
      // 2. Either total daily hours > 12 OR max streak > 20 hours
      if (continuousHours > 0 && (continuousHours > 12 || maxStreak > 20)) {
        continuousOperationsSites.push({
          site,
          cost_code: siteSessions[0].cost_code,
          total_hours: Math.round(continuousHours * 100) / 100,
          fuel_usage: Math.round(continuousFuel * 100) / 100,
          max_continuous_streak: Math.round(maxStreak * 100) / 100,
          sessions_today: siteSessions.filter(s => s.session_date === targetDate).length,
          pattern: maxStreak > 20 ? 'Long continuous run' : 'Multiple extended sessions'
        });
      }
    });
    
    return continuousOperationsSites.sort((a, b) => b.total_hours - a.total_hours);
    
  } catch (error) {
    console.error('Error detecting continuous operations:', error);
    return [];
  }
}

/**
 * Calculate time difference between two sessions in hours
 */
function calculateTimeDifference(session1, session2) {
  try {
    const end1 = new Date(`${session1.session_date}T${session1.session_end_time}`);
    const start2 = new Date(`${session2.session_date}T${session2.session_start_time}`);
    
    const diffMs = start2.getTime() - end1.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    return 24; // If error, assume they're far apart
  }
}

module.exports = new EnhancedExecutiveDashboardController();