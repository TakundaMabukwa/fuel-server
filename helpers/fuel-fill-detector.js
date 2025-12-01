const { supabase } = require('../supabase-client');

/**
 * Fuel Fill Detection System
 * Detects fuel fills when there's a significant increase in fuel level
 */

const FUEL_FILL_CONFIG = {
    // Minimum fuel increase to consider as a fill (in liters)
    MIN_FILL_AMOUNT: 0.1,
    
    // Maximum time window for fill detection (in minutes)
    MAX_TIME_WINDOW: 120,
    
    // Minimum percentage increase to consider
    MIN_PERCENTAGE_INCREASE: 0.1
};

/**
 * Detect fuel fill based on fuel level increase
 * @param {string} plate - Vehicle plate number
 * @param {number} currentFuelLevel - Current fuel level
 * @param {string} driverName - Driver name status
 * @returns {Object} Fill detection result
 */
async function detectFuelFill(plate, currentFuelLevel, driverName) {
    try {
        // Parse and validate current fuel level
        const parsedCurrentFuel = parseFloat(currentFuelLevel);
        if (!parsedCurrentFuel || parsedCurrentFuel <= 0 || isNaN(parsedCurrentFuel)) {
            return { isFill: false, reason: 'Invalid fuel level' };
        }

        // Check if "Possible Fuel Fill" or "Fuel Fill" is in driver name
        const hasFillStatus = driverName && (
            driverName.toLowerCase().includes('possible fuel fill') ||
            driverName.toLowerCase().includes('fuel fill') ||
            driverName.toLowerCase().includes('refuel') ||
            driverName.toLowerCase().includes('filling')
        );

        // Get recent fuel data for comparison (filter out null values)
        const { data: recentData, error } = await supabase
            .from('energy_rite_fuel_data')
            .select('*')
            .eq('plate', plate)
            .not('fuel_probe_1_level', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw new Error(`Database error: ${error.message}`);

        // Filter out entries with null or invalid fuel levels
        const validData = recentData.filter(entry => {
            const fuel = parseFloat(entry.fuel_probe_1_level);
            return fuel && fuel > 0 && !isNaN(fuel);
        });

        if (validData.length < 2) {
            return { isFill: false, reason: 'Insufficient valid data for comparison' };
        }

        const current = validData[0];
        const previous = validData[1];
        const currentTime = new Date();
        const previousTime = new Date(previous.created_at);

        // Calculate time difference
        const timeDiffMinutes = (currentTime - previousTime) / (1000 * 60);

        // Skip if time difference is too large
        if (timeDiffMinutes > FUEL_FILL_CONFIG.MAX_TIME_WINDOW) {
            return { isFill: false, reason: 'Time gap too large' };
        }

        const previousFuel = parseFloat(previous.fuel_probe_1_level);
        const currentFuel = parseFloat(current.fuel_probe_1_level);
        const fuelIncrease = currentFuel - previousFuel;
        const fuelIncreasePercentage = previousFuel > 0 ? (fuelIncrease / previousFuel) * 100 : 0;

        // Check fill conditions
        const fillConditions = {
            significantIncrease: fuelIncrease >= FUEL_FILL_CONFIG.MIN_FILL_AMOUNT,
            percentageIncrease: fuelIncreasePercentage >= FUEL_FILL_CONFIG.MIN_PERCENTAGE_INCREASE,
            withinTimeWindow: timeDiffMinutes <= FUEL_FILL_CONFIG.MAX_TIME_WINDOW,
            statusIndicatesFill: hasFillStatus,
            positiveIncrease: fuelIncrease > 0
        };

        // Detect any positive fuel increase OR status indication
        const isFill = fillConditions.statusIndicatesFill || 
                      (fillConditions.positiveIncrease && fillConditions.withinTimeWindow);

        if (isFill) {
            // Get cost code and company for this vehicle
            const { data: vehicleInfo } = await supabase
                .from('energyrite_vehicle_lookup')
                .select('cost_code, company')
                .eq('plate', plate)
                .single();

            // Log fuel fill
            const fillRecord = await supabase
                .from('energy_rite_fuel_fills')
                .insert({
                    plate: plate,
                    cost_code: vehicleInfo?.cost_code || null,
                    company: vehicleInfo?.company || 'KFC',
                    fill_date: currentTime.toISOString(),
                    fuel_before: previousFuel,
                    fuel_after: currentFuel,
                    fill_amount: fuelIncrease,
                    fill_percentage: fuelIncreasePercentage,
                    detection_method: hasFillStatus ? 'STATUS_INDICATOR' : 'LEVEL_INCREASE',
                    status: 'detected',
                    fill_data: {
                        timeDiffMinutes: timeDiffMinutes.toFixed(2),
                        conditions: fillConditions,
                        driver_status: driverName,
                        cost_code: vehicleInfo?.cost_code,
                        company: vehicleInfo?.company
                    }
                });

            if (fillRecord.error) {
                console.error('Error logging fuel fill:', fillRecord.error);
            }

            // Log activity
            await supabase.from('energy_rite_activity_log').insert({
                activity_type: 'FUEL_FILL',
                description: `Fuel fill detected for ${plate}: +${fuelIncrease.toFixed(1)}L`,
                branch: plate,
                activity_data: {
                    previous_fuel: previousFuel,
                    current_fuel: currentFuel,
                    fill_amount: fuelIncrease,
                    fill_percentage: fuelIncreasePercentage.toFixed(2),
                    detection_method: hasFillStatus ? 'STATUS_INDICATOR' : 'LEVEL_INCREASE',
                    timestamp: currentTime.toISOString()
                }
            });

            const fillInfo = {
                isFill: true,
                vehicle: {
                    plate: plate
                },
                fillDetails: {
                    previousFuel: previousFuel,
                    currentFuel: currentFuel,
                    fillAmount: fuelIncrease,
                    fillPercentage: fuelIncreasePercentage.toFixed(2),
                    timeDiffMinutes: timeDiffMinutes.toFixed(2),
                    fillTime: currentTime,
                    detectionMethod: hasFillStatus ? 'STATUS_INDICATOR' : 'LEVEL_INCREASE'
                },
                conditions: fillConditions
            };

            console.log(`⛽ FUEL FILL DETECTED! Vehicle: ${plate} - Fill: +${fuelIncrease.toFixed(1)}L (${fuelIncreasePercentage.toFixed(1)}%) - Method: ${fillInfo.fillDetails.detectionMethod}`);

            return fillInfo;
        } else {
            return { 
                isFill: false, 
                reason: 'No significant fuel increase detected',
                details: {
                    fuelIncrease: fuelIncrease,
                    fuelIncreasePercentage: fuelIncreasePercentage.toFixed(2),
                    timeDiffMinutes: timeDiffMinutes.toFixed(2),
                    conditions: fillConditions
                }
            };
        }

    } catch (error) {
        console.error('Error detecting fuel fill:', error.message);
        return { isFill: false, reason: 'Detection error', error: error.message };
    }
}

/**
 * Get fuel fill statistics
 * @returns {Object} Fill statistics
 */
async function getFuelFillStatistics() {
    try {
        const { data: fillData, error: fillError } = await supabase
            .from('energy_rite_fuel_fills')
            .select('*')
            .order('fill_date', { ascending: false });

        if (fillError) throw new Error(`Database error: ${fillError.message}`);

        // Get recent fills (last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentFills = fillData.filter(fill => fill.fill_date >= yesterday);

        // Get unique vehicles
        const uniqueVehicles = [...new Set(fillData.map(f => f.plate))];

        return {
            statistics: {
                total_vehicles_with_fills: uniqueVehicles.length,
                total_fill_events: fillData.length,
                recent_fills: recentFills.length,
                total_fuel_filled: fillData.reduce((sum, f) => sum + parseFloat(f.fill_amount || 0), 0)
            },
            recentFills: recentFills.slice(0, 10).map(fill => ({
                plate: fill.plate,
                fill_date: fill.fill_date,
                fuel_before: fill.fuel_before,
                fuel_after: fill.fuel_after,
                fill_amount: fill.fill_amount,
                detection_method: fill.detection_method
            }))
        };
    } catch (error) {
        console.error('Error getting fuel fill statistics:', error.message);
        return { error: error.message };
    }
}

/**
 * Get fuel fills for a specific vehicle
 * @param {string} plate - Vehicle plate number
 * @param {number} days - Number of days to look back
 * @returns {Object} Vehicle fill history
 */
async function getVehicleFillHistory(plate, days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: fillData, error } = await supabase
            .from('energy_rite_fuel_fills')
            .select('*')
            .eq('plate', plate)
            .gte('fill_date', startDate)
            .order('fill_date', { ascending: false });

        if (error) throw new Error(`Database error: ${error.message}`);

        return {
            success: true,
            vehicle: plate,
            period_days: days,
            total_fills: fillData.length,
            total_fuel_filled: fillData.reduce((sum, f) => sum + parseFloat(f.fill_amount || 0), 0),
            fills: fillData
        };
    } catch (error) {
        console.error('Error getting vehicle fill history:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    detectFuelFill,
    getFuelFillStatistics,
    getVehicleFillHistory,
    FUEL_FILL_CONFIG
};