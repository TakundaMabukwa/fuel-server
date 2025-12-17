class ImprovedOnOffDetection {
  constructor() {
    this.lastStates = new Map();
  }

  detectStateChange(vehicleId, currentState) {
    const lastState = this.lastStates.get(vehicleId);
    this.lastStates.set(vehicleId, currentState);
    
    if (lastState !== undefined && lastState !== currentState) {
      return {
        changed: true,
        from: lastState,
        to: currentState
      };
    }
    
    return {
      changed: false,
      current: currentState
    };
  }
}

module.exports = ImprovedOnOffDetection;