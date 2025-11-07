const { supabase } = require('../../supabase-client');
const axios = require('axios');

class EnhancedExecutiveDashboardController {

  /**
   * Get executive dashboard focused on continuous operations and daily metrics
   * - Total sites operating
   * - Litres used (non-cumulative)
   * - Total operational hours
   * - Sites running over 24 hours (continuous operations)
   */
  async getExecutiveDashboard(req, res) {
    try {
      const { date, costCode, costCodes } = req.query;
      
      // Use provided date or today
      const targetDate = date || new Date().toISOString().split('T')[0];
      const startOfDay = `${targetDate}T00:00:00.000Z`;
      const endOfDay = `${targetDate}T23:59:59.999Z`;
      
      console.log(`🎯 Executive Dashboard for ${targetDate}`);
      
      // Get current fleet status
      const vehicleResponse = await axios.get('http://64.227.138.235:3000/api/energy-rite/vehicles');
      let vehicles = vehicleResponse.data.data || [];
      
      // Apply cost code filtering if provided
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
      
      // Get operating sessions for the target date (non-cumulative)
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
        .eq('session_date', targetDate)
        .eq('session_status', 'COMPLETED');
        
      // Apply cost code filtering to sessions
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
      
      const { data: todaySessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;
      
      // Calculate daily operational metrics (non-cumulative)
      const totalLitresUsed = todaySessions.reduce((sum, s) => sum + (parseFloat(s.total_usage) || 0), 0);
      const totalOperationalHours = todaySessions.reduce((sum, s) => sum + (parseFloat(s.operating_hours) || 0), 0);
      const totalOperationalCost = todaySessions.reduce((sum, s) => sum + (parseFloat(s.cost_for_usage) || 0), 0);
      
      // Get unique sites that operated today
      const sitesOperatedToday = [...new Set(todaySessions.map(s => s.branch))];
      const totalSites = sitesOperatedToday.length;
      
      // Detect continuous operations (sites running over 24 hours)
      const continuousOperationsSites = await detectContinuousOperations(targetDate, costCode, costCodes);
      
      // Site breakdown with daily metrics
      const siteMetrics = {};
      todaySessions.forEach(session => {
        const site = session.branch;
        if (!siteMetrics[site]) {
          siteMetrics[site] = {
            site_name: site,
            cost_code: session.cost_code,
            total_sessions: 0,
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            is_continuous: continuousOperationsSites.some(cs => cs.site === site)
          };
        }
        
        siteMetrics[site].total_sessions++;
        siteMetrics[site].operating_hours += parseFloat(session.operating_hours || 0);
        siteMetrics[site].fuel_usage_liters += parseFloat(session.total_usage || 0);
        siteMetrics[site].operational_cost += parseFloat(session.cost_for_usage || 0);
      });
      
      // Convert to array and sort by operating hours
      const siteBreakdown = Object.values(siteMetrics)
        .map(site => ({
          ...site,
          efficiency_liters_per_hour: site.operating_hours > 0 ? 
            Math.round((site.fuel_usage_liters / site.operating_hours) * 100) / 100 : 0,
          cost_per_hour: site.operating_hours > 0 ? 
            Math.round((site.operational_cost / site.operating_hours) * 100) / 100 : 0
        }))
        .sort((a, b) => b.operating_hours - a.operating_hours);
      
      // Cost center summary
      const costCenterMetrics = {};
      todaySessions.forEach(session => {
        const costCode = session.cost_code || 'UNKNOWN';
        if (!costCenterMetrics[costCode]) {
          costCenterMetrics[costCode] = {
            cost_code: costCode,
            sites: new Set(),
            operating_hours: 0,
            fuel_usage_liters: 0,
            operational_cost: 0,
            sessions: 0
          };
        }
        
        costCenterMetrics[costCode].sites.add(session.branch);
        costCenterMetrics[costCode].operating_hours += parseFloat(session.operating_hours || 0);
        costCenterMetrics[costCode].fuel_usage_liters += parseFloat(session.total_usage || 0);
        costCenterMetrics[costCode].operational_cost += parseFloat(session.cost_for_usage || 0);
        costCenterMetrics[costCode].sessions++;
      });
      
      const costCenterSummary = Object.values(costCenterMetrics)
        .map(cc => ({
          cost_code: cc.cost_code,
          sites_count: cc.sites.size,
          sites: Array.from(cc.sites),
          operating_hours: Math.round(cc.operating_hours * 100) / 100,
          fuel_usage_liters: Math.round(cc.fuel_usage_liters * 100) / 100,
          operational_cost: Math.round(cc.operational_cost * 100) / 100,
          sessions: cc.sessions,
          avg_fuel_per_hour: cc.operating_hours > 0 ? 
            Math.round((cc.fuel_usage_liters / cc.operating_hours) * 100) / 100 : 0
        }))
        .sort((a, b) => b.operating_hours - a.operating_hours);
      
      // Current fleet status
      const currentlyActive = vehicles.filter(v => v.drivername !== 'PTO OFF / ENGINE OFF').length;
      const totalFleetSize = vehicles.length;
      const fleetUtilization = totalFleetSize > 0 ? (currentlyActive / totalFleetSize) * 100 : 0;
      
      // Build response
      const dashboard = {
        date: targetDate,
        filters: {
          cost_code: costCode || null,
          cost_codes: costCodes || null
        },
        
        // Key metrics you requested
        key_metrics: {
          total_sites_operated: totalSites,
          total_litres_used: Math.round(totalLitresUsed * 100) / 100,
          total_operational_hours: Math.round(totalOperationalHours * 100) / 100,
          continuous_operations_count: continuousOperationsSites.length,
          total_operational_cost: Math.round(totalOperationalCost * 100) / 100
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
        
        // Site performance breakdown
        site_performance: siteBreakdown,
        
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
          `${totalSites} sites operated today with ${Math.round(totalOperationalHours)} total hours`,
          `${Math.round(totalLitresUsed)}L fuel consumed (non-cumulative daily usage)`,
          `${continuousOperationsSites.length} sites running continuous operations (24+ hours)`,
          `Fleet utilization: ${Math.round(fleetUtilization)}% (${currentlyActive}/${totalFleetSize} active)`,
          `Average efficiency: ${totalOperationalHours > 0 ? Math.round((totalLitresUsed / totalOperationalHours) * 10) / 10 : 0}L per hour`
        ]
      };
      
      res.status(200).json({
        success: true,
        data: dashboard,
        timestamp: new Date().toISOString(),
        note: "Metrics are non-cumulative and reset daily. Continuous operations detected based on 24+ hour patterns."
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