const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testExecutiveDashboard() {
  console.log('👔 Testing Executive Dashboard\n');

  try {
    console.log('📊 Getting executive dashboard (last 30 days)...\n');

    const response = await axios.get(`${BASE_URL}/api/energy-rite/executive-dashboard`);
    
    if (response.data.success) {
      const data = response.data.data;
      
      console.log('✅ Executive Dashboard Response:');
      console.log('='.repeat(60));
      
      console.log('\n🚗 FLEET OVERVIEW:');
      console.log(`   Total Vehicles: ${data.fleet_overview.total_vehicles}`);
      console.log(`   Active Vehicles: ${data.fleet_overview.active_vehicles}`);
      console.log(`   Fleet Utilization: ${data.fleet_overview.fleet_utilization_percentage}%`);
      console.log(`   Total Fuel Level: ${data.fleet_overview.total_fuel_level}L`);
      console.log(`   Average Fuel %: ${data.fleet_overview.average_fuel_percentage}%`);
      
      console.log('\n⚙️ OPERATIONAL METRICS:');
      console.log(`   Total Operating Hours: ${data.operational_metrics.total_operating_hours}h`);
      console.log(`   Total Fuel Usage: ${data.operational_metrics.total_fuel_usage_liters}L`);
      console.log(`   Total Operating Cost: R${data.operational_metrics.total_operating_cost}`);
      console.log(`   Average Cost/Hour: R${data.operational_metrics.average_cost_per_hour}`);
      console.log(`   Average Fuel/Hour: ${data.operational_metrics.average_fuel_per_hour}L`);
      console.log(`   Total Sessions: ${data.operational_metrics.total_sessions}`);
      
      console.log('\n💼 TOP COST CENTERS:');
      data.cost_center_performance.slice(0, 5).forEach((cc, index) => {
        console.log(`   ${index + 1}. ${cc.cost_code}:`);
        console.log(`      Sites: ${cc.site_count} | Hours: ${cc.operating_hours.toFixed(1)}h`);
        console.log(`      Cost: R${cc.total_cost.toFixed(2)} | Fuel: ${cc.fuel_usage.toFixed(1)}L`);
      });
      
      console.log('\n🏆 TOP PERFORMING SITES:');
      data.top_performing_sites.slice(0, 5).forEach((site, index) => {
        console.log(`   ${index + 1}. ${site.site}:`);
        console.log(`      Hours: ${site.operating_hours.toFixed(1)}h | Cost: R${site.total_cost.toFixed(2)}`);
        console.log(`      Efficiency: ${site.efficiency.toFixed(1)}L/h`);
      });
      
      console.log('\n📈 ACTIVITY TRENDS (Last 7 days):');
      data.activity_trends.slice(-7).forEach(trend => {
        console.log(`   ${trend.date}: ${trend.avg_activity.toFixed(1)} avg active vehicles`);
      });
      
      console.log('\n💡 KEY INSIGHTS:');
      data.key_insights.forEach((insight, index) => {
        console.log(`   ${index + 1}. ${insight}`);
      });
      
      console.log(`\n📅 Period: ${data.period.start_date} to ${data.period.end_date} (${data.period.days} days)`);
        
    } else {
      console.log('❌ Executive Dashboard failed:', response.data.error);
    }

  } catch (error) {
    console.log('❌ Executive Dashboard error:', error.response?.data?.error || error.message);
  }
}

testExecutiveDashboard().catch(console.error);