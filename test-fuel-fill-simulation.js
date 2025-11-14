require('dotenv').config();
const { supabase } = require('./supabase-client');
const { detectFuelFill } = require('./helpers/fuel-fill-detector');

/**
 * Test script to simulate fuel fills and verify they're captured correctly
 * without affecting operating sessions - Works with real-time data processing
 */

class FuelFillSimulator {
  constructor() {
    this.testVehicles = [
      {
        plate: 'SUNVALLEY',
        baseLevel: 166.2,
        basePercentage: 81,
        baseVolume: 343.6,
        baseTemp: 27
      },
      {
        plate: 'MORULA', 
        baseLevel: 120.5,
        basePercentage: 65,
        baseVolume: 280.0,
        baseTemp: 25
      }
    ];
  }

  // Simulate normal vehicle data (no fuel fill)
  generateNormalData(vehicle) {
    return {
      Plate: vehicle.plate,
      Speed: Math.floor(Math.random() * 60),
      Latitude: -25.522689 + (Math.random() - 0.5) * 0.01,
      Longitude: 28.034974 + (Math.random() - 0.5) * 0.01,
      LocTime: Date.now().toString(),
      Quality: "60.42.2.146",
      Mileage: null,
      Pocsagstr: "",
      Head: "",
      Geozone: "Test Location, South Africa",
      DriverName: "",
      NameEvent: "",
      Temperature: "25,405,1007,2020,067E,2021,0D6C,2022,1B,2023,51",
      fuel_probe_1_level: vehicle.baseLevel + (Math.random() - 0.5) * 2, // Small variation
      fuel_probe_1_volume_in_tank: vehicle.baseVolume + (Math.random() - 0.5) * 5,
      fuel_probe_1_temperature: vehicle.baseTemp + (Math.random() - 0.5) * 3,
      fuel_probe_1_level_percentage: vehicle.basePercentage + (Math.random() - 0.5) * 2,
      message_type: 405
    };
  }

  // Simulate fuel fill sequence
  generateFuelFillSequence(vehicle) {
    const preFillLevel = vehicle.baseLevel - 10; // Lower level before fill
    const postFillLevel = vehicle.baseLevel + 35; // Higher level after fill
    const fillAmount = postFillLevel - preFillLevel;

    return {
      preFill: {
        Plate: vehicle.plate,
        Speed: 0, // Stationary during fill
        Latitude: -25.522689,
        Longitude: 28.034974,
        LocTime: Date.now().toString(),
        Quality: "60.42.2.146",
        Mileage: null,
        Pocsagstr: "",
        Head: "",
        Geozone: "Fuel Station, South Africa",
        DriverName: "Possible Fuel Fill", // Key indicator
        NameEvent: "",
        Temperature: "25,405,1007,2020,067E,2021,0D6C,2022,1B,2023,51",
        fuel_probe_1_level: preFillLevel,
        fuel_probe_1_volume_in_tank: vehicle.baseVolume - 20,
        fuel_probe_1_temperature: vehicle.baseTemp,
        fuel_probe_1_level_percentage: Math.round((preFillLevel / 200) * 100),
        message_type: 405
      },
      postFill: {
        Plate: vehicle.plate,
        Speed: 0,
        Latitude: -25.522689,
        Longitude: 28.034974,
        LocTime: (Date.now() + 300000).toString(), // 5 minutes later
        Quality: "60.42.2.146",
        Mileage: null,
        Pocsagstr: "",
        Head: "",
        Geozone: "Fuel Station, South Africa",
        DriverName: "", // Normal status after fill
        NameEvent: "",
        Temperature: "25,405,1007,2020,067E,2021,0D6C,2022,1B,2023,51",
        fuel_probe_1_level: postFillLevel,
        fuel_probe_1_volume_in_tank: vehicle.baseVolume + 15,
        fuel_probe_1_temperature: vehicle.baseTemp + 1,
        fuel_probe_1_level_percentage: Math.round((postFillLevel / 200) * 100),
        message_type: 405
      },
      fillAmount
    };
  }

