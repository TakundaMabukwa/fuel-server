# 📊 Enhanced Executive Dashboard

## Overview
The Enhanced Executive Dashboard provides **non-cumulative daily metrics** focused on operational efficiency, continuous operations detection, and executive-level insights for fuel management.

## 🎯 Key Features

### 1. **Non-Cumulative Daily Metrics**
- **Total Sites Operated**: Number of unique sites that operated on the specified date
- **Total Litres Used**: Fuel consumption for the day (resets daily, not cumulative)
- **Total Operational Hours**: Combined operational hours for all sites
- **Continuous Operations**: Sites running over 24 hours detection

### 2. **Continuous Operations Detection**
Automatically identifies sites running continuous operations (24+ hours) by analyzing:
- Session patterns and timing
- Operational streaks across multiple sessions
- Extended operation periods without significant breaks

### 3. **Real-Time Fleet Integration**
- Current fleet status and utilization
- Active vs inactive vehicle counts
- Fleet utilization percentages

## 🔌 API Endpoint

```
GET /api/energy-rite/enhanced-executive-dashboard
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `date` | string | Target date (YYYY-MM-DD) | `2025-11-07` |
| `costCode` | string | Single cost code filter | `KFC-0001` |
| `costCodes` | string | Multiple cost codes (comma-separated) | `KFC-0001,KFC-0002` |

### Example Requests

```bash
# Today's dashboard
GET /api/energy-rite/enhanced-executive-dashboard

# Specific date
GET /api/energy-rite/enhanced-executive-dashboard?date=2025-11-07

# Filtered by cost code
GET /api/energy-rite/enhanced-executive-dashboard?costCode=KFC-0001

# Multiple cost codes
GET /api/energy-rite/enhanced-executive-dashboard?costCodes=KFC-0001,KFC-0002
```

## 📋 Response Structure

```json
{
  "success": true,
  "data": {
    "date": "2025-11-07",
    "filters": {
      "cost_code": "KFC-0001",
      "cost_codes": null
    },
    
    "key_metrics": {
      "total_sites_operated": 15,
      "total_litres_used": 2847.5,
      "total_operational_hours": 245.8,
      "continuous_operations_count": 3,
      "total_operational_cost": 45678.90
    },
    
    "fleet_status": {
      "total_fleet_size": 45,
      "currently_active": 28,
      "fleet_utilization_percentage": 62.22,
      "inactive_vehicles": 17
    },
    
    "continuous_operations": {
      "sites_over_24_hours": [
        {
          "site": "JANSENPARK",
          "cost_code": "KFC-0001-0001-0003",
          "total_hours": 18.5,
          "fuel_usage": 285.7,
          "max_continuous_streak": 24.2,
          "sessions_today": 3,
          "pattern": "Long continuous run"
        }
      ],
      "count": 1,
      "total_hours": 18.5,
      "total_fuel": 285.7
    },
    
    "site_performance": [
      {
        "site_name": "JANSENPARK",
        "cost_code": "KFC-0001-0001-0003",
        "total_sessions": 3,
        "operating_hours": 18.5,
        "fuel_usage_liters": 285.7,
        "operational_cost": 4587.2,
        "is_continuous": true,
        "efficiency_liters_per_hour": 15.44,
        "cost_per_hour": 247.8
      }
    ],
    
    "cost_center_analysis": [
      {
        "cost_code": "KFC-0001-0001-0003",
        "sites_count": 5,
        "sites": ["JANSENPARK", "GERMSITON", "DENVER"],
        "operating_hours": 125.8,
        "fuel_usage_liters": 1847.5,
        "operational_cost": 28456.7,
        "sessions": 15,
        "avg_fuel_per_hour": 14.68
      }
    ],
    
    "efficiency_metrics": {
      "average_fuel_per_hour": 15.2,
      "average_cost_per_hour": 245.8,
      "average_hours_per_site": 16.4,
      "average_fuel_per_site": 189.8
    },
    
    "executive_insights": [
      "15 sites operated today with 246 total hours",
      "2848L fuel consumed (non-cumulative daily usage)",
      "3 sites running continuous operations (24+ hours)",
      "Fleet utilization: 62% (28/45 active)",
      "Average efficiency: 15.2L per hour"
    ]
  },
  "timestamp": "2025-11-07T10:30:00.000Z",
  "note": "Metrics are non-cumulative and reset daily. Continuous operations detected based on 24+ hour patterns."
}
```

## 🚀 Key Business Benefits

### 1. **Non-Cumulative Tracking**
- Daily operational snapshots without historical accumulation
- Clear visibility into daily performance variations
- Reset tracking when sites turn off and restart

### 2. **Continuous Operations Management**
- Identify sites running extended operations (24+ hours)
- Monitor fuel efficiency for continuous vs intermittent operations
- Optimize scheduling for maximum efficiency

### 3. **Executive-Level Insights**
- High-level KPIs for quick decision making
- Cost center performance comparison
- Fleet utilization and efficiency metrics

### 4. **Hierarchical Cost Center Support**
- Filter by parent cost codes to see all child operations
- Department-level and site-level breakdowns
- Multi-level organizational reporting

## 🔍 Continuous Operations Detection

The system identifies continuous operations by:

1. **Session Analysis**: Examining operational sessions across multiple days
2. **Time Gap Detection**: Identifying minimal gaps between sessions (< 4 hours)
3. **Pattern Recognition**: Detecting extended operation streaks
4. **Qualification Criteria**:
   - Daily operations > 12 hours OR
   - Maximum continuous streak > 20 hours

### Continuous Operation Patterns

- **Long Continuous Run**: Single extended session > 20 hours
- **Multiple Extended Sessions**: Several sessions with minimal gaps totaling > 12 hours daily

## 📊 Usage Examples

### Executive Daily Briefing
```bash
curl "http://localhost:4000/api/energy-rite/enhanced-executive-dashboard" | jq '.data.executive_insights'
```

### Department Performance Review
```bash
curl "http://localhost:4000/api/energy-rite/enhanced-executive-dashboard?costCode=KFC-0001" | jq '.data.cost_center_analysis'
```

### Continuous Operations Monitoring
```bash
curl "http://localhost:4000/api/energy-rite/enhanced-executive-dashboard" | jq '.data.continuous_operations'
```

### Historical Performance Analysis
```bash
curl "http://localhost:4000/api/energy-rite/enhanced-executive-dashboard?date=2025-11-06" | jq '.data.key_metrics'
```

## 🎯 Best Practices

1. **Daily Monitoring**: Check dashboard daily for operational insights
2. **Cost Code Filtering**: Use hierarchical filtering for department analysis
3. **Continuous Operations**: Monitor sites running 24+ hours for efficiency
4. **Fleet Utilization**: Track real-time fleet status for optimization
5. **Historical Comparison**: Compare daily metrics for trend analysis

## 🔧 Technical Notes

- **Data Source**: Operating sessions, vehicle status, and cost center hierarchy
- **Refresh Rate**: Real-time for fleet status, daily aggregation for operations
- **Filtering**: Supports hierarchical cost center access control
- **Performance**: Optimized queries for fast executive dashboard loading
- **Reset Logic**: Daily metrics reset automatically, no carryover between days