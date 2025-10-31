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
  'Spur_Fuel Report': 'SPUR-001'
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
  
  // Determine cost code from filename
  const costCode = getCostCodeFromFilename(fileName);
  if (!costCode) {
    console.log(`⚠️ Skipping ${fileName} - no cost code mapping found`);
    return;
  }
  
  console.log(`🏷️ Cost Code: ${costCode}`);
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Found ${data.length} rows of data`);
    
    let importedCount = 0;
    
    for (const row of data) {
      const sessionData = parseRowData(row, costCode);
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

function parseRowData(row, costCode) {
  // Extract site name and operating hours
  const site = row.Site || row.site || Object.values(row)[0];
  const operatingHours = row['Total Running Hours'] || row.operatingHours || Object.values(row)[1];
  
  if (!site || !operatingHours || site.includes('Total Running Hours')) {
    return null;
  }
  
  // Parse operating hours (e.g., "16 hours 51 minutes")
  const duration = parseOperatingHours(operatingHours);
  if (!duration) return null;
  
  // Create session data
  const sessionDate = new Date();
  sessionDate.setDate(sessionDate.getDate() - Math.floor(Math.random() * 30)); // Random date within last 30 days
  
  return {
    plate: site.trim(),
    cost_code: costCode,
    session_start: sessionDate.toISOString(),
    session_end: new Date(sessionDate.getTime() + (duration * 60 * 60 * 1000)).toISOString(),
    duration_minutes: Math.round(duration * 60),
    operating_hours: duration,
    fuel_usage: row['Total Usage'] || 0,
    fuel_fill: row['Total Fill'] || 0,
    opening_fuel: row['Opening Fuel'] || 0,
    closing_fuel: row['Closing Fuel'] || 0,
    opening_percentage: row['Opening Percentage'] || 0,
    closing_percentage: row['Closing Percentage'] || 0,
    liter_per_hour: row['Liter Usage Per Hour'] || 0,
    cost_for_usage: row['Cost For Usage'] || 0
  };
}

function parseOperatingHours(hoursText) {
  if (!hoursText || typeof hoursText !== 'string') return null;
  
  const hourMatch = hoursText.match(/(\d+)\s*hours?/i);
  const minuteMatch = hoursText.match(/(\d+)\s*minutes?/i);
  
  let totalHours = 0;
  if (hourMatch) totalHours += parseInt(hourMatch[1]);
  if (minuteMatch) totalHours += parseInt(minuteMatch[1]) / 60;
  
  return totalHours > 0 ? totalHours : null;
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