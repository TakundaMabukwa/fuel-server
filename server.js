require('dotenv').config();
const express = require('express');
const cors = require('cors');
const EnergyRiteWebSocketClient = require('./websocket-client');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/energy-rite', require('./routes/energy-rite-data'));
app.use('/api/energy-rite/vehicles', require('./routes/energy-rite-vehicles'));
app.use('/api/energy-rite/reports', require('./routes/energy-rite-reports'));
app.use('/api/energy-rite/report-storage', require('./routes/energy-rite-report-storage'));
app.use('/api/energy-rite/fuel-analysis', require('./routes/energy-rite-fuel-analysis'));
app.use('/api/energy-rite/emails', require('./routes/energy-rite-emails'));
app.use('/api/energy-rite/excel-reports', require('./routes/energy-rite-excel-reports'));
app.use('/api/energy-rite/activity-reports', require('./routes/energy-rite-activity-reports'));
app.use('/api/energy-rite/monitoring', require('./routes/energy-rite-monitoring'));
app.use('/api/energy-rite/executive-dashboard', require('./routes/energy-rite-executive-dashboard'));
app.use('/api/cost-center-access', require('./routes/cost-center-access'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'EnergyRite Supabase Server'
  });
});

// Initialize WebSocket client
const wsClient = new EnergyRiteWebSocketClient(process.env.WEBSOCKET_URL);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 EnergyRite Supabase server running on port ${PORT}`);
  
  // Connect to WebSocket for real-time data
  wsClient.connect();
  
  // Run session cleanup every hour
  const { cleanupOrphanedSessions } = require('./helpers/session-cleanup');
  setInterval(cleanupOrphanedSessions, 60 * 60 * 1000);
  
  // Run initial cleanup after 5 minutes
  setTimeout(cleanupOrphanedSessions, 5 * 60 * 1000);
  
  // Schedule activity snapshots
  const activitySnapshots = require('./helpers/activity-snapshots');
  
  // Take snapshots at specific times: 9AM, 2PM, 8PM
  const scheduleSnapshots = () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Check if it's time for a snapshot (9, 14, 20)
    if ([9, 14, 20].includes(hour) && now.getMinutes() === 0) {
      activitySnapshots.takeSnapshot();
    }
  };
  
  // Check every minute for snapshot times
  setInterval(scheduleSnapshots, 60 * 1000);
  
  // Take initial snapshot after 2 minutes
  setTimeout(() => activitySnapshots.takeSnapshot(), 2 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  wsClient.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  wsClient.close();
  process.exit(0);
});

module.exports = { app, wsClient };