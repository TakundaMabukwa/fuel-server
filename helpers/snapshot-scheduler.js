const cron = require('node-cron');
const activitySnapshots = require('./activity-snapshots');

// Schedule snapshots at 8:00 AM, 4:00 PM, and 12:00 AM (SA time = server time + 2)
function startSnapshotScheduler() {
  console.log('🕕 Starting Energy Rite snapshot scheduler...');
  
  // 10:00 AM server = 12:00 PM SA (end of morning slot)
  cron.schedule('0 10 * * *', async () => {
    await activitySnapshots.takeSnapshot();
  });
  
  // 6:00 PM server = 8:00 PM SA (end of afternoon slot)
  cron.schedule('0 18 * * *', async () => {
    await activitySnapshots.takeSnapshot();
  });
  
  // 2:00 AM server = 4:00 AM SA (end of evening slot)
  cron.schedule('0 2 * * *', async () => {
    await activitySnapshots.takeSnapshot();
  });
  
  console.log('✅ Snapshot scheduler started - capturing at 10:00, 18:00, and 02:00 server time');
}

module.exports = { startSnapshotScheduler };