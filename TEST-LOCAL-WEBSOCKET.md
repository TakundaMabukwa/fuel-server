# Local WebSocket Test - Session Flow with Pending Fuel Data

## Test Scenario

This test simulates a realistic 5-minute engine session for site "NEW ROAD" to verify the pending fuel data feature.

## Test Flow

1. **ENGINE ON** (0s) - Status message WITHOUT fuel data
   - Expected: Session created with opening_fuel = 0, marked as pending

2. **First Fuel Data** (5s) - Regular message WITH fuel data (500L)
   - Expected: Pending session updated with opening_fuel = 500L

3. **Regular Updates** (every 30s for 5 minutes) - Fuel decreasing gradually
   - Fuel consumption: 5L every 30 seconds (10L/hour rate)
   - 10 updates total

4. **ENGINE OFF** (5 minutes) - Status message WITHOUT fuel data
   - Expected: Session marked for closure, waiting for fuel data

5. **Closing Fuel Data** (5s after OFF) - Regular message WITH fuel data (450L)
   - Expected: Session completed with closing_fuel = 450L

## Expected Results

- **Opening Fuel**: 500L (from message #2, not message #1)
- **Closing Fuel**: 450L (from message #14, not message #13)
- **Total Consumption**: 50L
- **Duration**: 5 minutes (0.083 hours)
- **Consumption Rate**: ~10L/hour

## How to Run

### Terminal 1 - Start Local WebSocket Server
```bash
node test-local-websocket.js
```

### Terminal 2 - Start Your Application
```bash
npm start
```

## What to Watch For

### In WebSocket Server Terminal:
- Clear logging of each message sent
- Annotations showing what's expected at each step

### In Application Terminal:
- `⏳ Engine session created for NEW ROAD - Waiting for fuel data`
- `✅ Updated pending session for NEW ROAD with fuel data: 500L`
- `⏳ Engine OFF for NEW ROAD - Waiting for fuel data to complete session`
- `🔴 Engine OFF: NEW ROAD - Used: 50.0L in 0.08h`

### In Database:
Query to check the session:
```sql
SELECT 
  branch,
  session_start_time,
  session_end_time,
  opening_fuel,
  closing_fuel,
  total_usage,
  operating_hours,
  liter_usage_per_hour,
  session_status,
  notes
FROM energy_rite_operating_sessions
WHERE branch = 'NEW ROAD'
ORDER BY session_start_time DESC
LIMIT 1;
```

Expected values:
- opening_fuel: 500
- closing_fuel: 450
- total_usage: 50
- operating_hours: 0.083
- liter_usage_per_hour: ~10
- session_status: 'COMPLETED'

## Test Duration

Total test time: ~5 minutes 15 seconds
- 5 minutes for the session
- 15 seconds for setup and closure

## Sites Available

The following sites are in your lookup table:
- NEW ROAD (KFC-0001-0001-0002-0004)
- KEYWEST (KFC-0001-0001-0003)
- DURBANVILL (KFC-0001-0001-0002-0002)
- BAMBANANI (KFC-0001-0001-0003)

This test uses NEW ROAD.
