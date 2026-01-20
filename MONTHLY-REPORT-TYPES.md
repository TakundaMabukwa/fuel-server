# Monthly Report Types

The Excel report generation endpoint now supports two types of monthly reports.

## Endpoint

```
POST http://178.128.204.68:4000/api/energy-rite/excel-reports/generate
Content-Type: application/json
```

## Report Types

### 1. Previous Month Report (Default)

Gets the complete previous month from the 1st to the last day (28/29/30/31 depending on the month).

**Request:**
```json
{
  "report_type": "monthly",
  "cost_code": "KFC-0001-0001-0002",
  "month_type": "previous"
}
```

**OR** (month_type defaults to "previous"):
```json
{
  "report_type": "monthly",
  "cost_code": "KFC-0001-0001-0002"
}
```

**Date Range:** 
- If today is 2025-01-15, it will generate report for 2024-12-01 to 2024-12-31

---

### 2. Month-to-Date Report (Current Month)

Gets data from the 1st of the current month to today's date.

**Request:**
```json
{
  "report_type": "monthly",
  "cost_code": "KFC-0001-0001-0002",
  "month_type": "current"
}
```

**Date Range:** 
- If today is 2025-01-15, it will generate report for 2025-01-01 to 2025-01-15

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `report_type` | string | Yes | - | Must be "monthly" for monthly reports |
| `cost_code` | string | No | null | Filter by cost code (supports hierarchical filtering) |
| `site_id` | string | No | null | Filter by specific site |
| `month_type` | string | No | "previous" | "previous" for last month, "current" for month-to-date |
| `date` | string | No | today | Target date (YYYY-MM-DD format) |

---

## Examples

### Example 1: Previous Month for Specific Cost Code
```bash
curl -X POST http://178.128.204.68:4000/api/energy-rite/excel-reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "report_type": "monthly",
    "cost_code": "KFC-0001-0001-0002",
    "month_type": "previous"
  }'
```

### Example 2: Current Month-to-Date for All Sites
```bash
curl -X POST http://178.128.204.68:4000/api/energy-rite/excel-reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "report_type": "monthly",
    "month_type": "current"
  }'
```

### Example 3: Previous Month for Specific Site
```bash
curl -X POST http://178.128.204.68:4000/api/energy-rite/excel-reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "report_type": "monthly",
    "cost_code": "KFC-0001-0001-0002",
    "site_id": "BIRCHSOUTH",
    "month_type": "previous"
  }'
```

---

## Response

```json
{
  "success": true,
  "message": "monthly Excel report generated successfully and email sent",
  "data": {
    "success": true,
    "report_id": 123,
    "file_name": "Energy_Rite_monthly_Report_2024-12_2025-01-15T10-30-00.xlsx",
    "download_url": "https://...",
    "period": "2024-12",
    "report_type": "monthly",
    "generated_at": "2025-01-15T10:30:00.000Z",
    "stats": {
      "total_sites": 45,
      "total_sessions": 1250,
      "total_fills": 89,
      "total_operating_hours": 3456.78
    }
  }
}
```

---

## File Naming Convention

- **Previous Month:** `Energy_Rite_monthly_Report_2024-12_timestamp.xlsx`
- **Month-to-Date:** `Energy_Rite_monthly_Report_2025-01-MTD_timestamp.xlsx`

The `-MTD` suffix is added to month-to-date reports to distinguish them from full month reports.

---

## Cost Code Filtering

Both report types support hierarchical cost code filtering. When you provide a cost code like `KFC-0001-0001-0002`, the system will:

1. Find all child cost codes under that hierarchy
2. Get all sites associated with those cost codes
3. Filter sessions and fuel fills for those sites only

This is already working in all three endpoints you mentioned:
- ✅ Enhanced Executive Dashboard
- ✅ Activity Reports
- ✅ Snapshots