  async simulateWebSocketData() {
    console.log('🚀 Starting fuel fill simulation...\n');

    // Check initial state
    await this.checkInitialState();

    // Simulate normal data for both vehicles
    console.log('📊 Sending normal vehicle data...');
    for (const vehicle of this.testVehicles) {
      const normalData = this.generateNormalData(vehicle);
      console.log(`   📡 ${vehicle.plate}: ${normalData.fuel_probe_1_level}L (${normalData.fuel_probe_1_level_percentage}%)`);
      
      // Simulate WebSocket message processing
      await this.processMessage(normalData);
      await this.sleep(1000);
    }

    await this.sleep(2000);

    // Simulate fuel fills with realistic timing
    console.log('\n⛽ Simulating fuel fills...');
    for (const vehicle of this.testVehicles) {
      const fillSequence = this.generateFuelFillSequence(vehicle);
      
      console.log(`\n🔽 ${vehicle.plate} - Pre-fill data:`);
      console.log(`   Fuel: ${fillSequence.preFill.fuel_probe_1_level}L (${fillSequence.preFill.fuel_probe_1_level_percentage}%)`);
      console.log(`   Status: "${fillSequence.preFill.DriverName}"`);
      
      await this.processMessage(fillSequence.preFill);
      await this.sleep(5000); // Wait 5 seconds for detection to process
      
      console.log(`🔼 ${vehicle.plate} - Post-fill data:`);
      console.log(`   Fuel: ${fillSequence.postFill.fuel_probe_1_level}L (${fillSequence.postFill.fuel_probe_1_level_percentage}%)`);
      console.log(`   Fill Amount: +${fillSequence.fillAmount.toFixed(1)}L`);
      
      await this.processMessage(fillSequence.postFill);
      await this.sleep(3000); // Allow time for final detection
    }

    // Check results after processing
    console.log('\n⏳ Processing results...');
    await this.sleep(5000); // Allow time for all database operations
    await this.checkResults();
  }

  async processMessage(data) {
    try {
      // Store fuel data (exactly like WebSocket client)
      const { error: insertError } = await supabase.from('energy_rite_fuel_data').insert({
        plate: data.Plate,
        fuel_probe_1_level: data.fuel_probe_1_level,
        fuel_probe_1_volume_in_tank: data.fuel_probe_1_volume_in_tank,
        fuel_probe_1_temperature: data.fuel_probe_1_temperature,
        fuel_probe_1_level_percentage: data.fuel_probe_1_level_percentage,
        speed: data.Speed,
        latitude: data.Latitude,
        longitude: data.Longitude,
        driver_name: data.DriverName,
        geozone: data.Geozone,
        message_type: data.message_type,
        raw_data: data
      });

      if (insertError) {
        console.error(`❌ Error storing fuel data:`, insertError.message);
        return;
      }

      // Run fuel fill detection (exactly like the real system)
      const fillResult = await detectFuelFill(data.Plate, data.fuel_probe_1_level, data.DriverName);
      
      if (fillResult.isFill) {
        console.log(`   ⛽ FUEL FILL DETECTED: ${data.Plate} - ${fillResult.fillDetails.detectionMethod}`);
        console.log(`      Fill: +${fillResult.fillDetails.fillAmount}L (${fillResult.fillDetails.fillPercentage}%)`);
      } else if (data.DriverName && data.DriverName.includes('Possible Fuel Fill')) {
        console.log(`   🚨 Fuel fill indicator detected for ${data.Plate} (${fillResult.reason})`);
      }

    } catch (error) {
      console.error(`❌ Error processing message for ${data.Plate}:`, error.message);
    }
  }

