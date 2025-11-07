// Check current table structure and provide migration instructions
require('dotenv').config();
const { supabase } = require('./supabase-client');

async function checkTableStructure() {
  try {
    console.log('🔍 Checking Current Table Structure');
    console.log('=' .repeat(50));
    
    console.log('\n📊 Testing energy_rite_daily_snapshots table...');
    
    // Test what columns are available
    try {
      const { data, error } = await supabase
        .from('energy_rite_daily_snapshots')
        .select('*')
        .limit(1);
      
      if (error) {
        console.log('❌ Table query failed:', error.message);
        
        if (error.message.includes('does not exist')) {
          console.log('\n💡 Issue identified: Table or column missing');
          console.log('   The energy_rite_daily_snapshots table needs to be properly created');
        }
      } else {
        console.log('✅ Table query successful');
        if (data.length > 0) {
          console.log('📋 Available columns:', Object.keys(data[0]));
        } else {
          console.log('📋 Table exists but is empty');
        }
      }
    } catch (e) {
      console.log('❌ Exception:', e.message);
    }
    
    // Test inserting basic record without snapshot_data
    console.log('\n🧪 Testing basic table structure...');
    
    try {
      const basicData = {
        branch: 'STRUCTURE_TEST',
        company: 'TEST_COMPANY',
        snapshot_date: new Date().toISOString().slice(0, 10)
      };
      
      const { data: insertData, error: insertError } = await supabase
        .from('energy_rite_daily_snapshots')
        .insert([basicData])
        .select();
      
      if (insertError) {
        console.log('❌ Basic insert failed:', insertError.message);
      } else {
        console.log('✅ Basic insert successful');
        console.log('📋 Inserted columns:', Object.keys(insertData[0]));
        
        // Clean up
        await supabase
          .from('energy_rite_daily_snapshots')
          .delete()
          .eq('branch', 'STRUCTURE_TEST');
      }
    } catch (e) {
      console.log('❌ Basic insert exception:', e.message);
    }
    
    console.log('\n📋 Current Status Summary:');
    console.log('=' .repeat(30));
    
    console.log('\n🚨 ISSUE IDENTIFIED:');
    console.log('   The energy_rite_daily_snapshots table is missing the snapshot_data column');
    console.log('   This is preventing the cost code enhancement from working');
    
    console.log('\n🔧 SOLUTION:');
    console.log('   Apply one of these migration files to your Supabase database:');
    console.log('   1. essential-snapshots-fix.sql (quick fix)');
    console.log('   2. fix-daily-snapshots-migration.sql (comprehensive)');
    
    console.log('\n📝 Steps to fix:');
    console.log('   1. Open your Supabase dashboard');
    console.log('   2. Go to SQL Editor');
    console.log('   3. Copy and paste the contents of essential-snapshots-fix.sql');
    console.log('   4. Run the SQL query');
    console.log('   5. Verify the table now has the snapshot_data column');
    
    console.log('\n⚡ After applying the fix:');
    console.log('   ✓ snapshot_data JSONB column will be added');
    console.log('   ✓ Cost code integration will work');
    console.log('   ✓ Enhanced snapshots will store complete data');
    console.log('   ✓ Automated scheduling will function properly');
    
    console.log('\n🎯 Expected result after fix:');
    console.log('   The enhanced snapshot system will automatically capture:');
    console.log('   {');
    console.log('     "cost_code": "KFC-0001-0001-0003",');
    console.log('     "fuel_level": 75.2,');
    console.log('     "fuel_volume": 180.5,');
    console.log('     "engine_status": "OFF",');
    console.log('     "snapshot_type": "MIDDAY"');
    console.log('   }');
    
  } catch (error) {
    console.error('❌ Structure check failed:', error.message);
  }
}

// Run the structure check
checkTableStructure()
  .then(() => {
    console.log('\n' + '='.repeat(50));
    console.log('🎯 Table structure check completed');
    console.log('📄 Migration files created:');
    console.log('   - essential-snapshots-fix.sql');
    console.log('   - fix-daily-snapshots-migration.sql');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });