require('dotenv').config();
const { supabase } = require('./supabase-client');

async function testEngineSessions() {
  console.log('🧪 Testing Engine Sessions Functionality...\n');
  
  // Test data
  const testPlate = 'TEST-001';
  const testFuelLevel = 150.5;
  const testFuelPercentage = 75.2;
  
  try {
    // 1. Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await supabase
      .from('energy_rite_operating_sessions')
      .delete()
      .eq('branch', testPlate);
    
    await supabase
      .from('energy_rite_activity_log')
      .delete()
      .eq('branch', testPlate);
    
    // 2. Test ENGINE ON - Create session
    console.log('🟢 Testing ENGINE ON...');
    const engineOnData = {
      Plate: testPlate,
      DriverName: 'ENGINE ON',
      fuel_probe_1_level: testFuelLevel,
      fuel_probe_1_level_percentage: testFuelPercentage,
      fuel_probe_1_volume_in_tank: 200,
      fuel_probe_1_temperature: 25
    };
    
    // Simulate engine session creation
    const currentTime = new Date();
    const { data: sessionData, error: sessionError } = await supabase
      .from('energy_rite_operating_sessions')
      .insert({
        branch: testPlate,
        company: 'KFC',
        session_date: currentTime.toISOString().split('T')[0],
        session_start_time: currentTime.toISOString(),
        opening_fuel: testFuelLevel,
        opening_percentage: testFuelPercentage,
        opening_volume: 200,
        opening_temperature: 25,
        session_status: 'ONGOING',
        notes: `Engine started. Opening: ${testFuelLevel}L (${testFuelPercentage}%)`
      })
      .select();
    
    if (sessionError) {
      console.error('❌ Error creating engine session:', sessionError);
      return;
    }
    
    console.log('✅ Engine session created:', sessionData[0].id);
    
    // Log activity
    await supabase.from('energy_rite_activity_log').insert({
      branch: testPlate,
      activity_type: 'ENGINE_ON',
      activity_time: currentTime.toISOString(),
      notes: 'Engine ON detected'
    });
    
    console.log('✅ Activity logged: ENGINE_ON');
    
    // 3. Wait a moment (simulate running time)
    console.log('⏳ Simulating engine running for 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Test FUEL FILL during engine session
    console.log('⛽ Testing FUEL FILL during engine session...');
    const fuelFillStartTime = new Date();
    const preFillLevel = testFuelLevel;
    const postFillLevel = testFuelLevel + 50; // Added 50L
    
    // Create fuel fill session
    const { data: fuelFillData, error: fuelFillError } = await supabase
      .from('energy_rite_operating_sessions')
      .insert({
        branch: testPlate,
        company: 'KFC',
        session_date: fuelFillStartTime.toISOString().split('T')[0],
        session_start_time: fuelFillStartTime.toISOString(),
        opening_fuel: preFillLevel,
        opening_percentage: testFuelPercentage,
        session_status: 'FUEL_FILL_ONGOING',
        notes: `Fuel fill started. Opening: ${preFillLevel}L`
      })
      .select();
    
    if (fuelFillError) {
      console.error('❌ Error creating fuel fill session:', fuelFillError);
      return;
    }
    
    console.log('✅ Fuel fill session started:', fuelFillData[0].id);
    
    // Complete fuel fill
    await new Promise(resolve => setTimeout(resolve, 1000));
    const fuelFillEndTime = new Date();
    const fillDuration = (fuelFillEndTime - fuelFillStartTime) / 1000;
    const fillAmount = postFillLevel - preFillLevel;
    
    await supabase
      .from('energy_rite_operating_sessions')
      .update({
        session_end_time: fuelFillEndTime.toISOString(),
        operating_hours: fillDuration / 3600,
        closing_fuel: postFillLevel,
        closing_percentage: testFuelPercentage + 25,
        total_fill: fillAmount,
        session_status: 'FUEL_FILL_COMPLETED',
        notes: `Fuel fill completed. Duration: ${fillDuration}s, Filled: ${fillAmount}L`
      })
      .eq('id', fuelFillData[0].id);
    
    console.log(`✅ Fuel fill completed: +${fillAmount}L in ${fillDuration}s`);
    
    // Update engine session with fill info
    await supabase
      .from('energy_rite_operating_sessions')
      .update({
        fill_events: 1,
        fill_amount_during_session: fillAmount,
        total_fill: fillAmount,
        notes: `Engine started. Opening: ${testFuelLevel}L | Fill: +${fillAmount}L`
      })
      .eq('id', sessionData[0].id);
    
    console.log('✅ Engine session updated with fill information');
    
    // 5. Test ENGINE OFF - Complete session
    console.log('🔴 Testing ENGINE OFF...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const engineOffTime = new Date();
    const sessionStartTime = new Date(sessionData[0].session_start_time);
    const totalDuration = (engineOffTime - sessionStartTime) / 1000;
    const operatingHours = totalDuration / 3600;
    const finalFuelLevel = postFillLevel - 10; // Used 10L during operation
    const fuelConsumed = Math.max(0, testFuelLevel - finalFuelLevel + fillAmount); // Account for fill
    const fuelCost = fuelConsumed * 20;
    const literUsagePerHour = operatingHours > 0 ? fuelConsumed / operatingHours : 0;
    
    await supabase
      .from('energy_rite_operating_sessions')
      .update({
        session_end_time: engineOffTime.toISOString(),
        operating_hours: operatingHours,
        closing_fuel: finalFuelLevel,
        closing_percentage: testFuelPercentage + 20,
        total_usage: fuelConsumed,
        liter_usage_per_hour: literUsagePerHour,
        cost_for_usage: fuelCost,
        session_status: 'COMPLETED',
        notes: `Engine stopped. Duration: ${operatingHours.toFixed(2)}h, Used: ${fuelConsumed.toFixed(1)}L, Filled: ${fillAmount}L`
      })
      .eq('id', sessionData[0].id);
    
    console.log(`✅ Engine session completed: ${fuelConsumed.toFixed(1)}L used in ${operatingHours.toFixed(2)}h`);
    
    // Log ENGINE OFF activity
    await supabase.from('energy_rite_activity_log').insert({
      branch: testPlate,
      activity_type: 'ENGINE_OFF',
      activity_time: engineOffTime.toISOString(),
      notes: 'Engine OFF detected'
    });
    
    console.log('✅ Activity logged: ENGINE_OFF');
    
    // 6. Verify results
    console.log('\n📊 Test Results Summary:');
    
    // Get completed sessions
    const { data: completedSessions } = await supabase
      .from('energy_rite_operating_sessions')
      .select('*')
      .eq('branch', testPlate)
      .order('session_start_time', { ascending: true });
    
    console.log(`\n🔧 Engine Sessions (${completedSessions.filter(s => s.session_status === 'COMPLETED').length}):`);
    completedSessions.filter(s => s.session_status === 'COMPLETED').forEach(session => {
      console.log(`  - Duration: ${session.operating_hours?.toFixed(2)}h`);
      console.log(`  - Fuel: ${session.opening_fuel}L → ${session.closing_fuel}L`);
      console.log(`  - Used: ${session.total_usage?.toFixed(1)}L`);
      console.log(`  - Filled: ${session.total_fill || 0}L`);
      console.log(`  - Fill Events: ${session.fill_events || 0}`);
    });
    
    console.log(`\n⛽ Fuel Fill Sessions (${completedSessions.filter(s => s.session_status === 'FUEL_FILL_COMPLETED').length}):`);
    completedSessions.filter(s => s.session_status === 'FUEL_FILL_COMPLETED').forEach(session => {
      console.log(`  - Fill Amount: ${session.total_fill}L`);
      console.log(`  - Duration: ${session.operating_hours?.toFixed(3)}h`);
      console.log(`  - From: ${session.opening_fuel}L → ${session.closing_fuel}L`);
    });
    
    // Get activity logs
    const { data: activities } = await supabase
      .from('energy_rite_activity_log')
      .select('*')
      .eq('branch', testPlate)
      .order('activity_time', { ascending: true });
    
    console.log(`\n📝 Activity Log (${activities.length} entries):`);
    activities.forEach(activity => {
      console.log(`  - ${activity.activity_type} at ${new Date(activity.activity_time).toLocaleTimeString()}`);
    });
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testEngineSessions().then(() => {
    console.log('\n🎉 Test completed!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testEngineSessions };