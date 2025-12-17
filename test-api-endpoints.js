require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testAPIEndpoints() {
  console.log('🧪 Testing API Endpoints...\n');
  
  try {
    // Test health endpoint
    console.log('🏥 Testing health endpoint...');
    try {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      console.log('✅ Health check:', healthResponse.data);
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.message);
      console.log('ℹ️ Make sure the server is running with: npm start');
      return;
    }
    
    // Test vehicles endpoint
    console.log('\n🚗 Testing vehicles endpoint...');
    try {
      const vehiclesResponse = await axios.get(`${BASE_URL}/api/energy-rite/vehicles`);
      console.log('✅ Vehicles endpoint working');
      console.log(`   Found ${vehiclesResponse.data?.data?.length || 0} vehicles`);
      
      if (vehiclesResponse.data?.data?.length > 0) {
        const sampleVehicle = vehiclesResponse.data.data[0];
        console.log(`   Sample vehicle: ${sampleVehicle.branch || sampleVehicle.plate} - ${sampleVehicle.fuel_probe_1_level}L`);
      }
    } catch (error) {
      console.log('❌ Vehicles endpoint failed:', error.response?.data || error.message);
    }
    
    // Test reports endpoint
    console.log('\n📊 Testing reports endpoint...');
    try {
      const reportsResponse = await axios.get(`${BASE_URL}/api/energy-rite/reports`);
      console.log('✅ Reports endpoint working');
      console.log(`   Response: ${reportsResponse.data?.message || 'OK'}`);
    } catch (error) {
      console.log('❌ Reports endpoint failed:', error.response?.data || error.message);
    }
    
    // Test fuel analysis endpoint
    console.log('\n⛽ Testing fuel analysis endpoint...');
    try {
      const fuelResponse = await axios.get(`${BASE_URL}/api/energy-rite/fuel-analysis`);
      console.log('✅ Fuel analysis endpoint working');
      console.log(`   Response: ${fuelResponse.data?.message || 'OK'}`);
    } catch (error) {
      console.log('❌ Fuel analysis endpoint failed:', error.response?.data || error.message);
    }
    
    // Test monitoring endpoint
    console.log('\n📈 Testing monitoring endpoint...');
    try {
      const monitoringResponse = await axios.get(`${BASE_URL}/api/energy-rite/monitoring`);
      console.log('✅ Monitoring endpoint working');
      
      if (monitoringResponse.data?.data) {
        const data = monitoringResponse.data.data;
        console.log(`   Active sessions: ${data.activeSessions || 0}`);
        console.log(`   Recent activities: ${data.recentActivities || 0}`);
        console.log(`   Fuel fills today: ${data.fuelFillsToday || 0}`);
      }
    } catch (error) {
      console.log('❌ Monitoring endpoint failed:', error.response?.data || error.message);
    }
    
    // Test executive dashboard endpoint
    console.log('\n📊 Testing executive dashboard endpoint...');
    try {
      const dashboardResponse = await axios.get(`${BASE_URL}/api/energy-rite/executive-dashboard`);
      console.log('✅ Executive dashboard endpoint working');
      
      if (dashboardResponse.data?.data) {
        const data = dashboardResponse.data.data;
        console.log(`   Total sites: ${data.totalSites || 0}`);
        console.log(`   Active today: ${data.activeSitesToday || 0}`);
        console.log(`   Total fuel used: ${data.totalFuelUsed || 0}L`);
      }
    } catch (error) {
      console.log('❌ Executive dashboard endpoint failed:', error.response?.data || error.message);
    }
    
    console.log('\n✅ API endpoint testing completed!');
    
  } catch (error) {
    console.error('❌ API testing failed:', error.message);
  }
}

async function testReportGeneration() {
  console.log('\n🧪 Testing Report Generation...\n');
  
  try {
    // Test daily report generation
    console.log('📅 Testing daily report generation...');
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const reportResponse = await axios.post(`${BASE_URL}/api/energy-rite/reports/generate`, {
        reportType: 'daily',
        date: today,
        sites: ['KROONSTAD2'] // Use our test site
      });
      
      console.log('✅ Daily report generation working');
      console.log(`   Report ID: ${reportResponse.data?.reportId || 'N/A'}`);
      console.log(`   Status: ${reportResponse.data?.status || 'N/A'}`);
    } catch (error) {
      console.log('❌ Daily report generation failed:', error.response?.data || error.message);
    }
    
    // Test Excel report generation
    console.log('\n📊 Testing Excel report generation...');
    try {
      const excelResponse = await axios.post(`${BASE_URL}/api/energy-rite/excel-reports/generate`, {
        reportType: 'daily',
        date: today,
        sites: ['KROONSTAD2']
      });
      
      console.log('✅ Excel report generation working');
      console.log(`   File: ${excelResponse.data?.filename || 'N/A'}`);
    } catch (error) {
      console.log('❌ Excel report generation failed:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Report generation testing failed:', error.message);
  }
}

// Run tests
if (require.main === module) {
  console.log('🚀 Starting API Endpoint Tests...\n');
  
  testAPIEndpoints().then(() => {
    return testReportGeneration();
  }).then(() => {
    console.log('\n🎉 All API tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 API tests failed:', error);
    process.exit(1);
  });
}

module.exports = { testAPIEndpoints, testReportGeneration };