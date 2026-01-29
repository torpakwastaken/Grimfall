/**
 * Game Configuration
 * 
 * IMPORTANT: Update RELAY_SERVER_URL after deploying your server!
 */

// ===========================================
// 🔧 EDIT THIS AFTER DEPLOYING YOUR SERVER
// ===========================================

// Replace with your Render URL (e.g., 'wss://grimfall-relay.onrender.com')
// Leave empty string for offline/solo mode only
export const RELAY_SERVER_URL = 'wss://grimfall.onrender.com';

// Example URLs:
// Local testing:  'ws://localhost:8080'
// Render:         'wss://your-app-name.onrender.com'
// Railway:        'wss://your-app.up.railway.app'

// ===========================================
// Other config (don't change)
// ===========================================

export const GAME_CONFIG = {
  // Set to true to enable debug logging
  debug: false,
  
  // Maximum players per room
  maxPlayers: 2,
  
  // Room code length
  roomCodeLength: 6
};
