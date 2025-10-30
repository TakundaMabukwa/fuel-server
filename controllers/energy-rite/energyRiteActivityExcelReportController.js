const ExcelJS = require('exceljs');
const { supabase } = require('../../supabase-client');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

function setupWorksheetLayout(worksheet) {
  worksheet.columns = [
    { width: 20 }, // Site
    { width: 15 }, // Morning Usage
    { width: 15 }, // Morning Cost
    { width: 15 }, // Afternoon Usage
    { width: 15 }, // Afternoon Cost
    { width: 15 }, // Full Day Usage
    { width: 15 }, // Full Day Cost
    { width: 18 }, // Peak Period
    { width: 12 }, // Peak Usage
    { width: 12 }, // Sessions
    { width: 15 }  // Operating Hours
  ];
}

function addReportHeader(worksheet, activityData, costCode) {
  const workbook = worksheet.workbook;
  
  // Logo space (rows 1-6)
  worksheet.mergeCells('A1:K6');
  const logoCell = worksheet.getCell('A1');
  logoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  
  // Try to add logo image
  const fs = require('fs');
  const path = require('path');
  const logoPath = path.join(__dirname, '../../assets/logo.png');
  
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      const imageId = workbook.addImage({
        buffer: logoBuffer,
        extension: 'png'
      });
      worksheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.1 },
        br: { col: 5.9, row: 5.9 }
      });
    }
  } catch (error) {
    console.log('Logo not found, using text header');
  }
  
  logoCell.value = '';
  logoCell.alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Title with professional styling
  worksheet.mergeCells('A7:K7');
  const titleCell = worksheet.getCell('A7');
  titleCell.value = 'ACTIVITY FUEL USAGE REPORT';
  titleCell.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    top: { style: 'medium', color: { argb: 'FF666666' } },
    bottom: { style: 'medium', color: { argb: 'FF666666' } }
  };
  
  // Period with accent styling
  worksheet.mergeCells('A8:K8');
  const periodCell = worksheet.getCell('A8');
  periodCell.value = `Period: ${activityData.period.start_date} to ${activityData.period.end_date}`;
  periodCell.font = { size: 12, bold: true, color: { argb: 'FF333333' } };
  periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
  periodCell.alignment = { horizontal: 'center', vertical: 'middle' };
  periodCell.border = {
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
  };
  
  // Cost Code
  worksheet.mergeCells('A9:K9');
  const costCodeCell = worksheet.getCell('A9');
  costCodeCell.value = `Cost Center: ${costCode || 'ALL COST CENTERS'}`;
  costCodeCell.font = { size: 12, bold: true, color: { argb: 'FF333333' } };
  costCodeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
  costCodeCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Summary
  worksheet.mergeCells('A10:K10');
  const summaryCell = worksheet.getCell('A10');
  summaryCell.value = `Peak Period: ${activityData.summary.period_comparison.peak_period.replace('_', ' ').toUpperCase()} (${activityData.summary.period_comparison.peak_usage.toFixed(1)}L)`;
  summaryCell.font = { size: 11, italic: true, color: { argb: 'FF666666' } };
  summaryCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Empty row with subtle background
  const emptyRow = worksheet.addRow([]);
  emptyRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
  });
}

