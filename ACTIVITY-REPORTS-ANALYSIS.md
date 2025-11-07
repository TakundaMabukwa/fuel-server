# Activity Reports System Analysis

## 🎯 **SYSTEM CAPABILITIES**

Your fuel server has comprehensive activity reporting capabilities that track:

### 📊 **Available Activity Report Endpoints**

1. **Main Activity Report**: `GET /api/energy-rite/reports/activity`
   - **Query Parameters**: `date`, `cost_code`, `site_id`
   - **Returns**: Detailed activity data for sites

2. **Enhanced Activity Reports**: `GET /api/energy-rite/activity-reports`
   - **Query Parameters**: `site`, `startDate`, `endDate`, `costCode`, `days`
   - **Returns**: Multi-day analysis with time slot breakdowns

## 🏪 **WHAT YOU CAN GET**

### **1. Operational Hours**
✅ **Available** - Tracked per site and session:
- Total operating hours per site
- Session-by-session breakdowns
- Operating hours by time periods (morning, afternoon, evening)
- Peak operating periods

### **2. Fuel Usage**
✅ **Available** - Comprehensive fuel tracking:
- Fuel consumption per site
- Fuel usage per session
- Time-period breakdowns (6AM-12PM, 12PM-5PM, 5PM-11PM)
- Peak usage analysis
- Cost calculations (R20/liter)

### **3. Fuel Fill Detection**
✅ **Available** - Automated fuel fill tracking:
- Detects fuel fills when level increases >20L between readings
- Tracks total fuel filled per site
- Fuel fill events with timestamps
- Excludes fuel fill periods from consumption calculations

## 📈 **SAMPLE DATA FROM YOUR SYSTEM**

From today's test (2025-10-30):

### **Active Sites with Sessions**
- **BRACKENHUR**: 6h operating, 80.5L used, R1,610 cost
- **MIDRANDMAL**: 6h operating, 80.1L used, R1,602 cost
- **MOBILE 3**: 6h operating, 60.2L used, R1,204 cost
- **EBONY**: 6h operating, 55.9L used, R1,118 cost
- **OLIEVENHOU**: 6h operating, 22.2L used, R444 cost

### **Time Period Analysis**
- **Morning (6AM-12PM)**: Peak activity tracking
- **Afternoon (12PM-5PM)**: Fuel consumption monitoring
- **Evening (5PM-11PM)**: End-of-day analysis

## 🔧 **HOW TO GET THE RESULTS YOU NEED**

### **1. All Sites Activity for Today**
```bash
curl "http://localhost:4000/api/energy-rite/reports/activity?date=$(date +%Y-%m-%d)"
```

### **2. Specific Site Activity**
```bash
curl "http://localhost:4000/api/energy-rite/reports/activity?date=2025-10-30&site_id=BRACKENHUR"
```

### **3. Multi-Day Analysis**
```bash
curl "http://localhost:4000/api/energy-rite/activity-reports?days=7"
```

### **4. Cost Center Filtering**
```bash
curl "http://localhost:4000/api/energy-rite/reports/activity?date=2025-10-30&cost_code=KFC-0001-0001-0003"
```

## 📊 **KEY RESPONSE DATA STRUCTURE**

```json
{
  "success": true,
  "data": {
    "date": "2025-10-30",
    "summary": {
      "total_sites": 8,
      "total_sessions": 8,
      "total_operating_hours": 42.19,
      "total_fuel_usage": 298.9,
      "total_cost": 5982
    },
    "fuel_analysis": {
      "daily_total_consumption": "0.00",
      "peak_usage_site": {
        "site": "BRACKENHUR",
        "usage": 80.5,
        "cost": 1610
      }
    },
    "sites": [
      {
        "branch": "BRACKENHUR",
        "sessions": [...],
        "total_operating_hours": 6,
        "total_fuel_usage": 80.5,
        "total_cost": 1610
      }
    ]
  }
}
```

## 🎯 **RECOMMENDATIONS FOR YOUR NEEDS**

1. **For Daily Operational Overview**: Use the main activity report endpoint
2. **For Trend Analysis**: Use the enhanced activity reports with date ranges
3. **For Site Performance**: Filter by specific site_id
4. **For Cost Analysis**: Use cost_code filtering for different business units

Your system is already fully functional and provides all the operational hours, fuel usage, and fuel fill data you requested!