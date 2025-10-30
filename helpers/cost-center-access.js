const { supabase } = require('../supabase-client');

class CostCenterAccessHelper {
  
  /**
   * Get accessible cost centers based on user's cost code
   * If user has KFC-0001-0001-0002, they can access:
   * - KFC-0001-0001-0002 (exact match)
   * - KFC-0001-0001-0002-XXXX (direct children only)
   */
  async getAccessibleCostCenters(userCostCode) {
    try {
      if (!userCostCode) return [];
      
      // Get all cost centers from vehicle lookup
      const { data: allCostCenters, error } = await supabase
        .from('energyrite_vehicle_lookup')
        .select('cost_code')
        .order('cost_code');
      
      if (error) throw error;
      
      const uniqueCostCodes = [...new Set(allCostCenters.map(cc => cc.cost_code))];
      const accessibleCodes = [];
      
      // Add exact match
      if (uniqueCostCodes.includes(userCostCode)) {
        accessibleCodes.push(userCostCode);
      }
      
      // Add ALL descendants (children, grandchildren, etc.)
      uniqueCostCodes.forEach(code => {
        if (code !== userCostCode && code.startsWith(userCostCode + '-')) {
          // Include ALL levels deeper (hierarchical access)
          accessibleCodes.push(code);
        }
      });
      
      console.log(`🔐 User ${userCostCode} has access to ${accessibleCodes.length} cost centers: ${accessibleCodes.join(', ')}`);
      
      return accessibleCodes;
      
    } catch (error) {
      console.error('❌ Error getting accessible cost centers:', error);
      return [userCostCode]; // Fallback to user's own cost code
    }
  }
  
  /**
   * Check if user has access to a specific cost center
   */
  async hasAccessToCostCenter(userCostCode, targetCostCode) {
    if (!userCostCode || !targetCostCode) return false;
    
    // User has access if target cost code starts with their cost code
    return targetCostCode.startsWith(userCostCode);
  }
  
  /**
   * Filter cost centers based on user access
   */
  filterAccessibleCostCenters(userCostCode, allCostCenters) {
    if (!userCostCode) return [];
    
    return allCostCenters.filter(costCode => 
      costCode.startsWith(userCostCode)
    );
  }
  
  /**
   * Get cost center dropdown options for user
   */
  async getCostCenterDropdownOptions(userCostCode) {
    try {
      const accessibleCostCodes = await this.getAccessibleCostCenters(userCostCode);
      
      // Format for dropdown
      const options = accessibleCostCodes.map(costCode => ({
        value: costCode,
        label: costCode,
        isParent: costCode === userCostCode,
        level: costCode.split('-').length - userCostCode.split('-').length
      }));
      
      return options;
      
    } catch (error) {
      console.error('❌ Error getting dropdown options:', error);
      return [{ value: userCostCode, label: userCostCode, isParent: true, level: 0 }];
    }
  }
}

module.exports = new CostCenterAccessHelper();