function addActivityData(worksheet, activityData) {
  const FUEL_PRICE_PER_LITER = 25; // R25 per liter
  
  // Header row
  const headerRow = worksheet.addRow([
    'Site',
    'Morning Usage (6AM-12PM)',
    'Morning Cost (R)',
    'Afternoon Usage (12PM-6PM)',
    'Afternoon Cost (R)',
    'Full Day Usage (6AM-6PM)',
    'Full Day Cost (R)',
    'Peak Period',
    'Peak Usage (L)',
    'Sessions',
    'Operating Hours'
  ]);
  
  // Style header
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF666666' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  
  // Add site data
  activityData.site_reports.forEach(site => {
    const morningUsage = site.period_breakdown.morning_to_afternoon;
    const afternoonUsage = site.period_breakdown.afternoon_to_evening;
    const fullDayUsage = site.period_breakdown.full_day_total;
    
    const morningCost = morningUsage * FUEL_PRICE_PER_LITER;
    const afternoonCost = afternoonUsage * FUEL_PRICE_PER_LITER;
    const fullDayCost = fullDayUsage * FUEL_PRICE_PER_LITER;
    
    const row = worksheet.addRow([
      site.generator,
      `${morningUsage.toFixed(2)}L`,
      `R${morningCost.toFixed(2)}`,
      `${afternoonUsage.toFixed(2)}L`,
      `R${afternoonCost.toFixed(2)}`,
      `${fullDayUsage.toFixed(2)}L`,
      `R${fullDayCost.toFixed(2)}`,
      site.peak_time_slot.replace('_', ' ').toUpperCase(),
      `${site.peak_fuel_usage.toFixed(2)}L`,
      site.total_sessions,
      `${site.total_operating_hours.toFixed(2)}h`
    ]);
    
    // Style data rows
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      
      // Highlight peak period
      if (colNumber === 8) {
        if (site.peak_time_slot === 'afternoon_to_evening') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
        }
      }
      
      // Highlight cost columns with light yellow background
      if ([3, 5, 7].includes(colNumber)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
      }
    });
  });
  
  // Add totals row
  worksheet.addRow([]);
  const totalMorningUsage = activityData.summary.total_morning_to_afternoon_usage;
  const totalAfternoonUsage = activityData.summary.total_afternoon_to_evening_usage;
  const totalFullDayUsage = activityData.summary.total_full_day_usage;
  
  const totalMorningCost = totalMorningUsage * FUEL_PRICE_PER_LITER;
  const totalAfternoonCost = totalAfternoonUsage * FUEL_PRICE_PER_LITER;
  const totalFullDayCost = totalFullDayUsage * FUEL_PRICE_PER_LITER;
  
  const totalRow = worksheet.addRow([
    'TOTALS',
    `${totalMorningUsage.toFixed(2)}L`,
    `R${totalMorningCost.toFixed(2)}`,
    `${totalAfternoonUsage.toFixed(2)}L`,
    `R${totalAfternoonCost.toFixed(2)}`,
    `${totalFullDayUsage.toFixed(2)}L`,
    `R${totalFullDayCost.toFixed(2)}`,
    activityData.summary.period_comparison.peak_period.replace('_', ' ').toUpperCase(),
    `${activityData.summary.period_comparison.peak_usage.toFixed(2)}L`,
    activityData.summary.total_sessions,
    `${activityData.summary.total_operating_hours.toFixed(2)}h`
  ]);
  
  // Style totals row
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = {
      top: { style: 'thick' }, left: { style: 'thin' },
      bottom: { style: 'thick' }, right: { style: 'thin' }
    };
    
    // Highlight total cost columns with darker yellow
    if ([3, 5, 7].includes(colNumber)) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
    }
  });
}

class EnergyRiteActivityExcelReportController {
  

  
  async generateActivityExcelReport(req, res) {
    try {
      const { costCode, startDate, endDate } = req.query;
      
      // Get activity report data via API call
      const params = new URLSearchParams();
      if (costCode) params.append('costCode', costCode);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await axios.get(`http://localhost:4000/api/energy-rite/activity-reports?${params.toString()}`);
      const activityData = response.data.data;
      
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Activity Report');
      
      // Setup worksheet
      setupWorksheetLayout(worksheet);
      addReportHeader(worksheet, activityData, costCode);
      addActivityData(worksheet, activityData);
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const costCodeSuffix = costCode ? `_${costCode}` : '_ALL';
      const fileName = `Activity_Report${costCodeSuffix}_${activityData.period.start_date}_to_${activityData.period.end_date}_${timestamp}.xlsx`;
      
      // Save to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      // Upload to Supabase storage
      const bucketPath = `activity-reports/${new Date().getFullYear()}/${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('energyrite-reports')
        .upload(bucketPath, buffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('energyrite-reports')
        .getPublicUrl(bucketPath);
      
      // Send automated email if requested
      if (req.query.sendEmail === 'true') {
        try {
          const emailService = require('../../services/energy-rite/emailService');
          const emailResult = await emailService.sendReportEmail({
            reportType: 'activity',
            period: `${activityData.period.start_date} to ${activityData.period.end_date}`,
            fileName: fileName,
            downloadUrl: publicUrl,
            costCode: costCode || null,
            stats: {
              total_sites: activityData.total_sites,
              total_sessions: activityData.summary.total_sessions,
              total_operating_hours: activityData.summary.total_operating_hours
            }
          });
          
          console.log('📧 Email result:', emailResult);
        } catch (emailError) {
          console.error('📧 Email sending failed:', emailError.message);
        }
      }
      
      res.status(200).json({
        success: true,
        message: 'Activity Excel report generated successfully',
        data: {
          file_name: fileName,
          download_url: publicUrl,
          period: activityData.period,
          cost_code: costCode || 'ALL',
          total_sites: activityData.total_sites,
          file_size: buffer.length
        }
      });
      
    } catch (error) {
      console.error('Error generating activity Excel report:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  

}

module.exports = new EnergyRiteActivityExcelReportController();