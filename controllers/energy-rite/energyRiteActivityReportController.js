const { supabase } = require('../../supabase-client');

class EnergyRiteActivityReportController {

  /**
   * Get enhanced activity report focusing on peak usage, operating hours, and generator metrics
   */
  async getActivityReport(req, res) {
    try {
      const { 
        site, 
        startDate, 
        endDate, 
        costCode,
        costCodes 
      } = req.query;

      // Default to last 7 days if no dates provided
      const defaultEndDate = new Date();
      const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const start = startDate || defaultStartDate.toISOString().split('T')[0];
      const end = endDate || defaultEndDate.toISOString().split('T')[0];

      // Get all sites for cost code(s) if provided
      let sitesForCostCode = [];
      if (costCode || costCodes) {
        let query = supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code');
        
        if (costCodes) {
          // Multiple cost codes (comma-separated)
          const codeArray = costCodes.split(',').map(c => c.trim());
          query = query.in('cost_code', codeArray);
        } else if (costCode) {
          // Single cost code
          query = query.eq('cost_code', costCode);
        }
        
        const { data: vehicleLookup } = await query;
        sitesForCostCode = vehicleLookup?.map(v => v.plate) || [];
      }

      // Build query for completed sessions
      let query = supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .gte('session_date', start)
        .lte('session_date', end)
        .eq('session_status', 'COMPLETED');

      if (site) {
        query = query.eq('branch', site);
      } else if ((costCode || costCodes) && sitesForCostCode.length > 0) {
        query = query.in('branch', sitesForCostCode);
      }

      const { data: sessions, error } = await query.order('session_start_time', { ascending: false });

      if (error) throw new Error(`Database error: ${error.message}`);

      // Initialize all sites with zero values
      const siteReports = {};
      if ((costCode || costCodes) && sitesForCostCode.length > 0) {
        // Get cost code mapping for each site
        const { data: vehicleLookup } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code')
          .in('plate', sitesForCostCode);
        
        const costCodeMap = {};
        vehicleLookup?.forEach(v => {
          costCodeMap[v.plate] = v.cost_code;
        });
        
        sitesForCostCode.forEach(siteName => {
          siteReports[siteName] = {
            generator: siteName,
            cost_code: costCodeMap[siteName] || costCode,
            company: 'KFC',
            total_sessions: 0,
            total_operating_hours: 0,
            total_fuel_usage: 0,
            total_fuel_fill: 0,
            total_cost: 0,
            peak_usage_amount: 0,
            peak_usage_session: null,
            longest_session_hours: 0,
            longest_session: null,
            sessions_by_hour: {},
            daily_breakdown: []
          };
        });
      }

      // Process sessions
      const hourlyUsage = {};
      const dailyUsage = {};

      sessions.forEach(session => {
        const siteName = session.branch;
        const sessionDate = session.session_date;
        const sessionHour = new Date(session.session_start_time).getHours();
        const operatingHours = parseFloat(session.operating_hours || 0);
        const fuelUsage = parseFloat(session.total_usage || 0);
        const fuelFill = parseFloat(session.total_fill || 0);
        const cost = parseFloat(session.cost_for_usage || 0);

        // Initialize site if not exists
        if (!siteReports[siteName]) {
          siteReports[siteName] = {
            generator: siteName,
            cost_code: session.cost_code,
            company: 'KFC',
            total_sessions: 0,
            total_operating_hours: 0,
            total_fuel_usage: 0,
            total_fuel_fill: 0,
            total_cost: 0,
            peak_usage_amount: 0,
            peak_usage_session: null,
            longest_session_hours: 0,
            longest_session: null,
            sessions_by_hour: {},
            daily_breakdown: []
          };
        }

        const report = siteReports[siteName];

        // Aggregate totals
        report.total_sessions++;
        report.total_operating_hours += operatingHours;
        report.total_fuel_usage += fuelUsage;
        report.total_fuel_fill += fuelFill;
        report.total_cost += cost;

        // Track peak usage session
        if (fuelUsage > report.peak_usage_amount) {
          report.peak_usage_amount = fuelUsage;
          report.peak_usage_session = {
            date: sessionDate,
            start_time: session.session_start_time,
            end_time: session.session_end_time,
            hours: operatingHours,
            usage: fuelUsage
          };
        }

        // Track longest session
        if (operatingHours > report.longest_session_hours) {
          report.longest_session_hours = operatingHours;
          report.longest_session = {
            date: sessionDate,
            start_time: session.session_start_time,
            end_time: session.session_end_time,
            hours: operatingHours,
            usage: fuelUsage
          };
        }

        // Track hourly usage for peak analysis
        if (!hourlyUsage[sessionHour]) {
          hourlyUsage[sessionHour] = { hour: sessionHour, total_usage: 0, sessions: 0 };
        }
        hourlyUsage[sessionHour].total_usage += fuelUsage;
        hourlyUsage[sessionHour].sessions++;

        // Track daily usage
        if (!dailyUsage[sessionDate]) {
          dailyUsage[sessionDate] = { date: sessionDate, total_usage: 0, sessions: 0 };
        }
        dailyUsage[sessionDate].total_usage += fuelUsage;
        dailyUsage[sessionDate].sessions++;
      });

      // Calculate metrics for each site
      Object.values(siteReports).forEach(report => {
        if (report.total_operating_hours > 0) {
          report.average_usage_per_hour = report.total_fuel_usage / report.total_operating_hours;
        } else {
          report.average_usage_per_hour = 0;
        }
      });

      // Peak usage analysis
      const peakHours = Object.values(hourlyUsage)
        .sort((a, b) => b.total_usage - a.total_usage)
        .slice(0, 5);

      const peakDays = Object.values(dailyUsage)
        .sort((a, b) => b.total_usage - a.total_usage)
        .slice(0, 5);

      const peakAnalysis = {
        peak_usage_hours: peakHours,
        peak_usage_days: peakDays,
        highest_usage_hour: peakHours[0] || null,
        highest_usage_day: peakDays[0] || null
      };

      const reportData = Object.values(siteReports);
      const totalHours = reportData.reduce((sum, r) => sum + r.total_operating_hours, 0);
      const totalUsage = reportData.reduce((sum, r) => sum + r.total_fuel_usage, 0);

      res.status(200).json({
        success: true,
        data: {
          period: { start_date: start, end_date: end },
          total_sites: reportData.length,
          peak_usage_analysis: peakAnalysis,
          generator_reports: reportData,
          summary: {
            total_sessions: reportData.reduce((sum, r) => sum + r.total_sessions, 0),
            total_operating_hours: totalHours,
            total_fuel_usage: totalUsage,
            total_fuel_fill: reportData.reduce((sum, r) => sum + r.total_fuel_fill, 0),
            total_cost: reportData.reduce((sum, r) => sum + r.total_cost, 0),
            average_efficiency: totalHours > 0 ? totalUsage / totalHours : 0
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error generating activity report:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get peak usage analysis
   */
  async getPeakUsageAnalysis(req, res) {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

      const { data: sessions, error } = await supabase
        .from('energy_rite_operating_sessions')
        .select('branch, session_date, total_usage, operating_hours, cost_code')
        .gte('session_date', startDate.toISOString().split('T')[0])
        .eq('session_status', 'COMPLETED')
        .order('total_usage', { ascending: false });

      if (error) throw new Error(`Database error: ${error.message}`);

      // Group by date and calculate daily totals
      const dailyUsage = {};
      sessions.forEach(session => {
        const date = session.session_date;
        if (!dailyUsage[date]) {
          dailyUsage[date] = { date, total_usage: 0, sites: new Set() };
        }
        dailyUsage[date].total_usage += parseFloat(session.total_usage || 0);
        dailyUsage[date].sites.add(session.branch);
      });

      // Convert to array and sort by usage
      const peakDays = Object.values(dailyUsage)
        .map(day => ({ ...day, sites: Array.from(day.sites) }))
        .sort((a, b) => b.total_usage - a.total_usage)
        .slice(0, 10);

      res.status(200).json({
        success: true,
        data: {
          analysis_period: `${days} days`,
          peak_usage_days: peakDays,
          highest_usage_day: peakDays[0] || null
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error generating peak usage analysis:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get site comparison report
   */
  async getSiteComparison(req, res) {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

      const { data: sessions, error } = await supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .gte('session_date', startDate.toISOString().split('T')[0])
        .eq('session_status', 'COMPLETED');

      if (error) throw new Error(`Database error: ${error.message}`);

      // Group by site and calculate metrics
      const siteMetrics = {};
      sessions.forEach(session => {
        const site = session.branch;
        if (!siteMetrics[site]) {
          siteMetrics[site] = {
            site,
            cost_code: session.cost_code,
            sessions: 0,
            total_hours: 0,
            total_usage: 0,
            total_cost: 0,
            efficiency_score: 0
          };
        }

        const metrics = siteMetrics[site];
        metrics.sessions++;
        metrics.total_hours += parseFloat(session.operating_hours || 0);
        metrics.total_usage += parseFloat(session.total_usage || 0);
        metrics.total_cost += parseFloat(session.cost_for_usage || 0);
      });

      // Calculate efficiency and sort
      const comparison = Object.values(siteMetrics)
        .map(site => ({
          ...site,
          avg_usage_per_hour: site.total_hours > 0 ? site.total_usage / site.total_hours : 0,
          avg_cost_per_hour: site.total_hours > 0 ? site.total_cost / site.total_hours : 0,
          efficiency_score: site.total_hours > 0 ? (site.total_usage / site.total_hours) : 0
        }))
        .sort((a, b) => b.total_usage - a.total_usage);

      res.status(200).json({
        success: true,
        data: {
          comparison_period: `${days} days`,
          site_comparison: comparison,
          top_consumer: comparison[0] || null,
          most_efficient: comparison.sort((a, b) => a.efficiency_score - b.efficiency_score)[0] || null
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error generating site comparison:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = new EnergyRiteActivityReportController();