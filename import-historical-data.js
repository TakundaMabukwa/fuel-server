#!/usr/bin/env node
require('dotenv').config();
const XLSX = require('xlsx');
const { supabase } = require('./supabase-client');
const fs = require('fs');
const path = require('path');

// Cost code mapping for your files
const COST_CODE_MAPPING = {
  'YUM Equity_Fuel Report': 'YUM-EQUITY-001',
  'Alchemy_Fuel Report': 'ALCHEMY-001', 
  'Gunret_Fuel-Report': 'GUNRET-001',
  'Spur_Fuel Report': 'SPUR-001',
  'Weekly (4)': 'WEEKLY-001'
};

async function importHistoricalData() {
  console.log('📊 Starting Historical Data Import...\n');
  
  try {
    const importFolder = './historical-imports';
    if (!fs.existsSync(importFolder)) {
      console.log('❌ Please create "historical-imports" folder and place your Excel files there');
      return;
    }
    
    const files = fs.readdirSync(importFolder).filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));
    
    if (files.length === 0) {
      console.log('❌ No Excel files found in historical-imports folder');
      return;
    }
    
    console.log(`📁 Found ${files.length} Excel files to import\n`);
    
    for (const file of files) {
      await processExcelFile(path.join(importFolder, file), file);
    }
    
    console.log('\n🎉 Historical data import completed!');
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
  }
}

