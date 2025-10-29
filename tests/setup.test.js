describe('EnergyRite Supabase Server Setup', () => {
  test('should load environment variables', () => {
    require('dotenv').config();
    expect(process.env.WEBSOCKET_URL).toBe('ws://64.227.138.235:8005');
    expect(process.env.PORT).toBe('4000');
  });

  test('should have required dependencies', () => {
    const packageJson = require('../package.json');
    expect(packageJson.dependencies).toHaveProperty('@supabase/supabase-js');
    expect(packageJson.dependencies).toHaveProperty('express');
    expect(packageJson.dependencies).toHaveProperty('ws');
  });

  test('should load WebSocket client class', () => {
    const EnergyRiteWebSocketClient = require('../websocket-client');
    expect(typeof EnergyRiteWebSocketClient).toBe('function');
  });
});