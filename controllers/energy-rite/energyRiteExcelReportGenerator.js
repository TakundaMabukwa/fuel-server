const ExcelJS = require('exceljs');
const { supabase } = require('../../supabase-client');
const path = require('path');
const fs = require('fs');

class EnergyRiteExcelReportGenerator {
  
  /**
   * Generate comprehensive Excel report with expandable sections
   */
  async generateExcelReport(reportType = 'daily', targetDate = null, cost_code = null) {
    try {
      console.log(`🔄 Generating ${reportType} Excel report...`);
      
      // Default to today if no date provided
      const reportDate = targetDate ? new Date(targetDate) : new Date();
      console.log(`📅 Target date: ${reportDate.toISOString().split('T')[0]}`);
      const { startDate, endDate, periodName } = this.calculateDateRange(reportType, reportDate);
      
      // Get operating sessions data
      const sessionsData = await this.getOperatingSessionsData(startDate, endDate, cost_code);
      
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Fuel Report Summary');
      
      // Configure worksheet
      this.setupWorksheetLayout(worksheet);
      
      // Add header with logo space and title
      this.addReportHeader(worksheet, periodName, reportType);
      
      // Add summary data with expandable rows
      await this.addExpandableReportData(worksheet, sessionsData, reportType);
      
      // Generate unique filename with timestamp to avoid conflicts
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `Energy_Rite_${reportType}_Report_${periodName.replace(/\s+/g, '_')}_${timestamp}.xlsx`;
      const filePath = path.join(__dirname, '../../temp', fileName);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(filePath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Save workbook to buffer for Supabase upload
      const buffer = await workbook.xlsx.writeBuffer();
      
      console.log(`💾 Saving Excel file: ${fileName}`);
      
      // Upload to Supabase storage bucket
      const bucketPath = `reports/${new Date().getFullYear()}/${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('energyrite-reports')
        .upload(bucketPath, buffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        });
      
      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        // Fallback to local storage
        await workbook.xlsx.writeFile(filePath);
        var publicUrl = `/temp/${fileName}`;
        var fileSize = fs.statSync(filePath).size;
      } else {
        console.log('✅ File uploaded to Supabase storage');
        
        // Get public URL
        const { data: { publicUrl: bucketUrl } } = supabase.storage
          .from('energyrite-reports')
          .getPublicUrl(bucketPath);
        
        var publicUrl = bucketUrl;
        var fileSize = buffer.length;
        
        // Also save locally as backup
        await workbook.xlsx.writeFile(filePath);
      }
      
      // Store report record in database with public URL
      const reportRecord = await this.storeReportRecord({
        report_type: reportType,
        period_name: periodName,
        start_date: startDate,
        end_date: endDate,
        cost_code: cost_code || 'ALL',
        file_name: fileName,
        download_url: publicUrl,
        file_size: fileSize,
        bucket_path: uploadData ? bucketPath : null,
        total_sites: sessionsData.sites.length,
        total_sessions: sessionsData.totalSessions,
        total_operating_hours: sessionsData.totalOperatingHours
      });
      
      console.log(`📋 Report record stored with ID: ${reportRecord.id}`);
      
      console.log(`✅ Excel report generated successfully: ${fileName}`);
      
      return {
        success: true,
        report_id: reportRecord.id,
        file_name: fileName,
        download_url: publicUrl,
        public_url: publicUrl,
        bucket_path: uploadData ? bucketPath : null,
        file_size: fileSize,
        period: periodName,
        report_type: reportType,
        generated_at: new Date().toISOString(),
        stats: {
          total_sites: sessionsData.sites.length,
          total_sessions: sessionsData.totalSessions,
          total_operating_hours: sessionsData.totalOperatingHours
        }
      };
      
    } catch (error) {
      console.error('❌ Error generating Excel report:', error);
      throw error;
    }
  }
  
  /**
   * Calculate date range based on report type
   */
  calculateDateRange(reportType, targetDate) {
    const endDate = new Date(targetDate);
    let startDate = new Date(targetDate);
    let periodName = '';
    
    endDate.setHours(23, 59, 59, 999);
    
    switch (reportType) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        periodName = endDate.toISOString().slice(0, 10);
        break;
        
      case 'weekly':
        startDate.setDate(endDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        periodName = `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`;
        break;
        
      case 'monthly':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        periodName = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
        
      default:
        throw new Error(`Invalid report type: ${reportType}`);
    }
    
    console.log(`📅 Date range for ${reportType} report: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    return { startDate, endDate, periodName };
  }
  
  /**
   * Get operating sessions data from Supabase
   */
  async getOperatingSessionsData(startDate, endDate, cost_code = null) {
    try {
      console.log(`📊 Getting operating sessions data for Excel report`);
      
      // Get all sites for the cost code from vehicle lookup
      let allSites = [];
      if (cost_code) {
        const { data: vehicleLookup, error: lookupError } = await supabase
          .from('energyrite_vehicle_lookup')
          .select('plate, cost_code')
          .eq('cost_code', cost_code);
        
        if (lookupError) throw new Error(`Lookup error: ${lookupError.message}`);
        allSites = vehicleLookup.map(v => v.plate);
        console.log(`📋 Found ${allSites.length} sites for cost code ${cost_code}`);
      }
      
      // Get completed operating sessions
      let query = supabase
        .from('energy_rite_operating_sessions')
        .select('*')
        .eq('session_status', 'COMPLETED')
        .gte('session_start_time', startDate.toISOString())
        .lte('session_start_time', endDate.toISOString());
      
      // Filter by branch names if cost_code is provided
      if (cost_code && allSites.length > 0) {
        query = query.in('branch', allSites);
      }
      
      const { data: sessions, error } = await query.order('session_start_time', { ascending: false });
      
      if (error) throw new Error(`Database error: ${error.message}`);
      
      // Initialize all sites with zero values
      const siteGroups = {};
      
      // Add all sites from vehicle lookup with zero values
      allSites.forEach(siteName => {
        siteGroups[siteName] = {
          branch: siteName,
          company: 'KFC',
          cost_code: cost_code,
          sessions: [],
          total_sessions: 0,
          total_operating_hours: 0,
          total_fuel_usage: 0,
          total_fuel_filled: 0,
          total_cost: 0,
          avg_efficiency: 0
        };
      });
      
      // Add session data to existing sites
      sessions.forEach(session => {
        if (!siteGroups[session.branch]) {
          siteGroups[session.branch] = {
            branch: session.branch,
            company: session.company || 'KFC',
            cost_code: cost_code || session.cost_code,
            sessions: [],
            total_sessions: 0,
            total_operating_hours: 0,
            total_fuel_usage: 0,
            total_fuel_filled: 0,
            total_cost: 0
          };
        }
        
        const site = siteGroups[session.branch];
        site.sessions.push(session);
        site.total_sessions += 1;
        site.total_operating_hours += parseFloat(session.operating_hours || 0);
        site.total_fuel_usage += parseFloat(session.total_usage || 0);
        site.total_fuel_filled += parseFloat(session.total_fill || 0);
        site.total_cost += parseFloat(session.cost_for_usage || 0);
      });
      
      // Calculate averages
      Object.values(siteGroups).forEach(site => {
        if (site.total_operating_hours > 0) {
          site.avg_efficiency = site.total_fuel_usage / site.total_operating_hours;
        } else {
          site.avg_efficiency = 0;
        }
      });
      
      const sites = Object.values(siteGroups);
      const totalSessions = sessions.length;
      const totalOperatingHours = sites.reduce((sum, site) => sum + site.total_operating_hours, 0);
      
      console.log(`📊 Retrieved ${sites.length} sites with ${totalSessions} completed sessions`);
      
      return {
        sites,
        totalSessions,
        totalOperatingHours: totalOperatingHours.toFixed(2)
      };
      
    } catch (error) {
      console.error('❌ Error fetching operating sessions data:', error);
      throw error;
    }
  }
  
  /**
   * Setup worksheet layout and styling
   */
  setupWorksheetLayout(worksheet) {
    worksheet.columns = [
      { width: 4 },   // A: Expand button column
      { width: 20 },  // B: Site
      { width: 12 },  // C: Date  
      { width: 15 },  // D: Operating Hours
      { width: 18 },  // E: Opening Percentage
      { width: 15 },  // F: Opening Fuel
      { width: 18 },  // G: Closing Percentage
      { width: 15 },  // H: Closing Fuel
      { width: 12 },  // I: Usage
      { width: 12 },  // J: Fill
      { width: 15 },  // K: Efficiency
      { width: 12 }   // L: Cost
    ];
    
    worksheet.properties.defaultRowHeight = 20;
  }
  
  /**
   * Add report header with logo space and title
   */
  addReportHeader(worksheet, periodName, reportType) {
    // Logo space (rows 1-6)
    worksheet.mergeCells('A1:L6');
    const logoCell = worksheet.getCell('A1');
    logoCell.value = 'Energy Rite - Smart Energy Made Simple';
    logoCell.font = { size: 16, bold: true, color: { argb: 'FF666666' } };
    logoCell.alignment = { horizontal: 'left', vertical: 'middle' };
    
    // Title
    worksheet.mergeCells('A7:L7');
    const titleCell = worksheet.getCell('A7');
    titleCell.value = 'FUEL REPORT SUMMARY';
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
    
    // Period
    worksheet.mergeCells('A8:L8');
    const periodCell = worksheet.getCell('A8');
    periodCell.value = periodName;
    periodCell.font = { size: 14, bold: true };
    periodCell.alignment = { horizontal: 'right', vertical: 'middle' };
    
    // Empty row
    worksheet.addRow([]);
  }
  
  /**
   * Add expandable report data with summary and detailed rows
   */
  async addExpandableReportData(worksheet, sessionsData, reportType) {
    // Header row
    const headerRow = worksheet.addRow([
      '', // Expand button column
      'Site',
      'Date',
      'Operating Hours',
      'Opening Percentage',
      'Opening Fuel',
      'Closing Percentage', 
      'Closing Fuel',
      'Usage',
      'Fill',
      'Efficiency',
      'Cost'
    ]);
    
    // Style header row
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Add totals for each site
    for (const site of sessionsData.sites) {
      const summaryRow = worksheet.addRow([
        '',
        site.branch,
        `${site.total_sessions} sessions`,
        this.formatDuration(site.total_operating_hours || 0),
        '', '', '', '',
        (site.total_fuel_usage || 0).toFixed(2),
        (site.total_fuel_filled || 0).toFixed(2),
        (site.avg_efficiency || 0).toFixed(2),
        `R${(site.total_cost || 0).toFixed(2)}`
      ]);
      
      // Style row
      summaryRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
    
    // Add totals summary
    worksheet.addRow([]);
    const totalRow = worksheet.addRow([
      '',
      `${reportType.toUpperCase()} TOTALS`,
      '',
      this.formatDuration(sessionsData.totalOperatingHours),
      '', '', '', '',
      sessionsData.sites.reduce((sum, site) => sum + site.total_fuel_usage, 0).toFixed(2),
      sessionsData.sites.reduce((sum, site) => sum + site.total_fuel_filled, 0).toFixed(2),
      '',
      `R${sessionsData.sites.reduce((sum, site) => sum + site.total_cost, 0).toFixed(2)}`
    ]);
    
    // Style totals row
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      cell.border = {
        top: { style: 'thick' },
        left: { style: 'thin' },
        bottom: { style: 'thick' },
        right: { style: 'thin' }
      };
    });
  }
  
  /**
   * Format duration from decimal hours to readable format
   */
  formatDuration(decimalHours) {
    if (!decimalHours || decimalHours === 0) return '0 minutes';
    
    const hoursNum = parseFloat(decimalHours);
    if (isNaN(hoursNum) || hoursNum === 0) return '0 minutes';
    
    const hours = Math.floor(hoursNum);
    const minutes = Math.round((hoursNum - hours) * 60);
    
    if (hours === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }
  
  /**
   * Store report record in database with full metadata
   */
  async storeReportRecord(reportData) {
    try {
      console.log(`💾 Storing report: ${reportData.report_type} for ${reportData.cost_code}`);
      
      const reportDate = reportData.start_date.toISOString().split('T')[0];
      
      // Always create new report record with unique filename
      const reportRecord = {
        cost_code: reportData.cost_code,
        report_type: reportData.report_type,
        report_url: reportData.download_url,
        report_date: reportDate,
        file_name: reportData.file_name,
        file_size: reportData.file_size || 0,
        bucket_path: reportData.bucket_path,
        period_name: reportData.period_name,
        total_sites: reportData.total_sites || 0,
        total_sessions: reportData.total_sessions || 0,
        total_operating_hours: parseFloat(reportData.total_operating_hours || 0),
        status: 'generated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('energy_rite_generated_reports')
        .insert(reportRecord)
        .select();
      
      console.log(`➕ Created new report`);
      
      if (error) {
        console.error('Database error details:', error);
        // If there's still a constraint error, return a mock ID to continue
        if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
          console.log('⚠️ Constraint violation, continuing without database record...');
          return { id: Date.now() }; // Use timestamp as mock ID
        }
        throw new Error(`Database error: ${error.message}`);
      }
      
      console.log(`✅ Report stored successfully with ID: ${data[0].id}`);
      return { id: data[0].id };
      
    } catch (error) {
      console.error('❌ Error storing report record:', error);
      throw error;
    }
  }
  
  /**
   * Generate daily report
   */
  async generateDailyReport(targetDate = null, cost_code = null) {
    return this.generateExcelReport('daily', targetDate, cost_code);
  }
  
  /**
   * Generate weekly report (last 7 days)
   */
  async generateWeeklyReport(targetDate = null, cost_code = null) {
    return this.generateExcelReport('weekly', targetDate, cost_code);
  }
  
  /**
   * Generate monthly report
   */
  async generateMonthlyReport(targetDate = null, cost_code = null) {
    return this.generateExcelReport('monthly', targetDate, cost_code);
  }
}

module.exports = new EnergyRiteExcelReportGenerator();