async function processExcelFile(filePath, fileName) {
  console.log(`📄 Processing: ${fileName}`);
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Found ${data.length} rows of data`);
    
    let importedCount = 0;
    
    for (const row of data) {
      const sessionData = parseRowData(row, fileName);
      if (sessionData) {
        await insertHistoricalSession(sessionData);
        importedCount++;
      }
    }
    
    console.log(`✅ Imported ${importedCount} sessions from ${fileName}\n`);
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
  }
}

function getCostCodeFromFilename(fileName) {
  for (const [key, value] of Object.entries(COST_CODE_MAPPING)) {
    if (fileName.includes(key.replace('_', ' ')) || fileName.includes(key)) {
      return value;
    }
  }
  return null;
}

function parseRowData(row, fileName) {
  const site = row['FUEL REPORT SUMMARY'];
  const date = row['__EMPTY'];
  const operatingHours = row['__EMPTY_1'];
  
  // Skip header rows and summary rows
  if (!site || !date || !operatingHours || 
      site.includes('FUEL REPORT SUMMARY') || 
      site.includes('Site') || 
      date.includes('Date') || 
      date.includes('Total Running Hours')) {
    return null;
  }
  
  const duration = parseOperatingHours(operatingHours);
  if (!duration || duration <= 0) return null;
  
  const sessionDate = parseExcelDate(date);
  if (!sessionDate) return null;
  
  // Set realistic operating times (6 AM start)
  const startTime = new Date(sessionDate);
  startTime.setHours(6, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + (duration * 60 * 60 * 1000));
  
  // Ensure end time doesn't exceed 24 hours
  if (endTime.getDate() !== startTime.getDate()) {
    endTime.setHours(23, 59, 59, 999);
    endTime.setDate(startTime.getDate());
  }
  
  return {
    branch: site.trim(),
    company: 'KFC',
    cost_code: getActualCostCode(site.trim()),
    session_date: sessionDate.toISOString().split('T')[0],
    session_start_time: startTime.toISOString(),
    session_end_time: endTime.toISOString(),
    operating_hours: duration,
    opening_percentage: Math.round(parseFloat(String(row['__EMPTY_2'] || '0').replace('%', '').replace(',', '.')) * 100) / 100 || 0,
    opening_fuel: Math.round(parseFloat(String(row['__EMPTY_3'] || '0').replace(',', '.')) * 100) / 100 || 0,
    closing_percentage: Math.round(parseFloat(String(row['__EMPTY_4'] || '0').replace('%', '').replace(',', '.')) * 100) / 100 || 0,
    closing_fuel: Math.round(parseFloat(String(row['__EMPTY_5'] || '0').replace(',', '.')) * 100) / 100 || 0,
    total_usage: Math.round(Math.abs(parseFloat(String(row['__EMPTY_6'] || '0').replace(',', '.')) || 0) * 100) / 100,
    total_fill: Math.round(Math.abs(parseFloat(String(row['Total Fill'] || row['__EMPTY_7'] || '0').replace(',', '.')) || 0) * 100) / 100,
    liter_usage_per_hour: duration > 0 ? Math.round((Math.abs(parseFloat(String(row['__EMPTY_6'] || '0').replace(',', '.')) || 0) / duration) * 100) / 100 : 0,
    cost_for_usage: Math.round(Math.abs(parseFloat(String(row['__EMPTY_9'] || '0').split('=')[1]?.replace(',', '.') || String(row['__EMPTY_9'] || '0').replace(',', '.')) || 0) * 100) / 100,
    session_status: 'COMPLETED',
    notes: `Imported from ${fileName}`
  };
}

function parseOperatingHours(hoursText) {
  if (!hoursText) return null;
  
  // Skip summary rows and running time rows
  if (typeof hoursText === 'string' && 
      (hoursText.includes('Total Running Hours') || 
       hoursText.includes('Total Hours') ||
       hoursText.includes('Running Time') ||
       hoursText.includes('From:'))) {
    return null;
  }
  
  // Handle text formats
  if (typeof hoursText !== 'string') return null;
  
  let totalHours = 0;
  
  // Match hours and minutes patterns - be more specific
  const hourMatch = hoursText.match(/(\d+)\s*hours?/i);
  const minuteMatch = hoursText.match(/(\d+)\s*minutes?/i);
  
  // If we have both hours and minutes
  if (hourMatch && minuteMatch) {
    totalHours = parseInt(hourMatch[1]) + parseInt(minuteMatch[1]) / 60;
  }
  // If we only have hours
  else if (hourMatch && !minuteMatch) {
    totalHours = parseInt(hourMatch[1]);
  }
  // If we only have minutes
  else if (minuteMatch && !hourMatch) {
    totalHours = parseInt(minuteMatch[1]) / 60;
  }
  // Handle formats like "2:30" (hours:minutes)
  else {
    const timeMatch = hoursText.match(/(\d+):(\d+)/);
    if (timeMatch) {
      totalHours = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
    }
    // Handle pure numeric values
    else {
      const numeric = parseFloat(hoursText);
      if (!isNaN(numeric) && numeric > 0) {
        totalHours = numeric;
      }
    }
  }
  
  return totalHours > 0 ? Math.round(totalHours * 100) / 100 : null;
}

function parseExcelDate(dateValue) {
  if (!dateValue) return null;
  
  // Handle Excel serial date numbers
  if (typeof dateValue === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const days = dateValue - 2; // Excel counts from 1900-01-01 but has leap year bug
    return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
  }
  
  // Handle string dates
  if (typeof dateValue === 'string') {
    // Try various date formats
    const formats = [
      dateValue,
      dateValue.replace(/\//g, '-'),
      dateValue.replace(/\./g, '-')
    ];
    
    for (const format of formats) {
      const parsed = new Date(format);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
        return parsed;
      }
    }
  }
  
  return null;
}

function getActualCostCode(site) {
  const SITE_COST_CODES = {
    'NEW ROAD': 'KFC-0001-0001-0002-0004',
    'KEYWEST': 'KFC-0001-0001-0003',
    'DURBANVILL': 'KFC-0001-0001-0002-0002',
    'BAMBANANI': 'KFC-0001-0001-0003',
    'BLOEM1': 'KFC-0001-0001-0003',
    'KYALAMI': 'KFC-0001-0001-0002-0004',
    'REDS': 'KFC-0001-0001-0002-0003',
    'GALESHEWE': 'KFC-0001-0001-0003',
    'TAMBOTIE': 'KFC-0001-0001-0003',
    'JANSENPARK': 'KFC-0001-0001-0003',
    'FARRAMERE': 'KFC-0001-0001-0003',
    'KIMBERLEY2': 'KFC-0001-0001-0003',
    'ELDORADO': 'KFC-0001-0001-0003',
    'CHUMA MALL': 'KFC-0001-0001-0003',
    'FLORENTIA': 'KFC-0001-0001-0003',
    'NORTHMEAD': 'KFC-0001-0001-0003',
    'SPUR THUVL': 'KFC-0001-0002',
    'KRUGERSDOR': 'KFC-0001-0001-0003',
    'THE WEDGE': 'KFC-0001-0001-0003',
    'MOBILE 2': 'KFC-0001-0001-0003',
    'BLOEM2': 'KFC-0001-0001-0003',
    'BRACKENHUR': 'KFC-0001-0001-0003',
    'NOORDHEUW': 'KFC-0001-0001-0003',
    'PRELLER': 'KFC-0001-0001-0003',
    'MOBILE 4': 'KFC-0001-0001-0003',
    'LANGENHOVE': 'KFC-0001-0001-0003',
    'FERNDALE': 'KFC-0001-0001-0003',
    'BRAAMFONTE': 'KFC-0001-0001-0003',
    'BERGBRON': 'KFC-0001-0001-0003',
    'BIRCHNORTH': 'KFC-0001-0001-0003',
    'MEADOWDALE': 'KFC-0001-0001-0003',
    'CARLTONVIL': 'KFC-0001-0001-0003',
    'MOBILE 3': 'KFC-0001-0001-0003',
    'WOODMEAD': 'KFC-0001-0001-0002-0004',
    'NEW MARKET': 'KFC-0001-0001-0003',
    'BLUE HILL': 'KFC-0001-0001-0002-0004',
    'GRAYSTON': 'KFC-0001-0001-0003',
    'BLUEVALLEY': 'KFC-0001-0001-0002-0003',
    'BEYERSPARK': 'KFC-0001-0001-0003',
    'SPRINGS': 'KFC-0001-0001-0003',
    'HQ UNIT': 'KFC-0001-0001-0002-0001',
    'HQ BACKUP': 'KFC-0001-0001-0002-0001',
    'THABONG': 'KFC-0001-0001-0003',
    'PHOKENG': 'KFC-0001-0001-0002-0001-0002',
    'DENVER': 'KFC-0001-0001-0003',
    'RYNFIELD': 'KFC-0001-0001-0003',
    'CARLTONV 2': 'KFC-0001-0001-0003',
    'MARLBORO': 'KFC-0001-0001-0002-0004',
    'MILNERTON': 'KFC-0001-0001-0002-0002',
    'KBY WEST': 'KFC-0001-0001-0003',
    'MIDRANDMAL': 'KFC-0001-0001-0002-0004',
    'BIRCHSOUTH': 'KFC-0001-0001-0003',
    'RANDFONTEI': 'KFC-0001-0001-0003',
    'SUNWARD': 'KFC-0001-0001-0003',
    'LAMBTON': 'KFC-0001-0001-0003',
    'KROONSTAD2': 'KFC-0001-0001-0003',
    'HEBRON': 'KFC-0001-0001-0002-0005',
    'FOURWAYS': 'KFC-0001-0001-0003',
    'WILLOW': 'KFC-0001-0001-0003',
    'LYTTELTON': 'KFC-0001-0001-0002-0001-0001',
    'MORULA': 'KFC-0001-0001-0002-0005',
    'KIMBERLEY3': 'KFC-0001-0001-0003',
    'RANDBURG': 'KFC-0001-0001-0003',
    'CENTURION': 'KFC-0001-0001-0002-0003',
    'IRENE': 'KFC-0001-0001-0002-0003',
    'CASTLEGATE': 'KFC-0001-0001-0002-0005',
    'ALEX': 'KFC-0001-0001-0001',
    'MODDERSPRU': 'KFC-0001-0001-0002-0001-0001',
    'CARLTONV 3': 'KFC-0001-0001-0003',
    'GERMSITON': 'KFC-0001-0001-0003',
    'WESTONARIA': 'KFC-0001-0001-0003',
    'BOITEKONG': 'KFC-0001-0001-0002-0001-0002',
    'MUSHROOM': 'KFC-0001-0001-0002-0004',
    'FATIMA': 'KFC-0001-0001-0002-0001-0002',
    'RIETFONTEI': 'KFC-0001-0001-0002-0003',
    'BALLYCLARE': 'KFC-0001-0001-0002-0004',
    'EBONY': 'KFC-0001-0001-0002-0005',
    'LIONSPRIDE': 'KFC-0001-0001-0002-0004',
    'OLIEVENHOU': 'KFC-0001-0001-0002-0003',
    'WELKOM': 'KFC-0001-0001-0003',
    'OAKDALE': 'KFC-0001-0001-0002-0002',
    'SUNVALLEY': 'KFC-0001-0001-0002-0002',
    'VORNAVALL': 'KFC-0001-0001-0002-0004',
    'GLENMARAIS': 'KFC-0001-0001-0003',
    'RUSTENBU3': 'KFC-0001-0001-0002-0005',
    'SAFARI GAR': 'KFC-0001-0001-0002-0001-0001',
    'YARONA': 'KFC-0001-0001-0002-0005',
    'THLABANE': 'KFC-0001-0001-0002-0001-0002',
    'TRIANGLE': 'KFC-0001-0001-0002-0001-0001',
    'RUSTENBUR2': 'KFC-0001-0001-0002-0001-0002',
    'WAVERLY': 'KFC-0001-0001-0002-0005',
    'KROONSTAD': 'KFC-0001-0001-0003',
    'WIERDAPARK': 'KFC-0001-0001-0002-0003',
    'RIVONIA': 'KFC-0001-0001-0002-0004'
  };
  
  return SITE_COST_CODES[site.toUpperCase()] || 'KFC-0001-0001-0003';
}

async function insertHistoricalSession(sessionData) {
  try {
    const { error } = await supabase
      .from('energy_rite_operating_sessions')
      .insert([sessionData]);
    
    if (error) throw error;
    
  } catch (error) {
    console.error('❌ Error inserting session:', error.message);
  }
}

// Run the import
importHistoricalData();