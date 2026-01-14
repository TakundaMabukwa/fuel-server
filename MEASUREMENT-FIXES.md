# Session & Fuel Fill Measurement Fixes

## Problem
When Engine ON/OFF or Fuel Fill status messages arrive, they don't contain fuel data. The system was using 0L or incorrect values, leading to inaccurate measurements.

## Solution Implemented

### 1. Engine Sessions
**Flow:**
1. **Engine ON** message arrives (no fuel data)
2. System creates session with 0L, marks as pending
3. **NEXT fuel message** arrives → Updates opening fuel
4. **Engine OFF** message arrives (no fuel data)
5. System marks for closure, waits for fuel
6. **NEXT fuel message** arrives → Completes session with closing fuel

**Measurement:**
- Duration = End time - Start time
- Fuel Usage = Opening fuel - Closing fuel
- Efficiency = Fuel usage / Duration

### 2. Fuel Fills
**Flow:**
1. **"FUEL FILL"** status arrives (no fuel data)
2. System marks as pending, waits for opening fuel
3. **NEXT fuel message** arrives → Captures opening fuel
4. **NEXT fuel message** arrives → Captures closing fuel, completes fill

**Measurement:**
- Fill Amount = Closing fuel - Opening fuel
- Duration = Time between opening and closing fuel readings

### 3. Key Fix: findClosestFuelData()
Changed from finding "closest" fuel data (before OR after) to finding **NEXT** fuel data **AFTER** status change:

```javascript
// OLD: Used closest (could be before status)
const diff = Math.abs(fuelData.timestamp - targetTime);

// NEW: Only uses data AFTER status
const diff = fuelData.timestamp - targetTime;
if (diff > 0 && diff < minDiff) { // diff > 0 = AFTER
```

## Result
✅ Accurate opening fuel (from NEXT message after Engine ON)
✅ Accurate closing fuel (from NEXT message after Engine OFF)
✅ Accurate fill measurements (opening and closing from subsequent fuel messages)
✅ Correct duration calculations
✅ Proper efficiency metrics