  async checkInitialState() {
    console.log('🔍 Checking initial state...\n');

    // Check existing sessions
    const { data: sessions } = await supabase
      .from('energy_rite_operating_sessions')
      .select('*')
      .eq('session_status', 'ONGOING')
      .in('branch', this.testVehicles.map(v => v.plate));

    console.log(`📋 Active sessions: ${sessions?.length || 0}`);
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        console.log(`   🟢 ${session.branch}: Started ${new Date(session.session_start_time).toLocaleTimeString()}`);
      });
    }

    // Check existing fuel fills
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: fills } = await supabase
      .from('energy_rite_fuel_fills')
      .select('*')
      .gte('fill_date', yesterday)
      .in('plate', this.testVehicles.map(v => v.plate));

    console.log(`⛽ Recent fuel fills (24h): ${fills?.length || 0}`);
    if (fills && fills.length > 0) {
      fills.forEach(fill => {
        console.log(`   📊 ${fill.plate}: +${fill.fill_amount}L at ${new Date(fill.fill_date).toLocaleTimeString()}`);
      });
    }
    console.log('');
  }

  async checkResults() {
    console.log('\n📊 SIMULATION RESULTS:\n');

    // Check fuel fills detected
    const { data: newFills } = await supabase
      .from('energy_rite_fuel_fills')
      .select('*')
      .gte('fill_date', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .in('plate', this.testVehicles.map(v => v.plate))
      .order('fill_date', { ascending: false });

    console.log(`⛽ NEW FUEL FILLS DETECTED: ${newFills?.length || 0}`);
    if (newFills && newFills.length > 0) {
      newFills.forEach(fill => {
        console.log(`   ✅ ${fill.plate}:`);
        console.log(`      Fill Amount: +${fill.fill_amount}L`);
        console.log(`      Before: ${fill.fuel_before}L → After: ${fill.fuel_after}L`);
        console.log(`      Detection: ${fill.detection_method}`);
        console.log(`      Time: ${new Date(fill.fill_date).toLocaleTimeString()}`);
        console.log('');
      });
    } else {
      console.log('   ❌ No fuel fills detected');
    }

    // Check sessions (should be unaffected)
    const { data: sessions } = await supabase
      .from('energy_rite_operating_sessions')
      .select('*')
      .eq('session_status', 'ONGOING')
      .in('branch', this.testVehicles.map(v => v.plate));

    console.log(`🔄 ACTIVE SESSIONS: ${sessions?.length || 0}`);
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        console.log(`   🟢 ${session.branch}:`);
        console.log(`      Started: ${new Date(session.session_start_time).toLocaleTimeString()}`);
        console.log(`      Opening Fuel: ${session.opening_fuel}L`);
        console.log(`      Fill Events: ${session.fill_events || 0}`);
        console.log(`      Fill Amount: ${session.fill_amount_during_session || 0}L`);
        console.log('');
      });
    } else {
      console.log('   ℹ️  No active sessions (this is normal if engines are off)');
    }

    // Check activity log
    const { data: activities } = await supabase
      .from('energy_rite_activity_log')
      .select('*')
      .gte('activity_time', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .in('branch', this.testVehicles.map(v => v.plate))
      .order('activity_time', { ascending: false });

    console.log(`📝 RECENT ACTIVITY LOG: ${activities?.length || 0} entries`);
    if (activities && activities.length > 0) {
      activities.slice(0, 5).forEach(activity => {
        console.log(`   📋 ${activity.branch}: ${activity.activity_type} at ${new Date(activity.activity_time).toLocaleTimeString()}`);
      });
    }

    console.log('\n✅ Simulation completed!');
    console.log('\n💡 Key Points:');
    console.log('   • Fuel fills should be detected and logged');
    console.log('   • Operating sessions should remain unaffected');
    console.log('   • Activity logs should show fuel fill events');
    console.log('   • No false engine ON/OFF events should be created');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run simulation
async function runSimulation() {
  const simulator = new FuelFillSimulator();
  
  try {
    await simulator.simulateWebSocketData();
  } catch (error) {
    console.error('❌ Simulation error:', error.message);
  } finally {
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runSimulation();
}

module.exports = FuelFillSimulator;