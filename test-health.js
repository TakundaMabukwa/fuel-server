const axios = require('axios');

async function testHealth() {
  try {
    const response = await axios.get('http://localhost:4000/health');
    console.log('✅ Server is running:', response.data);
  } catch (error) {
    console.error('❌ Server error:', error.message);
  }
}

testHealth();